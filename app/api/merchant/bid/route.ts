import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertRateLimit, assertSameOriginJsonAction, noStoreHeaders, readLimitedJson, RequestBoundaryError } from "../../../../lib/agent/http";
import { evaluateMerchantBid, merchantBidRequestSchema } from "../../../../lib/agent/merchant";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOriginJsonAction(request, "evaluate-merchant-bid");
    assertRateLimit(request, "merchant-bid", { maxRequests: 20 });
    const payload = merchantBidRequestSchema.parse(await readLimitedJson(request));
    return NextResponse.json(evaluateMerchantBid(payload), { headers: noStoreHeaders });
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
          code: "INVALID_BID",
          message: "Bid terms failed strict validation.",
        },
        { status: 400, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      {
        status: "unavailable",
        code: "BID_EVALUATION_UNAVAILABLE",
        message: "The bid could not be evaluated.",
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
