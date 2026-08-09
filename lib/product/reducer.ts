import {
  PRODUCT_POOL_BID_WINDOW_MS,
  ProductDomainError,
  type PoolMembership,
  type ProductActivityEntry,
  type ProductActivityKind,
  type ProductActivityMetadata,
  type ProductBuyingIntent,
  type ProductPool,
  type ProductTreasury,
  type ProductWorkspace,
  type ProductWorkspaceAction,
  type SandboxBalance,
} from "./types.ts";
import { minimumConsumerDeliveryDays } from "../market/consumer.ts";

/**
 * Fixed-window funding eligibility. The aggregate remains exact above the
 * minimum because the minimum is a viability floor, never a target or cap.
 */
export interface ProductPoolFundingStatus {
  readonly aggregateFundedUnitCount: number;
  readonly minimumCommittedUnitCount: number;
  readonly unitsNeeded: number;
  readonly hasMetMinimum: boolean;
}

export function evaluateProductPoolFunding(input: {
  readonly pool: ProductPool;
  readonly aggregateFundedUnitCount: number;
}): ProductPoolFundingStatus {
  if (
    !Number.isSafeInteger(input.pool.minimumCommittedUnitCount) ||
    input.pool.minimumCommittedUnitCount <= 0
  ) {
    throw new ProductDomainError(
      "INVALID_QUANTITY",
      "The product pool minimum funded quantity must be a positive integer.",
    );
  }
  if (
    !Number.isSafeInteger(input.aggregateFundedUnitCount) ||
    input.aggregateFundedUnitCount < 0
  ) {
    throw new ProductDomainError(
      "INVALID_QUANTITY",
      "The aggregate funded quantity must be a non-negative integer.",
    );
  }

  const unitsNeeded = Math.max(
    0,
    input.pool.minimumCommittedUnitCount - input.aggregateFundedUnitCount,
  );
  return {
    aggregateFundedUnitCount: input.aggregateFundedUnitCount,
    minimumCommittedUnitCount: input.pool.minimumCommittedUnitCount,
    unitsNeeded,
    hasMetMinimum: unitsNeeded === 0,
  };
}

export function hasProductPoolMetMinimum(pool: ProductPool) {
  return evaluateProductPoolFunding({
    pool,
    aggregateFundedUnitCount: pool.committedUnitCount,
  }).hasMetMinimum;
}

const requireIdentifier = (value: string, label: string) => {
  if (!value.trim()) {
    throw new ProductDomainError("INVALID_IDENTIFIER", `${label} is required.`);
  }
};

const timestamp = (value: string, label: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ProductDomainError(
      "INVALID_TIMESTAMP",
      `${label} must be a valid ISO date-time.`,
    );
  }
  return parsed;
};

const requirePositiveMoney = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProductDomainError(
      "INVALID_MONEY",
      `${label} must be a positive integer number of cents.`,
    );
  }
};

const requireNonNegativeMoney = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProductDomainError(
      "INVALID_MONEY",
      `${label} must be a non-negative integer number of cents.`,
    );
  }
};

const requirePositiveQuantity = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProductDomainError(
      "INVALID_QUANTITY",
      "Quantity must be a positive integer.",
    );
  }
};

const appendActivity = (
  workspace: ProductWorkspace,
  input: {
    readonly id: string;
    readonly at: string;
    readonly actorId: string;
    readonly kind: ProductActivityKind;
    readonly summary: string;
    readonly metadata: ProductActivityMetadata;
  },
): Pick<ProductWorkspace, "revision" | "activity"> => {
  requireIdentifier(input.id, "Activity ID");
  requireIdentifier(input.actorId, "Activity actor ID");
  timestamp(input.at, "Activity timestamp");
  if (workspace.activity.some((entry) => entry.id === input.id)) {
    throw new ProductDomainError(
      "DUPLICATE_ACTIVITY",
      `Activity ${input.id} already exists.`,
    );
  }

  const revision = workspace.revision + 1;
  const entry = Object.freeze<ProductActivityEntry>({
    id: input.id,
    workspaceRevision: revision,
    at: input.at,
    actorId: input.actorId,
    kind: input.kind,
    summary: input.summary,
    metadata: Object.freeze({ ...input.metadata }),
  });
  return {
    revision,
    activity: Object.freeze([...workspace.activity, entry]),
  };
};

