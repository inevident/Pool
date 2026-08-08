import type { Hex } from "viem";

import { hashSealedMerchantOffer } from "../monad/commitment.ts";
import {
  getMonadWriteConfiguration,
  registerMerchantOfferOnMonad,
  type MonadWriteResult,
} from "../monad/server.ts";
import {
  monadTransactionForJson,
  requireFinalizedHeroMarketOnMonad,
} from "../monad/workflow.ts";
import {
  evaluateMerchantBid,
  evaluateMerchantBidWithOffer,
  type MerchantBidRequest,
} from "./merchant.ts";

const BID_VALIDITY_MS = 15 * 60 * 1_000;

type MonadWriteConfiguration = ReturnType<typeof getMonadWriteConfiguration> & {
  /** Tests and deployments can explicitly fail closed even before all secrets exist. */
  readonly required?: boolean;
};

type FinalizedHeroMarket = Awaited<
  ReturnType<typeof requireFinalizedHeroMarketOnMonad>
>;

export interface MerchantBidMonadAdapter {
  readonly getConfiguration: () => MonadWriteConfiguration;
  readonly requireFinalizedMarket: (options: {
    readonly now?: Date;
  }) => Promise<FinalizedHeroMarket>;
  readonly registerOffer: (input: {
    readonly commitmentId: Hex;
    readonly offerHash: Hex;
  }) => Promise<MonadWriteResult>;
}

const monadWasExplicitlyRequested = () =>
  process.env.MONAD_BID_GATE_REQUIRED?.trim().toLowerCase() === "true" ||
  Boolean(process.env.MONAD_REGISTRY_ADDRESS?.trim()) ||
  Boolean(process.env.MONAD_COMMITMENT_ID?.trim()) ||
  Boolean(process.env.MONAD_PRIVATE_KEY?.trim());

const defaultAdapter: MerchantBidMonadAdapter = {
  getConfiguration: () => ({
    ...getMonadWriteConfiguration(),
    required: monadWasExplicitlyRequested(),
  }),
  requireFinalizedMarket: requireFinalizedHeroMarketOnMonad,
  registerOffer: registerMerchantOfferOnMonad,
};

export class MerchantBidRuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;

  constructor(code: string, status: number, publicMessage: string) {
    super(publicMessage);
    this.name = "MerchantBidRuntimeError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function requireValidClock(value: Date) {
  if (!Number.isFinite(value.getTime())) {
    throw new MerchantBidRuntimeError(
      "INVALID_SERVER_CLOCK",
      503,
      "The server clock could not establish a safe bidding window.",
    );
  }
}

/**
 * Derives offer time solely from finalized chain state and the server clock.
 * Client input never controls ordering. Millisecond precision is discarded so
 * the hashed EVM timestamp and the API evidence use the same whole second.
 */
function deriveFinalizedBidWindow(
  preparation: FinalizedHeroMarket,
  now: Date,
) {
  requireValidClock(now);
  const committedAtMs = Date.parse(preparation.preparedAt);
  const bidClosesAtMs = Number(preparation.commitment.bidClosesAt) * 1_000;
  if (
    !Number.isSafeInteger(bidClosesAtMs) ||
    !Number.isFinite(committedAtMs) ||
    committedAtMs >= bidClosesAtMs
  ) {
    throw new MerchantBidRuntimeError(
      "INVALID_FINALIZED_COMMITMENT_CLOCK",
      502,
      "Finalized Monad state did not contain a safe coalition bidding window.",
    );
  }

  const issuedAtMs = Math.max(
    Math.floor(now.getTime() / 1_000) * 1_000,
    committedAtMs + 1_000,
  );
  if (issuedAtMs >= bidClosesAtMs) {
    throw new MerchantBidRuntimeError(
      "BIDDING_WINDOW_CLOSED",
      409,
      "The finalized coalition bidding window has closed.",
    );
  }

  const validUntilMs = Math.min(issuedAtMs + BID_VALIDITY_MS, bidClosesAtMs);
  return {
    issuedAt: new Date(issuedAtMs).toISOString(),
    validUntil: new Date(validUntilMs).toISOString(),
  };
}

export interface EvaluateMerchantBidRuntimeOptions {
  readonly chainWriteAuthorized: boolean;
  readonly now?: Date;
  readonly adapter?: MerchantBidMonadAdapter;
}

/**
 * Chain mode follows a strict read-evaluate-write sequence:
 * finalized funding root -> aggregate policy -> finalized sealed offer hash.
 * With no Monad configuration, the exact policy remains available as an
 * explicitly labelled local rehearsal and no chain write is attempted.
 */
