import { zeroHash, type Hex } from "viem";

import { HERO_DEMO } from "../market/index.ts";
import { buildHeroCoalitionCommitment, hashRainSettlement } from "./commitment.ts";
import {
  attestRainSettlementOnMonad,
  commitCoalitionOnMonad,
  MonadRegistryError,
  registerMerchantOfferOnMonad,
  verifyFinalizedCoalitionPreparationOnMonad,
  type MonadWriteResult,
  type VerifiedMonadPreparation,
} from "./server.ts";
import {
  getRuntimeMonadPreparation,
  rememberRuntimeMonadPreparation,
  type RuntimeMonadPreparation,
} from "./runtime.ts";

export interface MonadWorkflowAdapter {
  readonly commitCoalition: typeof commitCoalitionOnMonad;
  readonly registerOffer: typeof registerMerchantOfferOnMonad;
  readonly attestSettlement: typeof attestRainSettlementOnMonad;
  readonly verifyPreparation: typeof verifyFinalizedCoalitionPreparationOnMonad;
}

const defaultAdapter: MonadWorkflowAdapter = {
  commitCoalition: commitCoalitionOnMonad,
  registerOffer: registerMerchantOfferOnMonad,
  attestSettlement: attestRainSettlementOnMonad,
  verifyPreparation: verifyFinalizedCoalitionPreparationOnMonad,
};

const settlementTotalInCents = HERO_DEMO.outcome.pooledTotalCents;

/**
 * One UTC-day run gets one deterministic window ending at midnight two days
 * later. Retries produce the same commitment, while the deadline is always
 * 24–48 hours in the future and safely below the contract's 30-day limit.
 */
export function getStableHeroBidWindow(now = new Date()) {
  if (!Number.isFinite(now.getTime())) {
    throw new MonadRegistryError("INVALID_CLOCK", "Cannot prepare Monad with an invalid clock.");
  }
  const day = now.toISOString().slice(0, 10);
  const bidClosesAt = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 2,
      0,
      0,
      0,
    ),
  );
  return {
    runKey: `pool-monad-monitor-v1-${day}`,
    bidClosesAt: bidClosesAt.toISOString(),
  };
}

interface PrepareResult {
  readonly preparation: RuntimeMonadPreparation;
  readonly replayed: boolean;
}

let preparationInFlight:
  | { readonly runKey: string; readonly promise: Promise<PrepareResult> }
  | undefined;

async function executePreparation(input: {
  readonly runKey: string;
  readonly bidClosesAt: string;
  readonly now: Date;
  readonly adapter: MonadWorkflowAdapter;
}): Promise<PrepareResult> {
  const coalitionCommitment = buildHeroCoalitionCommitment({
    bidClosesAt: input.bidClosesAt,
  });

  // The finalized onchain timestamp is deliberately awaited before offer
  // timestamps or hashes exist. It is the clock anchor for the live auction.
  const committed = await input.adapter.commitCoalition(coalitionCommitment);
  const commitment = buildHeroCoalitionCommitment({
    bidClosesAt: input.bidClosesAt,
    finalizedCommittedAt: committed.committedAt,
  });
  const offerResults: MonadWriteResult[] = [];
  for (const offerHash of commitment.offerHashes) {
    offerResults.push(
      await input.adapter.registerOffer({
        commitmentId: committed.commitmentId,
        offerHash,
      }),
    );
  }

  const verified = await input.adapter.verifyPreparation(commitment);
  if (!sameHex(verified.commitmentId, committed.commitmentId)) {
    throw new MonadRegistryError(
      "MONAD_PREPARATION_CONFLICT",
      "The finalized commitment identifier did not match the prepared write.",
    );
  }
  if (verified.committedAt !== committed.committedAt) {
    throw new MonadRegistryError(
      "MONAD_COMMITMENT_TIME_CONFLICT",
      "The finalized commitment timestamp changed during offer verification.",
    );
  }

  const preparation: RuntimeMonadPreparation = {
    runKey: input.runKey,
    commitment: verified.commitment,
    commitmentId: committed.commitmentId,
    commitmentTransaction: committed.transaction,
    offerTransactions: offerResults.map((result) => result.transaction),
    preparedAt: new Date(Number(verified.committedAt) * 1_000).toISOString(),
  };
  rememberRuntimeMonadPreparation(preparation);
  return {
    preparation,
    replayed:
      committed.replayed && offerResults.every((result) => result.replayed),
  };
}

const sameHex = (left: Hex, right: Hex) =>
  left.toLowerCase() === right.toLowerCase();

function assertCoherentSettlement(
  commitment: RuntimeMonadPreparation["commitment"],
  verified: VerifiedMonadPreparation,
) {
  if (verified.settledAt === BigInt(0)) {
    if (
      verified.acceptedOfferHash !== zeroHash ||
      verified.rainSettlementHash !== zeroHash ||
      verified.capturedCents !== BigInt(0)
    ) {
      throw new MonadRegistryError(
        "MONAD_SETTLEMENT_STATE_INVALID",
        "The finalized commitment contains an incomplete settlement state.",
      );
    }
    return;
  }

  if (
    !sameHex(verified.acceptedOfferHash, commitment.winningOfferHash) ||
    verified.rainSettlementHash === zeroHash ||
    verified.capturedCents !== BigInt(settlementTotalInCents)
  ) {
    throw new MonadRegistryError(
      "SETTLEMENT_CONFLICT",
      "The finalized Monad settlement does not match the accepted offer and capture total.",
    );
  }
}