const requireBuyerBalance = (workspace: ProductWorkspace, buyerId: string) => {
  requireIdentifier(buyerId, "Buyer ID");
  const balance = workspace.balances[buyerId];
  if (!balance) {
    throw new ProductDomainError(
      "BUYER_NOT_FOUND",
      `Buyer ${buyerId} does not have a sandbox account in this workspace.`,
    );
  }
  return balance;
};

/** Total already credited across every buyer in the workspace. */
const totalDepositedCents = (workspace: ProductWorkspace) =>
  Object.values(workspace.balances).reduce(
    (sum, balance) => sum + balance.totalDepositedCents,
    0,
  );

function syncTreasury(
  workspace: ProductWorkspace,
  action: Extract<ProductWorkspaceAction, { type: "treasury/sync" }>,
): ProductWorkspace {
  requireNonNegativeMoney(action.spendingPowerCents, "Spending power");
  requireNonNegativeMoney(action.creditLimitCents, "Credit limit");
  requireNonNegativeMoney(action.postedChargesCents, "Posted charges");
  requireNonNegativeMoney(action.pendingChargesCents, "Pending charges");

  // A ceiling below what buyers already hold would make the workspace
  // unreconcilable, so refuse rather than silently stranding reservations.
  const committed = totalDepositedCents(workspace);
  if (action.spendingPowerCents < committed) {
    throw new ProductDomainError(
      "TREASURY_LIMIT_EXCEEDED",
      `The rail can authorize ${action.spendingPowerCents} cents but ${committed} cents are already credited.`,
    );
  }

  const treasury: ProductTreasury = {
    source: action.source,
    currency: "USD",
    spendingPowerCents: action.spendingPowerCents,
    creditLimitCents: action.creditLimitCents,
    postedChargesCents: action.postedChargesCents,
    pendingChargesCents: action.pendingChargesCents,
    syncedAt: action.at,
  };
  const event = appendActivity(workspace, {
    id: action.activityId,
    at: action.at,
    actorId: "system",
    kind: "treasury.synced",
    summary:
      action.source === "rain-sandbox"
        ? "Spend ceiling synced from the live Rain sandbox."
        : "Spend ceiling set from the labeled offline fixture.",
    metadata: {
      source: action.source,
      spendingPowerCents: action.spendingPowerCents,
      creditLimitCents: action.creditLimitCents,
    },
  });
  return { ...workspace, ...event, treasury };
}

function depositSandboxFunds(
  workspace: ProductWorkspace,
  action: Extract<ProductWorkspaceAction, { type: "sandbox/deposit" }>,
): ProductWorkspace {
  requirePositiveMoney(action.amountCents, "Deposit");
  const current = requireBuyerBalance(workspace, action.buyerId);

  // Credits are bounded by what the payment rail can actually authorize.
  const projected = totalDepositedCents(workspace) + action.amountCents;
  if (projected > workspace.treasury.spendingPowerCents) {
    throw new ProductDomainError(
      "TREASURY_LIMIT_EXCEEDED",
      `Crediting ${action.amountCents} cents would exceed the ${workspace.treasury.spendingPowerCents}-cent rail spending power.`,
    );
  }

  const balance: SandboxBalance = {
    ...current,
    totalDepositedCents: current.totalDepositedCents + action.amountCents,
    availableCents: current.availableCents + action.amountCents,
  };
  const event = appendActivity(workspace, {
    id: action.activityId,
    at: action.at,
    actorId: action.buyerId,
    kind: "sandbox.deposit_recorded",
    summary: "Sandbox funds became available for group-buy commitments.",
    metadata: {
      amountCents: action.amountCents,
      currency: "USD",
      treasurySource: workspace.treasury.source,
    },
  });
  return {
    ...workspace,
    ...event,
    balances: { ...workspace.balances, [action.buyerId]: balance },
  };
}