export async function evaluateMerchantBidRuntime(
  input: MerchantBidRequest,
  options: EvaluateMerchantBidRuntimeOptions,
) {
  const adapter = options.adapter ?? defaultAdapter;
  const configuration = adapter.getConfiguration();
  const partiallyConfigured =
    configuration.required === true ||
    configuration.registryConfigured ||
    configuration.operatorConfigured;

  if (!configuration.ready) {
    if (partiallyConfigured) {
      throw new MerchantBidRuntimeError(
        "MONAD_CONFIGURATION_INCOMPLETE",
        503,
        "Monad bid gating was requested but its testnet registry or operator configuration is incomplete.",
      );
    }

    const local = evaluateMerchantBid(input);
    return {
      ...local,
      mode: "deterministic_policy_local",
      message:
        "Evaluated locally against aggregate policy; Monad writes are not configured and no on-chain offer was claimed.",
      monad: {
        mode: "local-proof" as const,
        status: "not_configured" as const,
        chainWriteRequired: false,
        chainWriteAttempted: false,
        confirmation: null,
        commitmentId: null,
        offerHash: null,
        replayed: null,
        transaction: null,
      },
    };
  }

  if (!options.chainWriteAuthorized) {
    throw new MerchantBidRuntimeError(
      "MONAD_BID_ACCESS_REQUIRED",
      401,
      "Protected demo access is required before POOL can write a merchant offer to Monad Testnet.",
    );
  }

  const now = options.now ?? new Date();

  // This finalized read is intentionally completed before constructing or
  // evaluating the merchant offer. A seller cannot bid against soft demand.
  const preparation = await adapter.requireFinalizedMarket({ now });
  const window = deriveFinalizedBidWindow(preparation, now);
  const evaluated = evaluateMerchantBidWithOffer(input, window);
  const commitmentTrace = {
    stage: "monad_funding_gate",
    actor: "POOL Monad verifier",
    status: "passed" as const,
    detail:
      "Finalized Monad state matched today's aggregate funding root before this offer was evaluated.",
  };

  if (!evaluated.result.policy.passed) {
    return {
      ...evaluated.result,
      mode: "monad_gated_policy",
      message:
        "The finalized funding gate passed, but aggregate policy rejected the offer; no offer write was attempted.",
      trace: [commitmentTrace, ...evaluated.result.trace],
      monad: {
        mode: "monad-testnet" as const,
        status: "policy_rejected" as const,
        chainWriteRequired: true,
        chainWriteAttempted: false,
        confirmation: "finalized" as const,
        commitmentId: preparation.commitmentId,
        fundingRoot: preparation.commitment.fundingRoot,
        committedAt: preparation.preparedAt,
        bidClosesAt: new Date(
          Number(preparation.commitment.bidClosesAt) * 1_000,
        ).toISOString(),
        offerHash: null,
        replayed: null,
        transaction: null,
      },
    };
  }

  const offerHash = hashSealedMerchantOffer(
    preparation.commitment.termsHash,
    evaluated.offer,
  );
  const registration = await adapter.registerOffer({
    commitmentId: preparation.commitmentId,
    offerHash,
  });
  if (
    registration.transaction &&
    registration.transaction.confirmation !== "finalized"
  ) {
    throw new MerchantBidRuntimeError(
      "MONAD_OFFER_NOT_FINALIZED",
      502,
      "Monad accepted the transaction, but finalized offer state was not observed.",
    );
  }

  return {
    ...evaluated.result,
    mode: "monad_gated_policy",
    message: registration.replayed
      ? "The aggregate policy passed; the identical sealed offer was already finalized on Monad Testnet."
      : "The aggregate policy passed; its sealed offer commitment finalized on Monad Testnet.",
    trace: [
      commitmentTrace,
      ...evaluated.result.trace,
      {
        stage: "monad_offer_commitment",
        actor: "POOL Monad operator",
        status: "completed" as const,
        detail: registration.replayed
          ? "Finalized registry state already contained the identical sealed offer commitment."
          : "The sealed offer commitment reached finalized Monad Testnet state.",
      },
    ],
    monad: {
      mode: "monad-testnet" as const,
      status: "offer_registered" as const,
      chainWriteRequired: true,
      chainWriteAttempted: !registration.replayed,
      confirmation: registration.transaction
        ? ("finalized" as const)
        : ("finalized-state" as const),
      commitmentId: preparation.commitmentId,
      fundingRoot: preparation.commitment.fundingRoot,
      committedAt: preparation.preparedAt,
      bidClosesAt: new Date(
        Number(preparation.commitment.bidClosesAt) * 1_000,
      ).toISOString(),
      offerHash,
      replayed: registration.replayed,
      transaction: monadTransactionForJson(registration.transaction),
    },
  };
}
