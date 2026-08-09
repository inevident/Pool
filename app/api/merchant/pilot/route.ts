import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  assertRateLimit,
  assertSameOriginJsonAction,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";
import { evaluateMerchantBid } from "../../../../lib/agent/merchant";
import { sellerPilotContract } from "../../../merchant/contract";

export const dynamic = "force-dynamic";

const sellerPilotBidSchema = z
  .object({
    unitPriceCents: z.number().int().min(1).max(1_000_000),
    deliveryDays: z.number().int().min(1).max(30),
    warrantyMonths: z.number().int().min(0).max(120),
  })
  .strict();

const noWriteBoundary = {
  financialAuthorization: "not_requested",
  externalWrites: false,
  aggregateOrderPlaced: false,
  providerBoundary: {
    rain: "not_contacted",
    monad: "not_contacted",
    orderSystem: "not_contacted",
  },
} as const;

function rejectedResponse(
  status: number,
  code: string,
  message: string,
) {
  return NextResponse.json(
    {
      status: "invalid_request",
      code,
      message,
      ...noWriteBoundary,
    },
    { status, headers: noStoreHeaders },
  );
}

export async function GET() {
  return NextResponse.json(sellerPilotContract, {
    headers: noStoreHeaders,
  });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginJsonAction(request, "evaluate-seller-pilot");
    assertRateLimit(request, "merchant-pilot", { maxRequests: 20 });
    const input = sellerPilotBidSchema.parse(await readLimitedJson(request));

    // Identity, quantity, and RFP version are deliberately server-owned. This
    // public pilot evaluates one prequalified fixture profile and cannot enroll
    // a merchant, submit an offer, create an order, or contact a provider.
    const evaluation = evaluateMerchantBid({
      merchantId: "merchant-signal",
      unitPriceCents: input.unitPriceCents,
      deliveryDays: input.deliveryDays,
      warrantyMonths: input.warrantyMonths,
      rfpVersion: sellerPilotContract.rfp.version,
    });
    const eligible = evaluation.policy.passed;

    return NextResponse.json(
      {
        status: eligible ? "eligible" : "rejected",
        mode: "seller_pilot_fixture",
        message: eligible
          ? "These terms fit the blinded fixture policy and would be eligible for ranking. They were not submitted, recorded onchain, or authorized."
          : "One or more blinded fixture policies rejected these terms. No private threshold was disclosed and no external action occurred.",
        evidence: {
          kind: "product_integration_artifact",
          tractionClaimed: false,
          liveRetailerConnected: false,
          binding: false,
        },
        serverPinned: {
          rfpId: sellerPilotContract.rfp.id,
          rfpVersion: sellerPilotContract.rfp.version,
          committedQuantity: sellerPilotContract.rfp.committedQuantity,
          supplierProfile: "prequalified_sandbox_fixture",
        },
        offer: {
          unitPriceCents: evaluation.bid.unitPriceCents,
          grossOrderValueCents: evaluation.bid.totalCents,
          deliveryDate: evaluation.bid.deliveryDate,
          warrantyMonths: evaluation.bid.warrantyMonths,
          termsFingerprint: evaluation.bid.termsFingerprint,
        },
        checks: evaluation.policy.checks.map((check) => ({
          code: check.code,
          label: check.label,
          passed: check.passed,
          detail: check.detail,
        })),
        ...noWriteBoundary,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return rejectedResponse(error.status, error.code, error.message);
    }
    if (error instanceof ZodError) {
      return rejectedResponse(
        400,
        "INVALID_PILOT_BID",
        "Price, delivery, and warranty must be bounded whole-number terms. Merchant identity, quantity, and RFP version cannot be supplied by the browser.",
      );
    }
    return rejectedResponse(
      503,
      "PILOT_EVALUATION_UNAVAILABLE",
      "The deterministic pilot evaluation is temporarily unavailable.",
    );
  }
}
