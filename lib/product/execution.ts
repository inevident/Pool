import { keccak256, toBytes } from "viem";
import { z } from "zod";

import {
  buildProductPoolCommitment,
  productReservationSet,
  type PreparedProductCommitment,
} from "../monad/product-commitment.ts";
import { minimumConsumerDeliveryDays } from "../market/consumer.ts";
import { ProductExecutionError } from "./errors.ts";
import { productExecutionSchedule } from "./schedule.ts";
import {
  PRODUCT_SEED_VERSION,
  type PoolMembershipEnvelope,
  type ProductBuyingIntent,
  type ProductListing,
  type ProductPool,
  type ProductWorkspace,
} from "./types.ts";
const SCOPED_CARD_LIFETIME_AFTER_BIDS_MS = 2 * 24 * 60 * 60 * 1_000;
const SETTLEMENT_OPERATION_DOMAIN = "POOL_RAIN_SETTLEMENT_OPERATION_V1";

export const poolMembershipEnvelopeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    poolId: z.string().trim().min(1).max(64),
    intentId: z.string().trim().min(1).max(128),
    buyerId: z.string().trim().min(1).max(128),
    quantity: z.number().int().min(1).max(20),
    reservedCents: z.number().int().positive().safe(),
    status: z.enum(["active", "left", "released", "settled"]),
    joinedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export interface ValidatedProductExecution {
  readonly pool: ProductPool;
  readonly product: ProductListing;
  readonly membership: PoolMembershipEnvelope;
  readonly aggregateUnits: number;
  readonly buyerReservedCents: number;
  readonly aggregateReservedCents: number;
}

export interface ValidatedProductIntentConstraints {
  readonly intentId: string;
  readonly buyerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly maxUnitPriceCents: number;
  readonly createdAt: string;
  readonly deliverBy: string;
}

/**
 * Reconciles a browser-held membership to the immutable server catalog.
 *
 * The demo keeps its buyer ledger locally, so this establishes structural
 * authority rather than claiming provider custody or a server-side account
 * database. In particular, quantity and reservation economics are rebuilt from
 * server MSRP, and the seeded workspace owner is the only executable buyer.
 */
export function validateProductExecutionMembership(input: {
  readonly workspace: ProductWorkspace;
  readonly poolId: string;
  readonly membership: PoolMembershipEnvelope;
}): ValidatedProductExecution {
  const pool = input.workspace.pools[input.poolId];
  if (!pool) {
    throw new ProductExecutionError("pool_not_found", "Unknown pool.");
  }
  const product = input.workspace.products[pool.productId];
  if (!product) {
    throw new ProductExecutionError(
      "product_not_found",
      "The pool's catalog product is unavailable.",
    );
  }
  if (input.membership.poolId !== pool.id) {
    throw new ProductExecutionError(
      "membership_pool_mismatch",
      "The membership does not belong to the requested pool.",
    );
  }
  if (input.membership.buyerId !== input.workspace.owner.id) {
    throw new ProductExecutionError(
      "membership_buyer_mismatch",
      "The membership does not belong to this workspace buyer.",
    );
  }
  if (input.membership.status !== "active") {
    throw new ProductExecutionError(
      "membership_not_active",
      "Only an active membership can be committed or settled.",
    );
  }

  const buyerReservedCents = product.msrpUnitCents * input.membership.quantity;
  if (
    !Number.isSafeInteger(buyerReservedCents) ||
    input.membership.reservedCents !== buyerReservedCents
  ) {
    throw new ProductExecutionError(
      "membership_reservation_mismatch",
      "The membership reservation does not reconcile to server catalog MSRP.",
    );
  }

  const joinedAt = Date.parse(input.membership.joinedAt);
  const cutoffAt = Date.parse(pool.cutoffAt);
  if (!Number.isFinite(joinedAt) || joinedAt >= cutoffAt) {
    throw new ProductExecutionError(
      "membership_joined_after_cutoff",
      "The membership was not joined before the published pool cutoff.",
    );
  }

  const aggregateUnits = pool.committedUnitCount + input.membership.quantity;
  const aggregateReservedCents = product.msrpUnitCents * aggregateUnits;
  return {
    pool,
    product,
    membership: input.membership,
    aggregateUnits,
    buyerReservedCents,
    aggregateReservedCents,
  };
}

