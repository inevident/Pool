import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BLOCKED_MCC,
  clearConsumerMarket,
  merchantCategoryCodeFor,
  publicOffer,
} from "../../../../lib/market/consumer";
import { createSeededProductWorkspace } from "../../../../lib/product/index";
import {
  authorizeCard,
  isRainConfigured,
  issueScopedCard,
  RainApiError,
  reverseAuthorization,
  settleAuthorization,
} from "../../../../lib/rain/client";
import { canExecuteLiveDemo } from "../../../../lib/security/demo-access";
import {
  assertRateLimit,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";

export const dynamic = "force-dynamic";

/**
 * The browser supplies an identifier, a quantity, and an idempotency key. It
 * never supplies a price, a reservation, an MSRP, or a capture — the server
 * re-derives all money from its own catalog copy.
 */
const requestSchema = z
  .object({
    poolId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(20),
    settlementId: z.string().uuid(),
    confirmation: z.literal("settle-pool-order"),
  })
  .strict();

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

/** Scoped cards expire quickly; a settlement run has no reason to outlive the day. */
function cardExpiry(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2),
  ).toISOString();
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
      { status: "rejected", message: "Invalid settlement request." },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await readLimitedJson(request, 1_024));
  } catch {
    return NextResponse.json(
      { status: "rejected", message: "Invalid settlement payload." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  // Server-owned catalog. The browser's copy is never consulted for money.
  const catalog = createSeededProductWorkspace();
  const pool = catalog.pools[input.poolId];
  if (!pool) {
    return NextResponse.json(
      { status: "rejected", message: "Unknown pool." },
      { status: 404, headers: noStoreHeaders },
    );
  }
  const product = catalog.products[pool.productId];

  // Aggregate demand = the pool's seeded funded units plus this buyer's units.
  const aggregateUnits = pool.committedUnitCount + input.quantity;
  const clearing = clearConsumerMarket({
    productId: product.id,
    aggregateUnits,
    targetUnitPriceCents: pool.estimatedUnitPriceCents,
  });

  const reservedCents = product.msrpUnitCents * input.quantity;

  if (clearing.code !== "cleared" || !clearing.winner) {
    // A pool that cannot beat its published target does not buy anything. The
    // reservation stays with the buyer; POOL never invents a worse deal.
    return NextResponse.json(
      {
        status: "no_acceptable_offer",
        poolId: pool.id,
        aggregateUnits,
        reservedCents,
        unitsToClear: clearing.unitsToClear,
        targetUnitPriceCents: pool.estimatedUnitPriceCents,
        offers: clearing.offers.map(publicOffer),
        message:
          clearing.unitsToClear === null
            ? "No merchant can beat this pool's published target. The reservation is untouched."
            : `No merchant beats the target at ${aggregateUnits} funded units. The reservation is untouched.`,
      },
      { headers: noStoreHeaders },
    );
  }

  const winner = clearing.winner;
  const capturedCents = winner.unitPriceCents * input.quantity;
  const releasedCents = reservedCents - capturedCents;

  // Defence in depth: the market must never clear above what the buyer locked.
  if (capturedCents > reservedCents || capturedCents <= 0) {
    return NextResponse.json(
      { status: "rejected", message: "Clearing price failed the reservation bound." },
      { status: 409, headers: noStoreHeaders },
    );
  }

  const marketEvidence = {
    poolId: pool.id,
    productName: product.name,
    aggregateUnits,
    volumeDiscountBps: clearing.discountBps,
    quantity: input.quantity,
    reservedCents,
    capturedCents,
    releasedCents,
    unitPriceCents: winner.unitPriceCents,
    msrpUnitCents: product.msrpUnitCents,
    targetUnitPriceCents: pool.estimatedUnitPriceCents,
    // Public projections only: no merchant floor or opening quote is disclosed.
    offers: clearing.offers.map(publicOffer),
    winner: publicOffer(winner),
  };

  const liveEnabled =
    process.env.RAIN_LIVE_EXECUTION_ENABLED === "true" && isRainConfigured();

  if (!liveEnabled || !canExecuteLiveDemo(request)) {
    return NextResponse.json(
      {
        status: "cleared",
        evidence: "rehearsal" as const,
        ...marketEvidence,
        message:
          "Market cleared deterministically. Rain execution is disabled or locked, so no provider transaction was created.",
      },
      { headers: noStoreHeaders },
    );
  }

  const startedAt = new Date();
  const runKey = `pool-settle-${input.settlementId}`;
  const allowedMcc = merchantCategoryCodeFor(product.category);
  let authorizedTransactionId: string | null = null;

  try {
    // 1. Bounded authority: a card worth exactly the cleared capture, usable
    //    only in this product's merchant category.
    const issued = await issueScopedCard({
      amountInUSDCents: capturedCents,
      allowedMccs: [allowedMcc],
      expiresAt: cardExpiry(startedAt),
      idempotencyKey: `${runKey}-card`,
    });

    // 2. Prove the bound is enforced by the provider, not just claimed by POOL.
    const probe = await authorizeCard({
      cardId: issued.card.id,
      amountInCents: capturedCents,
      merchantName: `${winner.merchantName} (off-policy probe)`,
      merchantCategoryCode: BLOCKED_MCC,
      idempotencyKey: `${runKey}-blocked-probe`,
    });
    if (probe.transaction.status !== "declined") {
      await reverseAuthorization({
        transactionId: probe.transaction.transactionId,
        idempotencyKey: `${runKey}-unsafe-probe-reversal`,
      });
      throw new RainApiError(
        "Rain did not apply the expected MCC restriction",
        502,
        "guardrail_not_applied",
      );
    }

    // 3. Authorize the real capture.
    const authorization = await authorizeCard({
      cardId: issued.card.id,
      amountInCents: capturedCents,
      merchantName: winner.merchantName,
      merchantCategoryCode: allowedMcc,
      idempotencyKey: `${runKey}-authorize`,
    });
    if (authorization.transaction.status !== "authorized") {
      throw new RainApiError(
        "The settlement authorization was declined",
        409,
        authorization.transaction.declinedReason ?? "authorization_declined",
      );
    }
    authorizedTransactionId = authorization.transaction.transactionId;

    // 4. Settle it.
    const settlement = await settleAuthorization({
      transactionId: authorization.transaction.transactionId,
      amountInCents: capturedCents,
      idempotencyKey: `${runKey}-settle`,
    });
    if (settlement.transaction.status !== "settled") {
      throw new RainApiError(
        "Rain did not confirm settlement",
        502,
        "settlement_not_confirmed",
      );
    }

    return NextResponse.json(
      {
        status: "cleared",
        evidence: "rain-sandbox" as const,
        ...marketEvidence,
        rain: {
          cardId: issued.card.id,
          cardLast4: issued.card.last4,
          allowedMcc,
          blockedMccProof: {
            mcc: BLOCKED_MCC,
            status: probe.transaction.status,
            declinedReason: probe.transaction.declinedReason ?? "restricted_mcc",
          },
          transactionId: settlement.transaction.transactionId,
          settledAmountCents: capturedCents,
          idempotencyCached:
            issued.cached || authorization.cached || settlement.cached,
        },
        message: `${winner.merchantName} won at ${winner.unitPriceCents} cents per unit; Rain settled ${capturedCents} cents.`,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    // An open authorization must not be abandoned. Reverse it where possible;
    // if the reversal itself fails the reservation stays locked for
    // reconciliation rather than being optimistically released.
    let compensated = false;
    if (authorizedTransactionId) {
      try {
        await reverseAuthorization({
          transactionId: authorizedTransactionId,
          idempotencyKey: `${runKey}-compensate`,
        });
        compensated = true;
      } catch {
        compensated = false;
      }
    }

    const code =
      error instanceof RainApiError ? error.code ?? "rain_error" : "settlement_failed";
    return NextResponse.json(
      {
        status: "failed",
        code,
        compensated,
        // No rehearsal receipt is substituted for a failed live run.
        message:
          error instanceof RainApiError
            ? error.message
            : "The settlement run did not complete.",
        reservationState: compensated ? "still_reserved" : "reconciliation_required",
      },
      { status: 502, headers: noStoreHeaders },
    );
  }
}
