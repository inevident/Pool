import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  productIntentRequestSchema,
  runProductIntentAgent,
} from "../../../../lib/agent/product-intent";
import {
  assertRateLimit,
  assertSameOriginJsonAction,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";
import { canExecuteLiveDemo } from "../../../../lib/security/demo-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginJsonAction(request, "interpret-product-intent");
    assertRateLimit(request, "product-intent", { maxRequests: 8 });
    const payload = productIntentRequestSchema.parse(
      await readLimitedJson(request, 1_024),
    );

    // Same-origin is a request-integrity boundary, not permission to incur a
    // model call. In production, canExecuteLiveDemo only succeeds for a valid
    // server-minted protected demo session. Everyone else receives the same
    // deterministic catalog decision without a billable provider request.
    const result = await runProductIntentAgent(payload.intent, {
      apiKey: canExecuteLiveDemo(request)
        ? process.env.OPENAI_API_KEY?.trim() || null
        : null,
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
          code: "INVALID_PRODUCT_INTENT",
          message:
            "Describe one catalog purchase with quantity, maximum unit price, and wait window in 12 to 500 characters.",
        },
        { status: 400, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      {
        status: "unavailable",
        code: "PRODUCT_INTENT_AGENT_UNAVAILABLE",
        message: "The buyer intent agent could not process this request.",
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