/**
 * Rebuilds today's deterministic commitment and verifies every field and offer
 * from finalized Monad state. Module memory is refreshed only after that proof
 * succeeds; it is never the source of authority for Rain settlement.
 */
export async function requireFinalizedHeroMarketOnMonad(options: {
  readonly now?: Date;
  readonly adapter?: MonadWorkflowAdapter;
} = {}): Promise<RuntimeMonadPreparation> {
  const now = options.now ?? new Date();
  const { runKey, bidClosesAt } = getStableHeroBidWindow(now);
  const coalitionCommitment = buildHeroCoalitionCommitment({ bidClosesAt });
  const verified = await (options.adapter ?? defaultAdapter).verifyPreparation(
    coalitionCommitment,
  );
  assertCoherentSettlement(verified.commitment, verified);

  return rememberRuntimeMonadPreparation({
    runKey,
    commitment: verified.commitment,
    commitmentId: verified.commitmentId,
    commitmentTransaction: null,
    offerTransactions: verified.commitment.offerHashes.map(() => null),
    preparedAt: new Date(Number(verified.committedAt) * 1_000).toISOString(),
  });
}

export function prepareHeroMarketOnMonad(options: {
  readonly now?: Date;
  readonly adapter?: MonadWorkflowAdapter;
} = {}): Promise<PrepareResult> {
  const now = options.now ?? new Date();
  const { runKey, bidClosesAt } = getStableHeroBidWindow(now);
  const existing = getRuntimeMonadPreparation();
  if (existing?.runKey === runKey) {
    return Promise.resolve({ preparation: existing, replayed: true });
  }
  if (preparationInFlight?.runKey === runKey) {
    return preparationInFlight.promise;
  }

  const promise = executePreparation({
    runKey,
    bidClosesAt,
    now,
    adapter: options.adapter ?? defaultAdapter,
  });
  preparationInFlight = { runKey, promise };
  const clearInFlight = () => {
    if (preparationInFlight?.promise === promise) preparationInFlight = undefined;
  };
  void promise.then(clearInFlight, clearInFlight);
  return promise;
}

/**
 * Called only after every Rain allocation has settled. It hashes the complete
 * provider transaction-ID set and binds it to the finalized pre-bid commitment.
 */
export async function attestSettledRainTransactionsOnMonad(
  input: {
    readonly rainTransactionIds: readonly string[];
    readonly capturedCents?: number;
    readonly now?: Date;
  },
  adapter: MonadWorkflowAdapter = defaultAdapter,
) {
  const preparation = await requireFinalizedHeroMarketOnMonad({
    now: input.now,
    adapter,
  });
  const capturedCents = input.capturedCents ?? settlementTotalInCents;
  if (capturedCents !== settlementTotalInCents) {
    throw new MonadRegistryError(
      "CAPTURE_TOTAL_MISMATCH",
      "Monad attestation must match the server-authoritative Rain settlement total.",
    );
  }
  const transactionIds = [...new Set(input.rainTransactionIds.map((value) => value.trim()))]
    .filter(Boolean)
    .sort();
  if (transactionIds.length !== input.rainTransactionIds.length) {
    throw new MonadRegistryError(
      "INVALID_RAIN_TRANSACTION_SET",
      "Rain transaction IDs must be non-empty and unique.",
    );
  }

  const rainSettlementHash = hashRainSettlement({
    commitmentId: preparation.commitmentId,
    acceptedOfferHash: preparation.commitment.winningOfferHash,
    rainTransactionIds: transactionIds,
  });
  const result = await adapter.attestSettlement({
    commitmentId: preparation.commitmentId,
    acceptedOfferHash: preparation.commitment.winningOfferHash,
    rainSettlementHash,
    capturedCents: BigInt(capturedCents),
  });
  return {
    ...result,
    acceptedOfferHash: preparation.commitment.winningOfferHash,
    rainSettlementHash,
    rainTransactionCount: transactionIds.length,
  };
}

export const monadWriteResultForJson = (result: MonadWriteResult | undefined) =>
  result
    ? {
        replayed: result.replayed,
        commitmentId: result.commitmentId,
        transaction: result.transaction
          ? {
              ...result.transaction,
              blockNumber: result.transaction.blockNumber.toString(),
            }
          : null,
      }
    : null;

export const monadTransactionForJson = (
  transaction: RuntimeMonadPreparation["commitmentTransaction"],
) =>
  transaction
    ? {
        ...transaction,
        blockNumber: transaction.blockNumber.toString(),
      }
    : null;

export type MonadCommitmentId = Hex;
