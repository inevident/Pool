import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertRateLimit, assertSameOriginJsonAction, noStoreHeaders, readLimitedJson, RequestBoundaryError } from "../../../../lib/agent/http";
import { merchantBidRequestSchema } from "../../../../lib/agent/merchant";
import {
  evaluateMerchantBidRuntime,
  MerchantBidRuntimeError,
} from "../../../../lib/agent/merchant-runtime";
import { MonadRegistryError } from "../../../../lib/monad/server";
import { canExecuteLiveDemo } from "../../../../lib/security/demo-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginJsonAction(request, "evaluate-merchant-bid");
    assertRateLimit(request, "merchant-bid", { maxRequests: 20 });
    const payload = merchantBidRequestSchema.parse(await readLimitedJson(request));
    const result = await evaluateMerchantBidRuntime(payload, {
      chainWriteAuthorized: canExecuteLiveDemo(request),
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
          code: "INVALID_BID",
          message: "Bid terms failed strict validation.",
        },
        { status: 400, headers: noStoreHeaders },
      );
    }
    if (error instanceof MerchantBidRuntimeError) {
      return NextResponse.json(
        {
          status: "unavailable",
          code: error.code,
          message: error.publicMessage,
        },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    if (error instanceof MonadRegistryError) {
      return NextResponse.json(
        {
          status: "unavailable",
          code: error.code,
          message:
            "Monad could not prove today's finalized funding commitment or finalize the offer. The bid was not admitted.",
        },
        { status: 502, headers: noStoreHeaders },
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