function createBuyingIntent(
  workspace: ProductWorkspace,
  action: Extract<ProductWorkspaceAction, { type: "intent/create" }>,
): ProductWorkspace {
  requireIdentifier(action.intentId, "Intent ID");
  requireBuyerBalance(workspace, action.buyerId);
  const product = workspace.products[action.productId];
  if (!product) {
    throw new ProductDomainError(
      "PRODUCT_NOT_FOUND",
      `Product ${action.productId} does not exist.`,
    );
  }
  if (workspace.intents[action.intentId]) {
    throw new ProductDomainError(
      "DUPLICATE_INTENT",
      `Buying intent ${action.intentId} already exists.`,
    );
  }
  requirePositiveQuantity(action.quantity);
  requirePositiveMoney(action.targetUnitPriceCents, "Target unit price");
  const createdAt = timestamp(action.at, "Intent creation timestamp");
  const expiresAt = timestamp(action.expiresAt, "Intent expiration timestamp");
  if (expiresAt <= createdAt) {
    throw new ProductDomainError(
      "INVALID_TIMESTAMP",
      "Buying intent expiration must be after its creation.",
    );
  }

  const intent: ProductBuyingIntent = {
    id: action.intentId,
    buyerId: action.buyerId,
    productId: action.productId,
    quantity: action.quantity,
    targetUnitPriceCents: action.targetUnitPriceCents,
    createdAt: action.at,
    expiresAt: action.expiresAt,
    status: "open",
  };
  const event = appendActivity(workspace, {
    id: action.activityId,
    at: action.at,
    actorId: action.buyerId,
    kind: "intent.created",
    summary: `Buying intent created for ${product.name}.`,
    metadata: {
      intentId: intent.id,
      productId: product.id,
      quantity: intent.quantity,
      targetUnitPriceCents: intent.targetUnitPriceCents,
    },
  });
  return {
    ...workspace,
    ...event,
    intents: { ...workspace.intents, [intent.id]: intent },
  };
}