/**
 * Reconciles the browser's saved mandate to the already validated membership.
 *
 * This is not a server ledger: before any live provider use, the returned
 * constraints must be wrapped in a server-signed execution capability. It does
 * ensure a signer can never accidentally authorize a pool that contradicts the
 * buyer's own maximum or expires before the market finishes.
 */
export function validateProductExecutionIntent(input: {
  readonly execution: ValidatedProductExecution;
  readonly intent: Pick<
    ProductBuyingIntent,
    | "id"
    | "buyerId"
    | "productId"
    | "quantity"
    | "targetUnitPriceCents"
    | "createdAt"
    | "expiresAt"
    | "status"
  >;
}): ValidatedProductIntentConstraints {
  const { execution, intent } = input;
  if (
    intent.id !== execution.membership.intentId ||
    intent.buyerId !== execution.membership.buyerId ||
    intent.productId !== execution.product.id ||
    intent.quantity !== execution.membership.quantity ||
    intent.status !== "joined"
  ) {
    throw new ProductExecutionError(
      "intent_identity_mismatch",
      "The saved buying intent does not match this active membership.",
    );
  }

  const createdAt = Date.parse(intent.createdAt);
  const joinedAt = Date.parse(execution.membership.joinedAt);
  const deliverBy = Date.parse(intent.expiresAt);
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(deliverBy) ||
    createdAt > joinedAt ||
    deliverBy <= joinedAt
  ) {
    throw new ProductExecutionError(
      "intent_identity_mismatch",
      "The saved buying intent has an invalid lifecycle.",
    );
  }
  if (
    !Number.isSafeInteger(intent.targetUnitPriceCents) ||
    intent.targetUnitPriceCents <= 0 ||
    execution.pool.estimatedUnitPriceCents > intent.targetUnitPriceCents
  ) {
    throw new ProductExecutionError(
      "intent_price_incompatible",
      "This pool's published price target exceeds the buyer's maximum unit price.",
    );
  }

  const schedule = productExecutionSchedule(execution.pool);
  if (
    Date.parse(schedule.bidClosesAt) +
      minimumConsumerDeliveryDays() * 24 * 60 * 60 * 1_000 >
    deliverBy
  ) {
    throw new ProductExecutionError(
      "intent_deadline_incompatible",
      "Even the fastest modeled delivery would arrive after the buyer's deadline.",
    );
  }

  return Object.freeze({
    intentId: intent.id,
    buyerId: intent.buyerId,
    productId: intent.productId,
    quantity: intent.quantity,
    maxUnitPriceCents: intent.targetUnitPriceCents,
    createdAt: new Date(createdAt).toISOString(),
    deliverBy: new Date(deliverBy).toISOString(),
  });
}

export type ProductSettlementConstraintResult =
  | {
      readonly accepted: true;
      readonly promisedDeliveryAt: string;
    }
  | {
      readonly accepted: false;
      readonly code: "buyer_price_limit_exceeded" | "buyer_deadline_exceeded";
      readonly promisedDeliveryAt: string;
    };

