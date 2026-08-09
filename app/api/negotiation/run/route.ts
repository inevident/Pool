import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  assertRateLimit,
  assertSameOriginJsonAction,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";
import {
  buildNegotiationTranscript,
  DemandCurveError,
  MACBOOK_DEMAND_SCENARIO,
  negotiateDemandCurve,
  type DemandCurveInput,
} from "../../../../lib/negotiation/index";

export const dynamic = "force-dynamic";

const pledgeSchema = z
  .object({
    discountBps: z.number().int().min(0).max(9_000),
    buyerCount: z.number().int().min(1).max(1_000_000),
    unitsPerBuyer: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const runRequestSchema = z
  .object({
    productLabel: z.string().trim().min(1).max(80),
    msrpUnitCents: z.number().int().min(1).max(100_000_000),
    pledges: z.array(pledgeSchema).min(1).max(8),
  })
  .strict();

export function GET() {
  // A reviewer can pull the canonical scenario without any browser state.
  const clearing = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO);
  return NextResponse.json(
    {
      scenario: MACBOOK_DEMAND_SCENARIO,
      clearing,
      transcript: buildNegotiationTranscript(clearing),
    },
    { headers: noStoreHeaders },
  );
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginJsonAction(request, "run-negotiation");
    assertRateLimit(request, "run-negotiation", { maxRequests: 20 });

    const raw = await readLimitedJson(request, 4_096);
    const input: DemandCurveInput =
      raw && typeof raw === "object" && Object.keys(raw as object).length > 0
        ? runRequestSchema.parse(raw)
        : MACBOOK_DEMAND_SCENARIO;

    const clearing = negotiateDemandCurve(input);
    const transcript = buildNegotiationTranscript(clearing);

    return NextResponse.json({ clearing, transcript }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { status: "rejected", code: error.code, message: error.message },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { status: "rejected", code: "INVALID_CURVE", message: "Provide a product label, MSRP in cents, and 1–8 demand pledges." },
        { status: 400, headers: noStoreHeaders },
      );
    }
    if (error instanceof DemandCurveError) {
      return NextResponse.json(
        { status: "rejected", code: error.code, message: error.message },
        { status: 400, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      { status: "unavailable", code: "NEGOTIATION_UNAVAILABLE", message: "The negotiation engine could not process this request." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