function joinProductPool(
  workspace: ProductWorkspace,
  action: Extract<ProductWorkspaceAction, { type: "pool/join" }>,
): ProductWorkspace {
  requireIdentifier(action.membershipId, "Membership ID");
  const balance = requireBuyerBalance(workspace, action.buyerId);
  const pool = workspace.pools[action.poolId];
  if (!pool) {
    throw new ProductDomainError("POOL_NOT_FOUND", `Pool ${action.poolId} does not exist.`);
  }
  const intent = workspace.intents[action.intentId];
  if (!intent) {
    throw new ProductDomainError(
      "INTENT_NOT_FOUND",
      `Buying intent ${action.intentId} does not exist.`,
    );
  }
  if (intent.buyerId !== action.buyerId) {
    throw new ProductDomainError(
      "INTENT_BUYER_MISMATCH",
      "A buyer can only join with their own buying intent.",
    );
  }
  if (intent.productId !== pool.productId) {
    throw new ProductDomainError(
      "INTENT_PRODUCT_MISMATCH",
      "The buying intent product does not match this pool.",
    );
  }
  if (intent.status !== "open") {
    throw new ProductDomainError(
      "INTENT_NOT_OPEN",
      "Only an open buying intent can join a pool.",
    );
  }
  if (pool.status !== "forming") {
    throw new ProductDomainError(
      "POOL_NOT_FORMING",
      "Only a forming pool accepts new members.",
    );
  }

  const joinedAt = timestamp(action.at, "Join timestamp");
  if (joinedAt >= timestamp(pool.cutoffAt, "Pool cutoff")) {
    throw new ProductDomainError(
      "POOL_CUTOFF_PASSED",
      "This pool is no longer accepting commitments.",
    );
  }
  if (joinedAt >= timestamp(intent.expiresAt, "Intent expiration")) {
    throw new ProductDomainError(
      "INTENT_EXPIRED",
      "The buying intent expired before the join was requested.",
    );
  }
  if (pool.estimatedUnitPriceCents > intent.targetUnitPriceCents) {
    throw new ProductDomainError(
      "INTENT_PRICE_INCOMPATIBLE",
      "This pool's published price target exceeds the buying intent maximum.",
    );
  }
  if (
    timestamp(pool.cutoffAt, "Pool cutoff") +
      PRODUCT_POOL_BID_WINDOW_MS +
      minimumConsumerDeliveryDays() * 24 * 60 * 60 * 1_000 >
    timestamp(intent.expiresAt, "Intent expiration")
  ) {
    throw new ProductDomainError(
      "INTENT_DEADLINE_INCOMPATIBLE",
      "Even the fastest modeled delivery would arrive after the buying intent deadline.",
    );
  }
  if (
    workspace.memberships[action.membershipId] ||
    Object.values(workspace.memberships).some(
      (membership) =>
        membership.status === "active" &&
        (membership.intentId === intent.id ||
          (membership.poolId === pool.id && membership.buyerId === action.buyerId)),
    )
  ) {
    throw new ProductDomainError(
      "DUPLICATE_MEMBERSHIP",
      "This buyer already has an active commitment to the pool.",
    );
  }

  const product = workspace.products[pool.productId];
  if (!product) {
    throw new ProductDomainError(
      "PRODUCT_NOT_FOUND",
      `Product ${pool.productId} does not exist.`,
    );
  }
  const reservationCents = product.msrpUnitCents * intent.quantity;
  if (!Number.isSafeInteger(reservationCents) || balance.availableCents < reservationCents) {
    throw new ProductDomainError(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      `Joining requires the full MSRP reservation of ${reservationCents} cents.`,
    );
  }

  const membership: PoolMembership = {
    id: action.membershipId,
    poolId: pool.id,
    intentId: intent.id,
    buyerId: action.buyerId,
    quantity: intent.quantity,
    reservedCents: reservationCents,
    status: "active",
    joinedAt: action.at,
  };
  const event = appendActivity(workspace, {
    id: action.activityId,
    at: action.at,
    actorId: action.buyerId,
    kind: "pool.joined",
    summary: `Joined the ${product.name} group buy with MSRP fully reserved.`,
    metadata: {
      membershipId: membership.id,
      intentId: intent.id,
      poolId: pool.id,
      quantity: intent.quantity,
      reservedCents: reservationCents,
    },
  });
  return {
    ...workspace,
    ...event,
    balances: {
      ...workspace.balances,
      [action.buyerId]: {
        ...balance,
        availableCents: balance.availableCents - reservationCents,
        reservedCents: balance.reservedCents + reservationCents,
      },
    },
    intents: {
      ...workspace.intents,
      [intent.id]: { ...intent, status: "joined" },
    },
    memberships: { ...workspace.memberships, [membership.id]: membership },
    pools: {
      ...workspace.pools,
      [pool.id]: {
        ...pool,
        committedUnitCount: pool.committedUnitCount + intent.quantity,
      },
    },
  };
}