/** Final defense before a winning offer can reach Monad or Rain. */
export function evaluateProductSettlementConstraints(input: {
  readonly pool: ProductPool;
  readonly constraints: ValidatedProductIntentConstraints;
  readonly unitPriceCents: number;
  readonly deliveryDays: number;
}): ProductSettlementConstraintResult {
  const schedule = productExecutionSchedule(input.pool);
  const promisedDeliveryAt = new Date(
    Date.parse(schedule.bidClosesAt) + input.deliveryDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
  if (input.unitPriceCents > input.constraints.maxUnitPriceCents) {
    return {
      accepted: false,
      code: "buyer_price_limit_exceeded",
      promisedDeliveryAt,
    };
  }
  if (Date.parse(promisedDeliveryAt) > Date.parse(input.constraints.deliverBy)) {
    return {
      accepted: false,
      code: "buyer_deadline_exceeded",
      promisedDeliveryAt,
    };
  }
  return { accepted: true, promisedDeliveryAt };
}

export function buildDeterministicProductCommitment(
  execution: ValidatedProductExecution,
): PreparedProductCommitment {
  const schedule = productExecutionSchedule(execution.pool);
  return buildProductPoolCommitment({
    pool: execution.pool,
    product: execution.product,
    reservations: productReservationSet({
      pool: execution.pool,
      product: execution.product,
      buyerId: execution.membership.buyerId,
      buyerIntentId: execution.membership.intentId,
      buyerQuantity: execution.membership.quantity,
    }),
    frozenAt: schedule.cutoffAt,
    bidClosesAt: schedule.bidClosesAt,
  });
}

/**
 * Stable UUID-shaped reservation operation id for one canonical buyer/pool
 * window and exact server-rebuilt reservation economics.
 *
 * Browser-chosen membership ids, intent ids, and join timestamps are excluded,
 * so relabeling the same reservation cannot rotate its identity. Quantity and
 * reservation remain bound because different economics are different provider
 * operations and must never reuse a Rain idempotency key.
 */
export function deriveSettlementOperationId(
  execution: ValidatedProductExecution,
): string {
  const canonical = [
    SETTLEMENT_OPERATION_DOMAIN,
    PRODUCT_SEED_VERSION,
    execution.pool.id,
    execution.pool.productId,
    execution.pool.cutoffAt,
    execution.membership.buyerId,
    String(execution.membership.quantity),
    String(execution.buyerReservedCents),
  ].join("\u001f");
  const source = keccak256(toBytes(canonical)).slice(2, 34).split("");
  source[12] = "5";
  source[16] = ((Number.parseInt(source[16], 16) & 0x3) | 0x8).toString(16);
  const hex = source.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Scoped-card expiry is stable across retries and independent of wall clock. */
export function deterministicScopedCardExpiry(pool: ProductPool): string {
  const schedule = productExecutionSchedule(pool);
  return new Date(
    Date.parse(schedule.bidClosesAt) + SCOPED_CARD_LIFETIME_AFTER_BIDS_MS,
  ).toISOString();
}

/**
 * Deterministic structural authority for the Rain request sequence. This is a
 * request plan, not proof of custody: Rain remains the source of truth for card
 * and transaction state.
 */
export function buildSettlementProviderAuthority(
  execution: ValidatedProductExecution,
  input: {
    readonly capturedCents: number;
    readonly allowedMcc: string;
    readonly blockedMcc: string;
    readonly merchantName: string;
  },
) {
  if (
    !Number.isSafeInteger(input.capturedCents) ||
    input.capturedCents <= 0 ||
    input.capturedCents > execution.buyerReservedCents
  ) {
    throw new ProductExecutionError(
      "membership_reservation_mismatch",
      "Provider authority must stay within the validated membership reservation.",
    );
  }
  const operationId = deriveSettlementOperationId(execution);
  const expiresAt = deterministicScopedCardExpiry(execution.pool);
  // Rain returns a cached response when a key repeats, so the key namespace
  // must fingerprint every versioned provider payload field. Only byte-for-byte
  // equivalent operations share retry keys.
  const providerPayloadFingerprint = keccak256(
    toBytes(
      [
        "POOL_RAIN_PROVIDER_PAYLOAD_V1",
        operationId,
        String(input.capturedCents),
        input.allowedMcc,
        input.blockedMcc,
        input.merchantName,
        expiresAt,
      ].join("\u001f"),
    ),
  ).slice(2, 10);
  const runKey = `ps-${operationId}-${providerPayloadFingerprint}`;
  return Object.freeze({
    operationId,
    card: Object.freeze({
      amountInUSDCents: input.capturedCents,
      allowedMccs: Object.freeze([input.allowedMcc] as const),
      expiresAt,
      idempotencyKey: `${runKey}-card`,
    }),
    blockedProbe: Object.freeze({
      amountInCents: input.capturedCents,
      merchantName: `${input.merchantName} (off-policy probe)`,
      merchantCategoryCode: input.blockedMcc,
      idempotencyKey: `${runKey}-blocked-probe`,
    }),
    authorization: Object.freeze({
      amountInCents: input.capturedCents,
      merchantName: input.merchantName,
      merchantCategoryCode: input.allowedMcc,
      idempotencyKey: `${runKey}-authorize`,
    }),
    settlementIdempotencyKey: `${runKey}-settle`,
    unsafeProbeReversalIdempotencyKey: `${runKey}-probe-reverse`,
    compensationIdempotencyKey: `${runKey}-compensate`,
  });
}
