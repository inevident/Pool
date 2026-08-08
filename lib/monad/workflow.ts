import type { Hex } from "viem";

import { HERO_DEMO } from "../market/index.ts";
import { buildHeroCoalitionCommitment, hashRainSettlement } from "./commitment.ts";
import {
  attestRainSettlementOnMonad,
  commitCoalitionOnMonad,
  MonadRegistryError,
  registerMerchantOfferOnMonad,
  type MonadWriteResult,
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
}

const defaultAdapter: MonadWorkflowAdapter = {
  commitCoalition: commitCoalitionOnMonad,
  registerOffer: registerMerchantOfferOnMonad,
  attestSettlement: attestRainSettlementOnMonad,
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
  const commitment = buildHeroCoalitionCommitment({
    bidClosesAt: input.bidClosesAt,
  });

  // This finalized write is deliberately awaited before any seller offer hash
  // can be registered. The ordering is the core economic role Monad plays.
  const committed = await input.adapter.commitCoalition(commitment);
  const offerResults: MonadWriteResult[] = [];
  for (const offerHash of commitment.offerHashes) {
    offerResults.push(
      await input.adapter.registerOffer({
        commitmentId: committed.commitmentId,
        offerHash,
      }),
    );
  }

  const preparation: RuntimeMonadPreparation = {
    runKey: input.runKey,
    commitment,
    commitmentId: committed.commitmentId,
    commitmentTransaction: committed.transaction,
    offerTransactions: offerResults.map((result) => result.transaction),
    preparedAt: input.now.toISOString(),
  };
  rememberRuntimeMonadPreparation(preparation);
  return {
    preparation,
    replayed:
      committed.replayed && offerResults.every((result) => result.replayed),
  };
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
  },
  adapter: MonadWorkflowAdapter = defaultAdapter,
) {
  const preparation = getRuntimeMonadPreparation();
  if (!preparation) {
    throw new MonadRegistryError(
      "MONAD_PREPARATION_REQUIRED",
      "The finalized pre-bid Monad preparation must run before Rain settlement.",
    );
  }
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