function leaveProductPool(
  workspace: ProductWorkspace,
  action: Extract<ProductWorkspaceAction, { type: "pool/leave" }>,
): ProductWorkspace {
  const balance = requireBuyerBalance(workspace, action.buyerId);
  const membership = workspace.memberships[action.membershipId];
  if (!membership) {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_FOUND",
      `Membership ${action.membershipId} does not exist.`,
    );
  }
  if (membership.buyerId !== action.buyerId) {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_FOUND",
      "The membership does not belong to this buyer.",
    );
  }
  if (membership.status !== "active") {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_ACTIVE",
      "Only an active pool membership can be left.",
    );
  }
  const pool = workspace.pools[membership.poolId];
  if (!pool) {
    throw new ProductDomainError(
      "POOL_NOT_FOUND",
      `Pool ${membership.poolId} does not exist.`,
    );
  }
  const leftAt = timestamp(action.at, "Leave timestamp");
  if (leftAt >= timestamp(pool.cutoffAt, "Pool cutoff")) {
    throw new ProductDomainError(
      "POOL_CUTOFF_PASSED",
      "Reserved funds cannot be released after the pool cutoff.",
    );
  }
  if (balance.reservedCents < membership.reservedCents) {
    throw new ProductDomainError(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      "The account reservation no longer reconciles to this membership.",
    );
  }
  const intent = workspace.intents[membership.intentId];
  if (!intent) {
    throw new ProductDomainError(
      "INTENT_NOT_FOUND",
      `Buying intent ${membership.intentId} does not exist.`,
    );
  }
  const product = workspace.products[pool.productId];
  if (!product) {
    throw new ProductDomainError(
      "PRODUCT_NOT_FOUND",
      `Product ${pool.productId} does not exist.`,
    );
  }
  const event = appendActivity(workspace, {
    id: action.activityId,
    at: action.at,
    actorId: action.buyerId,
    kind: "pool.left",
    summary: `Left the ${product.name} group buy before cutoff; the MSRP reservation was released.`,
    metadata: {
      membershipId: membership.id,
      intentId: intent.id,
      poolId: pool.id,
      releasedCents: membership.reservedCents,
    },
  });
  return {
    ...workspace,
    ...event,
    balances: {
      ...workspace.balances,
      [action.buyerId]: {
        ...balance,
        availableCents: balance.availableCents + membership.reservedCents,
        reservedCents: balance.reservedCents - membership.reservedCents,
      },
    },
    intents: {
      ...workspace.intents,
      [intent.id]: { ...intent, status: "withdrawn" },
    },
    memberships: {
      ...workspace.memberships,
      [membership.id]: { ...membership, status: "left", leftAt: action.at },
    },
    pools: {
      ...workspace.pools,
      [pool.id]: {
        ...pool,
        committedUnitCount: pool.committedUnitCount - membership.quantity,
      },
    },
  };
}

/**
 * Releases a reservation after the fixed window produced a terminal no-buy
 * outcome. This is deliberately distinct from `pool/leave`: buyers control a
 * leave only before cutoff, while this transition requires a server-derived
 * market operation and preserves its reason for audit.
 */
