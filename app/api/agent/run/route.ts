import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { agentRuntimeMetadata, buyerIntentRequestSchema, runBuyerIntentAgent } from "../../../../lib/agent/index";
import {
  assertRateLimit,
  assertSameOriginJsonAction,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";
import { canExecuteLiveDemo } from "../../../../lib/security/demo-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const modelConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const modelAccessUnlocked = modelConfigured && canExecuteLiveDemo(request);
  return NextResponse.json(
    {
      configured: modelConfigured,
      mode: modelAccessUnlocked ? "openai_responses" : "deterministic_fallback",
      modelAccessUnlocked,
      ...agentRuntimeMetadata,
    },
    { headers: noStoreHeaders },
  );
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginJsonAction(request, "interpret-buyer-intent");
    assertRateLimit(request, "buyer-intent", { maxRequests: 10 });
    const payload = buyerIntentRequestSchema.parse(await readLimitedJson(request));
    // Same-origin headers are CSRF controls, not a spend boundary. Production
    // model calls therefore require the server-minted demo session. Public
    // visitors still get the bounded deterministic parser, which makes this
    // route useful without exposing an unmetered OpenAI billing surface.
    const result = await runBuyerIntentAgent(payload.intent, {
      apiKey: canExecuteLiveDemo(request) ? undefined : null,
    });
    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { status: "rejected", code: error.code, message: error.message },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          status: "rejected",
          code: "INVALID_INTENT",
          message: "Describe a purchase intent in 12 to 600 characters.",
        },
        { status: 400, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      {
        status: "unavailable",
        code: "AGENT_RUNTIME_UNAVAILABLE",
        message: "The buyer agent could not process this request.",
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
