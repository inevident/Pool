import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  clearConsumerMarket,
  CONSUMER_POLICY,
  publicOffer,
} from "../../../../lib/market/consumer";
import {
  createCanonicalProductWorkspace,
  deriveSettlementOperationId,
  evaluateProductExecutionWindow,
  evaluateProductPoolFunding,
  evaluateProductSettlementConstraints,
  poolMembershipEnvelopeSchema,
  ProductExecutionError,
  resolveMissedExecutionWindow,
  type ValidatedProductIntentConstraints,
  validateProductExecutionIntent,
  validateProductExecutionMembership,
} from "../../../../lib/product/server";
import {
  assertRateLimit,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";

export const dynamic = "force-dynamic";

/**
 * Product-page settlement is deliberately rehearsal-only for this release.
 * The seeded aggregate does not have a complete provider allocation set, so a
 * single browser membership can never authorize Rain or finalize Monad. The
 * fixed /demo route remains the complete three-allocation live proof.
 */
const requestSchema = z
  .object({
    poolId: z.string().min(1).max(64),
    membership: poolMembershipEnvelopeSchema,
    intent: z
      .object({
        id: z.string().trim().min(1).max(128),
        buyerId: z.string().trim().min(1).max(128),
        productId: z.string().trim().min(1).max(128),
        quantity: z.number().int().min(1).max(20),
        targetUnitPriceCents: z.number().int().positive().safe(),
        createdAt: z.iso.datetime({ offset: true }),
        expiresAt: z.iso.datetime({ offset: true }),
        status: z.literal("joined"),
      })
      .strict(),
    confirmation: z.literal("settle-pool-order"),
  })
  .strict();

type ValidatedExecution = ReturnType<typeof validateProductExecutionMembership>;

function deriveMarketOutcome(
  execution: ValidatedExecution,
  minimumCommittedUnitCount: number,
  constraints: ValidatedProductIntentConstraints,
) {
  const { pool, product } = execution;
  const aggregateUnits = execution.aggregateUnits;
  const reservedCents = execution.buyerReservedCents;
  const operationId = deriveSettlementOperationId(execution);
  const clearing = clearConsumerMarket({
    productId: product.id,
    aggregateUnits,
    targetUnitPriceCents: pool.estimatedUnitPriceCents,
  });
  const eligibleOffers = clearing.offers
    .filter(
      (offer) =>
        offer.meetsTarget &&
        offer.deliveryDays <= CONSUMER_POLICY.maxDeliveryDays &&
        offer.warrantyMonths >= CONSUMER_POLICY.minWarrantyMonths,
    )
    .map((offer) => ({
      offer,
      mandate: evaluateProductSettlementConstraints({
        pool,
        constraints,
        unitPriceCents: offer.unitPriceCents,
        deliveryDays: offer.deliveryDays,
      }),
    }))
    .filter((candidate) => candidate.mandate.accepted)
    .sort(
      (a, b) =>
        a.offer.unitPriceCents - b.offer.unitPriceCents ||
        a.offer.deliveryDays - b.offer.deliveryDays ||
        a.offer.merchantId.localeCompare(b.offer.merchantId),
    );
  const selected = eligibleOffers[0];

  if (clearing.code !== "cleared" || !selected) {
    const mandateRejected = clearing.code === "cleared";
    return {
      kind: "no_acceptable_offer" as const,
      response: {
        status: "no_acceptable_offer" as const,
        evidence: "rehearsal" as const,
        code: mandateRejected
          ? ("buyer_mandate_not_met" as const)
          : ("no_acceptable_offer" as const),
        operationId,
        poolId: pool.id,
        aggregateUnits,
        reservedCents,
        unitsToClear: clearing.unitsToClear,
        targetUnitPriceCents: pool.estimatedUnitPriceCents,
        offers: clearing.offers.map(publicOffer),
        aggregateOrderPlaced: false,
        reservationState: "release_available" as const,
        releaseReason: "no_acceptable_offer" as const,
        message: mandateRejected
          ? "No modeled merchant offer satisfies both the buyer's maximum price and delivery deadline. This was a local rehearsal: no aggregate order, chain write, or provider transaction was created, so the browser-local reservation is eligible for release."
          : "No modeled merchant beats the published target. This was a local rehearsal: no aggregate order, chain write, or provider transaction was created, so the browser-local reservation is eligible for release.",
      },
    };
  }

  const winner = selected.offer;
  const capturedCents = winner.unitPriceCents * execution.membership.quantity;
  if (capturedCents > reservedCents || capturedCents <= 0) {
    throw new ProductExecutionError(
      "membership_reservation_mismatch",
      "Clearing price failed the reservation bound.",
    );
  }
  return {
    kind: "cleared" as const,
    marketEvidence: {
      operationId,
      poolId: pool.id,
      productName: product.name,
      aggregateUnits,
      minimumCommittedUnitCount,
      volumeDiscountBps: clearing.discountBps,
      quantity: execution.membership.quantity,
      reservedCents,
      modeledAllocationCents: capturedCents,
      modeledSavingsCents: reservedCents - capturedCents,
      unitPriceCents: winner.unitPriceCents,
      msrpUnitCents: product.msrpUnitCents,
      targetUnitPriceCents: pool.estimatedUnitPriceCents,
      buyerMaxUnitPriceCents: constraints.maxUnitPriceCents,
      deliverBy: constraints.deliverBy,
      promisedDeliveryAt: selected.mandate.promisedDeliveryAt,
      offers: clearing.offers.map(publicOffer),
      winner: publicOffer(winner),
    },
  };
}

function isTrustedSettlementRequest(request: NextRequest) {
  if (request.headers.get("x-pool-demo-action") !== "settle-pool-order") {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return (
      requestUrl.protocol === originUrl.protocol &&
      requestUrl.host === originUrl.host
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    assertRateLimit(request, "pool-settle", { maxRequests: 6, windowMs: 60_000 });
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { status: "rate_limited", message: error.message },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    throw error;
  }

  if (!isTrustedSettlementRequest(request)) {
    return NextResponse.json(
      {
        status: "rejected",
        code: "untrusted_request",
        message: "Invalid settlement request.",
      },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await readLimitedJson(request, 4_096));
  } catch {
    return NextResponse.json(
      {
        status: "rejected",
        code: "invalid_execution_record",
        message: "Invalid product rehearsal payload.",
      },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const catalog = createCanonicalProductWorkspace();
  let execution: ValidatedExecution;
  let constraints: ValidatedProductIntentConstraints;
  try {
    execution = validateProductExecutionMembership({
      workspace: catalog,
      poolId: input.poolId,
      membership: input.membership,
    });
    constraints = validateProductExecutionIntent({
      execution,
      intent: input.intent,
    });
  } catch (error) {
    const executionError =
      error instanceof ProductExecutionError ? error : null;
    return NextResponse.json(
      {
        status: "rejected",
        code: executionError?.code ?? "invalid_execution_record",
        message:
          executionError?.message ?? "The product rehearsal record is invalid.",
      },
      {
        status: executionError?.code === "pool_not_found" ? 404 : 409,
        headers: noStoreHeaders,
      },
    );
  }

  const executionWindow = evaluateProductExecutionWindow(execution.pool);
  if (executionWindow.status === "waiting_for_cutoff") {
    return NextResponse.json(
      {
        ...executionWindow,
        poolId: execution.pool.id,
        reservationState: "still_reserved",
        message:
          "The commitment window is still open. No market rehearsal, chain write, or provider action occurred.",
      },
      { status: 409, headers: noStoreHeaders },
    );
  }
  if (executionWindow.status === "closed") {
    const resolution = resolveMissedExecutionWindow(execution);
    return NextResponse.json(
      {
        ...resolution,
        poolId: execution.pool.id,
        cutoffAt: executionWindow.cutoffAt,
        bidClosesAt: executionWindow.bidClosesAt,
        serverTime: executionWindow.serverTime,
      },
      {
        status: 200,
        headers: noStoreHeaders,
      },
    );
  }

  const aggregateUnits = execution.aggregateUnits;
  const fundingStatus = evaluateProductPoolFunding({
    pool: execution.pool,
    aggregateFundedUnitCount: aggregateUnits,
  });
  if (!fundingStatus.hasMetMinimum) {
    return NextResponse.json(
      {
        status: "below_minimum",
        code: "minimum_funded_units_not_met",
        operationId: deriveSettlementOperationId(execution),
        poolId: execution.pool.id,
        aggregateUnits,
        minimumCommittedUnitCount: fundingStatus.minimumCommittedUnitCount,
        unitsNeeded: fundingStatus.unitsNeeded,
        reservedCents: execution.buyerReservedCents,
        aggregateOrderPlaced: false,
        reservationState: "release_available",
        releaseReason: "minimum_not_met",
        message:
          "The local pool is below its bidding minimum. No aggregate order, chain write, or provider transaction was created, so the browser-local reservation is eligible for release.",
      },
      { headers: noStoreHeaders },
    );
  }

  const market = deriveMarketOutcome(
    execution,
    fundingStatus.minimumCommittedUnitCount,
    constraints,
  );
  if (market.kind === "no_acceptable_offer") {
    return NextResponse.json(market.response, { headers: noStoreHeaders });
  }
  return NextResponse.json(
    {
      status: "modeled_quote",
      evidence: "rehearsal" as const,
      authority: "product_rehearsal_only" as const,
      code: "aggregate_provider_allocations_unavailable" as const,
      aggregateOrderPlaced: false,
      reservationState: "release_available" as const,
      releaseReason: "rehearsal_complete" as const,
      ...market.marketEvidence,
      message:
        "The mandate-aware market produced a modeled quote only. The seeded coalition has no complete provider allocation set, so no aggregate order or payment was created. The browser-local reservation remains untouched until you explicitly release it.",
    },
    { headers: noStoreHeaders },
  );
}