function releaseReservationAfterOutcome(
  workspace: ProductWorkspace,
  action: Extract<
    ProductWorkspaceAction,
    { type: "pool/release_after_outcome" }
  >,
): ProductWorkspace {
  requireIdentifier(action.operationId, "Release operation ID");
  const balance = requireBuyerBalance(workspace, action.buyerId);
  const membership = workspace.memberships[action.membershipId];
  if (!membership) {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_FOUND",
      `Membership ${action.membershipId} does not exist.`,
    );
  }
  if (membership.buyerId !== action.buyerId) {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_FOUND",
      "The membership does not belong to this buyer.",
    );
  }

  // A retry of the exact server outcome is a no-op. A different outcome, a
  // settled order, or a prior buyer exit can never credit the reservation a
  // second time.
  if (
    membership.status === "released" &&
    membership.release?.operationId === action.operationId &&
    membership.release.reason === action.reason
  ) {
    return workspace;
  }
  if (membership.status !== "active") {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_ACTIVE",
      "Only an active, unsettled reservation can be released after a no-buy outcome.",
    );
  }
  if (
    Object.values(workspace.memberships).some(
      (candidate) =>
        candidate.id !== membership.id &&
        candidate.release?.operationId === action.operationId,
    )
  ) {
    throw new ProductDomainError(
      "DUPLICATE_RELEASE_OPERATION",
      "This market outcome already released a different reservation.",
    );
  }

  const pool = workspace.pools[membership.poolId];
  if (!pool) {
    throw new ProductDomainError(
      "POOL_NOT_FOUND",
      `Pool ${membership.poolId} does not exist.`,
    );
  }
  const releasedAt = timestamp(action.at, "Outcome release timestamp");
  if (releasedAt < timestamp(pool.cutoffAt, "Pool cutoff")) {
    throw new ProductDomainError(
      "POOL_CUTOFF_NOT_REACHED",
      "A market outcome cannot release a reservation before the published cutoff.",
    );
  }
  if (
    action.reason === "execution_window_missed" &&
    releasedAt <
      timestamp(pool.cutoffAt, "Pool cutoff") + PRODUCT_POOL_BID_WINDOW_MS
  ) {
    throw new ProductDomainError(
      "RELEASE_OUTCOME_MISMATCH",
      "A missed-window release is unavailable until the complete bid window has expired.",
    );
  }
  if (
    action.reason === "minimum_not_met" &&
    evaluateProductPoolFunding({
      pool,
      aggregateFundedUnitCount: pool.committedUnitCount,
    }).hasMetMinimum
  ) {
    throw new ProductDomainError(
      "RELEASE_OUTCOME_MISMATCH",
      "A pool that met its funded minimum cannot use a below-minimum release.",
    );
  }
  if (balance.reservedCents < membership.reservedCents) {
    throw new ProductDomainError(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      "The account reservation no longer reconciles to this membership.",
    );
  }
  const intent = workspace.intents[membership.intentId];
  if (!intent) {
    throw new ProductDomainError(
      "INTENT_NOT_FOUND",
      `Buying intent ${membership.intentId} does not exist.`,
    );
  }
  const product = workspace.products[pool.productId];
  if (!product) {
    throw new ProductDomainError(
      "PRODUCT_NOT_FOUND",
      `Product ${pool.productId} does not exist.`,
    );
  }

  const release = Object.freeze({
    reason: action.reason,
    operationId: action.operationId,
    releasedCents: membership.reservedCents,
    releasedAt: action.at,
  });
  const event = appendActivity(workspace, {
    id: action.activityId,
    at: action.at,
    actorId: "system",
    kind: "pool.reservation_released",
    summary:
      action.reason === "minimum_not_met"
        ? `${product.name} closed below its funded minimum; the full MSRP reservation was released.`
        : action.reason === "no_acceptable_offer"
          ? `${product.name} received no acceptable merchant offer; the full MSRP reservation was released.`
          : action.reason === "authorization_declined"
            ? `${product.name} payment authorization was declined; the full MSRP reservation was released.`
            : action.reason === "execution_failed"
              ? `${product.name} provider execution failed and every open authorization was reversed; the full MSRP reservation was released.`
              : action.reason === "rehearsal_complete"
                ? `${product.name} produced a modeled quote without placing an order; the full browser-local reservation was released.`
                : `${product.name} missed its rehearsal window without any provider path; the full browser-local reservation was released.`,
    metadata: {
      membershipId: membership.id,
      intentId: intent.id,
      poolId: pool.id,
      reason: action.reason,
      operationId: action.operationId,
      releasedCents: membership.reservedCents,
    },
  });

  return {
    ...workspace,
    ...event,
    balances: {
      ...workspace.balances,
      [action.buyerId]: {
        ...balance,
        availableCents: balance.availableCents + membership.reservedCents,
        reservedCents: balance.reservedCents - membership.reservedCents,
      },
    },
    intents: {
      ...workspace.intents,
      [intent.id]: { ...intent, status: "expired" },
    },
    memberships: {
      ...workspace.memberships,
      [membership.id]: {
        ...membership,
        status: "released",
        release,
      },
    },
    pools: {
      ...workspace.pools,
      [pool.id]: { ...pool, status: "cancelled" },
    },
  };
}

/**
 * Applies a cleared market to one buyer's commitment.
 *
 * The capture is consumed from the reservation and the exact remainder returns
 * to available balance. Capture may never exceed the reservation, so a bad or
 * tampered settlement response cannot spend more than the buyer committed.
 */
