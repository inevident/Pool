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
import {
  hashConsumerOffer,
  hashProductPoolId,
} from "../../../../lib/monad/product-commitment";
import { hashRainSettlement } from "../../../../lib/monad/commitment";
import {
  attestRainSettlementOnMonad,
  createMonadPublicClient,
  getMonadRegistryAddress,
  getMonadWriteConfiguration,
  MonadRegistryError,
  registerMerchantOfferOnMonad,
} from "../../../../lib/monad/server";
import {
  monadExplorerTransactionUrl,
  POOL_COMMITMENT_REGISTRY_ABI,
} from "../../../../lib/monad/registry";
import type { Hex } from "viem";

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
    /** Finalized commitment from POST /api/pool/commit, when Monad is in use. */
    commitmentId: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    confirmation: z.literal("settle-pool-order"),
  })
  .strict();

/**
 * Re-reads the finalized on-chain commitment.
 *
 * Process memory is never trusted: a cold start, a redeploy, or a second worker
 * must reach the same conclusion by reading the chain, which is what makes the
 * pre-bid gate meaningful rather than decorative.
 */
async function readFinalizedCommitment(commitmentId: Hex) {
  const address = getMonadRegistryAddress();
  if (!address) {
    throw new MonadRegistryError(
      "REGISTRY_NOT_CONFIGURED",
      "Monad registry address is not configured.",
    );
  }
  const publicClient = createMonadPublicClient();
  const commitment = await publicClient.readContract({
    address,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "getCommitment",
    args: [commitmentId],
    blockTag: "finalized",
  });
  if (commitment.committedAt <= BigInt(0)) {
    throw new MonadRegistryError(
      "COMMITMENT_NOT_FINALIZED",
      "The coalition commitment is not finalized on Monad.",
    );
  }
  return commitment;
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

  // --- Pre-bid gate -------------------------------------------------------
  // When Monad is in use, no offer may be constructed until the funding
  // commitment is finalized on-chain. Offers are then stamped strictly after
  // the finalized commitment timestamp, so the ordering claim is verifiable
  // from chain state rather than asserted by POOL.
  const monadConfiguration = getMonadWriteConfiguration();
  let monadGate:
    | {
        commitmentId: Hex;
        termsHash: Hex;
        acceptedOfferHash: Hex | null;
        offerIssuedAt: string;
      }
    | null = null;

  if (monadConfiguration.ready) {
    if (!input.commitmentId) {
      return NextResponse.json(
        {
          status: "rejected",
          code: "commitment_required",
          message:
            "Monad is configured: funded demand must be committed on-chain before sellers can bid.",
        },
        { status: 409, headers: noStoreHeaders },
      );
    }
    try {
      const commitmentId = input.commitmentId as Hex;
      const onChain = await readFinalizedCommitment(commitmentId);
      const expectedPoolIdHash = hashProductPoolId(pool.id);
      const reservedForPool = product.msrpUnitCents * aggregateUnits;

      if (
        onChain.poolIdHash.toLowerCase() !== expectedPoolIdHash.toLowerCase() ||
        onChain.unitCount !== aggregateUnits ||
        onChain.reservedCents !== BigInt(reservedForPool)
      ) {
        return NextResponse.json(
          {
            status: "rejected",
            code: "commitment_mismatch",
            message:
              "The finalized commitment does not describe this pool's funded demand. Rain was not called.",
          },
          { status: 409, headers: noStoreHeaders },
        );
      }
      if (onChain.bidClosesAt <= BigInt(Math.floor(Date.now() / 1_000))) {
        return NextResponse.json(
          {
            status: "rejected",
            code: "bid_window_closed",
            message: "The committed bid window has closed. Re-commit the coalition.",
          },
          { status: 409, headers: noStoreHeaders },
        );
      }

      monadGate = {
        commitmentId,
        termsHash: onChain.termsHash,
        acceptedOfferHash: null,
        // Strictly after the finalized commitment.
        offerIssuedAt: new Date(
          (Number(onChain.committedAt) + 1) * 1_000,
        ).toISOString(),
      };
    } catch (error) {
      return NextResponse.json(
        {
          status: "rejected",
          code:
            error instanceof MonadRegistryError ? error.code : "monad_gate_failed",
          message:
            error instanceof MonadRegistryError
              ? error.message
              : "The Monad pre-bid gate could not be verified. Rain was not called.",
        },
        { status: 409, headers: noStoreHeaders },
      );
    }
  } else if (monadConfiguration.required) {
    return NextResponse.json(
      {
        status: "rejected",
        code: "monad_required",
        message:
          "MONAD_LIVE_REQUIRED is set but Monad is not ready. Settlement is blocked.",
        issues: monadConfiguration.issues,
      },
      { status: 503, headers: noStoreHeaders },
    );
  }

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

  // Register the sealed winning offer against the finalized commitment. This
  // happens before Rain so the chain records which offer POOL intended to
  // execute, not one chosen after seeing the payment result.
  let offerRegistration: {
    offerHash: Hex;
    replayed: boolean;
    transactionHash: string | null;
    explorerUrl: string | null;
  } | null = null;

  if (monadGate) {
    try {
      const offerHash = hashConsumerOffer({
        termsHash: monadGate.termsHash,
        offer: winner,
        quantity: input.quantity,
        totalCents: capturedCents,
        issuedAt: monadGate.offerIssuedAt,
      });
      const registered = await registerMerchantOfferOnMonad({
        commitmentId: monadGate.commitmentId,
        offerHash,
      });
      monadGate.acceptedOfferHash = offerHash;
      offerRegistration = {
        offerHash,
        replayed: registered.replayed,
        transactionHash: registered.transaction?.hash ?? null,
        explorerUrl: registered.transaction
          ? monadExplorerTransactionUrl(registered.transaction.hash)
          : null,
      };
    } catch (error) {
      return NextResponse.json(
        {
          status: "rejected",
          code:
            error instanceof MonadRegistryError
              ? error.code
              : "offer_registration_failed",
          message:
            error instanceof MonadRegistryError
              ? error.message
              : "The winning offer could not be registered on Monad. Rain was not called.",
        },
        { status: 502, headers: noStoreHeaders },
      );
    }
  }

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

    // Bind the exact Rain transaction set to the registered winning offer.
    // Rain is already final at this point, so an attestation failure is
    // reported as pending and retried idempotently — it never unwinds a
    // completed payment.
    let monadAttestation:
      | {
          status: "attested" | "attestation_pending";
          commitmentId: string;
          rainSettlementHash?: string;
          replayed?: boolean;
          transactionHash?: string | null;
          explorerUrl?: string | null;
          code?: string;
          message?: string;
        }
      | null = null;

    if (monadGate?.acceptedOfferHash) {
      try {
        const rainSettlementHash = hashRainSettlement({
          commitmentId: monadGate.commitmentId,
          acceptedOfferHash: monadGate.acceptedOfferHash,
          rainTransactionIds: [settlement.transaction.transactionId],
        });
        const attested = await attestRainSettlementOnMonad({
          commitmentId: monadGate.commitmentId,
          acceptedOfferHash: monadGate.acceptedOfferHash,
          rainSettlementHash,
          capturedCents: BigInt(capturedCents),
        });
        monadAttestation = {
          status: "attested",
          commitmentId: monadGate.commitmentId,
          rainSettlementHash,
          replayed: attested.replayed,
          transactionHash: attested.transaction?.hash ?? null,
          explorerUrl: attested.transaction
            ? monadExplorerTransactionUrl(attested.transaction.hash)
            : null,
        };
      } catch (error) {
        monadAttestation = {
          status: "attestation_pending",
          commitmentId: monadGate.commitmentId,
          code:
            error instanceof MonadRegistryError ? error.code : "attestation_failed",
          message:
            "Rain settled successfully. The Monad attestation did not finalize and can be retried; no on-chain settlement claim is made yet.",
        };
      }
    }

    return NextResponse.json(
      {
        status: "cleared",
        evidence: "rain-sandbox" as const,
        ...marketEvidence,
        monad: monadGate
          ? {
              network: "Monad Testnet",
              chainId: 10_143,
              commitmentId: monadGate.commitmentId,
              offerRegistration,
              attestation: monadAttestation,
            }
          : null,
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
