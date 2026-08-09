import { z } from "zod";
import {
  calculateOfferTotal,
  evaluateOfferPolicies,
  fingerprintOfferTerms,
  HERO_DEMO,
  HERO_INTENTS,
  HERO_MERCHANTS,
  HERO_PAYMENT_RAIL_CAP_CENTS,
  HERO_PRODUCT,
  HERO_PRODUCTS,
  type MerchantOffer,
} from "../market/index.ts";
import type { AgentTraceStep } from "./index.ts";

const merchantIds = ["merchant-keystone", "merchant-northstar", "merchant-signal"] as const;

export const merchantBidRequestSchema = z
  .object({
    merchantId: z.enum(merchantIds),
    unitPriceCents: z.number().int().min(1).max(1_000_000),
    deliveryDays: z.number().int().min(1).max(30),
    warrantyMonths: z.number().int().min(0).max(120),
    rfpVersion: z.number().int().min(1).max(1_000),
  })
  .strict();

export type MerchantBidRequest = z.infer<typeof merchantBidRequestSchema>;

export interface MerchantBidEvaluationOptions {
  /**
   * The HTTP runtime supplies this value from its own clock. The deterministic
   * default keeps direct policy rehearsals and fixtures repeatable.
   */
  readonly issuedAt?: string;
  readonly validUntil?: string;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function evaluateMerchantBidWithOffer(
  rawInput: unknown,
  options: MerchantBidEvaluationOptions = {},
) {
  const input = merchantBidRequestSchema.parse(rawInput);
  const merchant = HERO_MERCHANTS.find((candidate) => candidate.id === input.merchantId);
  if (!merchant) throw new Error("Registered merchant was not found.");

  const baseOffer = HERO_DEMO.negotiation.finalOffers.find(
    (offer) => offer.merchantId === input.merchantId,
  );
  if (!baseOffer) throw new Error("Merchant has no offer template for this RFP.");

  const rfpMatches = input.rfpVersion === HERO_DEMO.fundedCoalition.version;
  const issuedAt = options.issuedAt ?? "2026-08-08T17:14:00.000Z";
  const validUntil = options.validUntil ?? "2026-08-08T17:30:00.000Z";
  const issuedAtMs = Date.parse(issuedAt);
  const validUntilMs = Date.parse(validUntil);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(validUntilMs) ||
    validUntilMs <= issuedAtMs
  ) {
    throw new Error("Bid issue and expiry times must form a valid server window.");
  }
  const bid: MerchantOffer = {
    ...baseOffer,
    id: `judge-bid:${input.merchantId}:${input.rfpVersion}:${input.unitPriceCents}:${input.deliveryDays}:${input.warrantyMonths}`,
    revision: baseOffer.revision + 1,
    supersedesOfferId: baseOffer.id,
    quantity: HERO_DEMO.fundedCoalition.totalQuantity,
    unitPriceCents: input.unitPriceCents,
    shippingCents: 0,
    totalCents: input.unitPriceCents * HERO_DEMO.fundedCoalition.totalQuantity,
    deliveryDate: addDays(issuedAt, input.deliveryDays),
    warrantyMonths: input.warrantyMonths,
    issuedAt,
    validUntil,
    status: "active",
  };

  if (bid.totalCents !== calculateOfferTotal(bid)) {
    throw new Error("Bid arithmetic did not reconcile.");
  }

  const policy = evaluateOfferPolicies({
    offer: bid,
    coalition: HERO_DEMO.fundedCoalition,
    intents: HERO_INTENTS,
    products: HERO_PRODUCTS,
    merchants: HERO_MERCHANTS,
    now: issuedAt,
    expectedOfferId: bid.id,
    paymentRailCapCents: HERO_PAYMENT_RAIL_CAP_CENTS,
  });
  const passed = rfpMatches && policy.passed;

  const admittedPrices = [
    ...HERO_DEMO.negotiation.finalOffers.map((offer) => offer.unitPriceCents),
    ...(passed ? [bid.unitPriceCents] : []),
  ].sort((left, right) => left - right);

  const trace: AgentTraceStep[] = [
    {
      stage: "bid_validation",
      actor: "POOL merchant API",
      status: "passed",
      detail: "Price and fulfillment terms passed strict integer and range validation.",
    },
    {
      stage: "rfp_commitment",
      actor: "POOL market engine",
      status: rfpMatches ? "passed" : "blocked",
      detail: rfpMatches
        ? `Bid references frozen RFP version ${HERO_DEMO.fundedCoalition.version}; quantity is server-pinned to ${HERO_DEMO.fundedCoalition.totalQuantity}.`
        : "Bid references a stale RFP version and cannot enter the auction.",
    },
    {
      stage: "private_policy",
      actor: "POOL deterministic policy engine",
      status: policy.passed ? "passed" : "blocked",
      detail: policy.passed
        ? "Every buyer mandate and seller fulfillment constraint passed without revealing a ceiling."
        : "One or more private constraints rejected this bid; no buyer ceiling was disclosed.",
    },
    {
      stage: "money_boundary",
      actor: "POOL settlement controller",
      status: passed ? "pending" : "blocked",
      detail: passed
        ? "Bid is eligible for ranking only. It cannot authorize or move money."
        : "Rejected bids cannot reach Rain or any settlement tool.",
    },
  ];

  const result = {
    status: passed ? (admittedPrices[0] === bid.unitPriceCents ? "leading" : "admitted") : "rejected",
    merchant: {
      id: merchant.id,
      displayName: merchant.displayName,
    },
    rfp: {
      poolId: HERO_DEMO.fundedCoalition.id,
      version: HERO_DEMO.fundedCoalition.version,
      productSku: HERO_PRODUCT.sku,
      committedQuantity: HERO_DEMO.fundedCoalition.totalQuantity,
    },
    bid: {
      id: bid.id,
      termsFingerprint: fingerprintOfferTerms(bid),
      unitPriceCents: bid.unitPriceCents,
      totalCents: bid.totalCents,
      deliveryDate: bid.deliveryDate,
      warrantyMonths: bid.warrantyMonths,
      issuedAt: bid.issuedAt,
      validUntil: bid.validUntil,
      rankIfAdmitted: passed ? admittedPrices.indexOf(bid.unitPriceCents) + 1 : null,
    },
    policy: {
      passed,
      checks: [
        {
          code: "RFP_VERSION",
          label: "Frozen RFP version",
          passed: rfpMatches,
          detail: rfpMatches ? "Current commitment referenced." : "Stale commitment rejected.",
        },
        {
          code: "COMMITTED_QUANTITY",
          label: "Committed quantity",
          passed: bid.quantity === HERO_DEMO.fundedCoalition.totalQuantity,
          detail: `The server pinned this offer to all ${HERO_DEMO.fundedCoalition.totalQuantity} committed units.`,
        },
        {
          code: "PRIVATE_CLEARING",
          label: "Aggregate private clearing",
          passed: policy.passed,
          detail: policy.passed
            ? "All private buyer and seller policies cleared as one aggregate decision."
            : "The offer did not clear the private market policy. No buyer, rule, ceiling, or seller price was disclosed.",
        },
      ],
    },
    financialAuthorization: "not_requested" as const,
    trace,
  };

  return { offer: bid, result };
}

export function evaluateMerchantBid(
  rawInput: unknown,
  options: MerchantBidEvaluationOptions = {},
) {
  return evaluateMerchantBidWithOffer(rawInput, options).result;
}