function settleProductPool(
  workspace: ProductWorkspace,
  action: Extract<ProductWorkspaceAction, { type: "pool/settle" }>,
): ProductWorkspace {
  requirePositiveMoney(action.capturedCents, "Capture");
  requirePositiveMoney(action.unitPriceCents, "Winning unit price");
  const balance = requireBuyerBalance(workspace, action.buyerId);
  const membership = workspace.memberships[action.membershipId];
  if (!membership) {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_FOUND",
      `Membership ${action.membershipId} does not exist.`,
    );
  }
  if (membership.buyerId !== action.buyerId) {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_FOUND",
      "The membership does not belong to this buyer.",
    );
  }
  if (membership.status !== "active") {
    throw new ProductDomainError(
      "MEMBERSHIP_NOT_ACTIVE",
      "Only an active pool commitment can settle.",
    );
  }
  if (action.capturedCents > membership.reservedCents) {
    throw new ProductDomainError(
      "CAPTURE_EXCEEDS_RESERVATION",
      `A capture of ${action.capturedCents} cents exceeds the ${membership.reservedCents}-cent reservation.`,
    );
  }
  if (balance.reservedCents < membership.reservedCents) {
    throw new ProductDomainError(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      "The account reservation no longer reconciles to this membership.",
    );
  }
  const pool = workspace.pools[membership.poolId];
  if (!pool) {
    throw new ProductDomainError(
      "POOL_NOT_FOUND",
      `Pool ${membership.poolId} does not exist.`,
    );
  }
  const settledAt = timestamp(action.at, "Settlement timestamp");
  if (settledAt < timestamp(pool.cutoffAt, "Pool cutoff")) {
    throw new ProductDomainError(
      "POOL_CUTOFF_NOT_REACHED",
      "A pool cannot settle before its published commitment cutoff.",
    );
  }
  const product = workspace.products[pool.productId];
  if (!product) {
    throw new ProductDomainError(
      "PRODUCT_NOT_FOUND",
      `Product ${pool.productId} does not exist.`,
    );
  }

  const releasedCents = membership.reservedCents - action.capturedCents;
  const settlement = {
    evidence: action.evidence,
    unitPriceCents: action.unitPriceCents,
    capturedCents: action.capturedCents,
    releasedCents,
    merchantName: action.merchantName,
    settledAt: action.at,
    ...(action.rainTransactionId
      ? { rainTransactionId: action.rainTransactionId }
      : {}),
    ...(action.rainCardLast4 ? { rainCardLast4: action.rainCardLast4 } : {}),
  };
  const event = appendActivity(workspace, {
    id: action.activityId,
    at: action.at,
    actorId: action.buyerId,
    kind: "pool.settled",
    summary: `${product.name} order cleared with ${action.merchantName}; the MSRP-to-deal difference was released.`,
    metadata: {
      membershipId: membership.id,
      poolId: pool.id,
      evidence: action.evidence,
      unitPriceCents: action.unitPriceCents,
      capturedCents: action.capturedCents,
      releasedCents,
    },
  });

  return {
    ...workspace,
    ...event,
    balances: {
      ...workspace.balances,
      [action.buyerId]: {
        ...balance,
        reservedCents: balance.reservedCents - membership.reservedCents,
        capturedCents: balance.capturedCents + action.capturedCents,
        availableCents: balance.availableCents + releasedCents,
      },
    },
    memberships: {
      ...workspace.memberships,
      [membership.id]: { ...membership, status: "settled", settlement },
    },
    pools: {
      ...workspace.pools,
      [pool.id]: { ...pool, status: "ordered" },
    },
  };
}

/**
 * Pure product-state transition function. It performs no clock, network, storage,
 * wallet, or payment I/O; callers supply every ID and timestamp explicitly.
 */
export function reduceProductWorkspace(
  workspace: ProductWorkspace,
  action: ProductWorkspaceAction,
): ProductWorkspace {
  switch (action.type) {
    case "treasury/sync":
      return syncTreasury(workspace, action);
    case "sandbox/deposit":
      return depositSandboxFunds(workspace, action);
    case "intent/create":
      return createBuyingIntent(workspace, action);
    case "pool/join":
      return joinProductPool(workspace, action);
    case "pool/leave":
      return leaveProductPool(workspace, action);
    case "pool/release_after_outcome":
      return releaseReservationAfterOutcome(workspace, action);
    case "pool/settle":
      return settleProductPool(workspace, action);
  }
}

export function assertProductWorkspaceInvariant(workspace: ProductWorkspace) {
  const treasury = workspace.treasury;
  if (
    !Number.isSafeInteger(treasury.spendingPowerCents) ||
    treasury.spendingPowerCents < 0
  ) {
    throw new Error("Workspace treasury spending power is not a valid amount.");
  }
  if (totalDepositedCents(workspace) > treasury.spendingPowerCents) {
    throw new Error("Workspace credits exceed the rail spending power.");
  }
  for (const pool of Object.values(workspace.pools)) {
    if (
      !Number.isSafeInteger(pool.minimumCommittedUnitCount) ||
      pool.minimumCommittedUnitCount <= 0
    ) {
      throw new Error(`Pool ${pool.id} minimum funded quantity is invalid.`);
    }
    if (
      !Number.isSafeInteger(pool.committedUnitCount) ||
      pool.committedUnitCount < 0
    ) {
      throw new Error(`Pool ${pool.id} committed quantity is invalid.`);
    }
    if (
      timestamp(pool.cutoffAt, "Pool cutoff") <=
      timestamp(pool.createdAt, "Pool creation timestamp")
    ) {
      throw new Error(`Pool ${pool.id} cutoff must be after its creation.`);
    }
  }
  for (const balance of Object.values(workspace.balances)) {
    const reconciled =
      balance.availableCents + balance.reservedCents + balance.capturedCents;
    if (reconciled !== balance.totalDepositedCents) {
      throw new Error(`Buyer ${balance.buyerId} sandbox balance does not reconcile.`);
    }
    const membershipReservations = Object.values(workspace.memberships)
      .filter(
        (membership) =>
          membership.buyerId === balance.buyerId && membership.status === "active",
      )
      .reduce((sum, membership) => sum + membership.reservedCents, 0);
    if (membershipReservations !== balance.reservedCents) {
      throw new Error(`Buyer ${balance.buyerId} pool reservations do not reconcile.`);
    }
  }
  for (const membership of Object.values(workspace.memberships)) {
    const pool = workspace.pools[membership.poolId];
    if (!pool) {
      throw new Error(`Membership ${membership.id} references a missing pool.`);
    }
    if (membership.status === "released") {
      if (
        !membership.release ||
        membership.release.releasedCents !== membership.reservedCents ||
        !membership.release.operationId.trim() ||
        timestamp(membership.release.releasedAt, "Release timestamp") <
          timestamp(pool.cutoffAt, "Pool cutoff") ||
        (membership.release.reason === "execution_window_missed" &&
          timestamp(membership.release.releasedAt, "Release timestamp") <
            timestamp(pool.cutoffAt, "Pool cutoff") +
              PRODUCT_POOL_BID_WINDOW_MS)
      ) {
        throw new Error(
          `Membership ${membership.id} does not have a valid post-cutoff release.`,
        );
      }
    } else if (membership.release) {
      throw new Error(
        `Membership ${membership.id} has release evidence without released status.`,
      );
    }
    if (membership.status === "settled" && !membership.settlement) {
      throw new Error(`Membership ${membership.id} is settled without settlement evidence.`);
    }
  }
  if (workspace.activity.at(-1)?.workspaceRevision !== workspace.revision) {
    throw new Error("Workspace revision does not match the activity stream.");
  }
  return true;
}
