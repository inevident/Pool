export const PRODUCT_WORKSPACE_SCHEMA_VERSION = 5 as const;
export const PRODUCT_SEED_VERSION = "2026.08.09-catalog-import" as const;
export const PRODUCT_POOL_BID_WINDOW_MS = 60 * 60 * 1_000;

export type Cents = number;
export type IsoDateTime = string;
export type Currency = "USD";

export type ProductCategory =
  | "audio"
  | "gaming"
  | "computing"
  | "home";

export interface ProductListing {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly category: ProductCategory;
  readonly imageUrl: string;
  readonly msrpUnitCents: Cents;
  readonly currency: Currency;
  readonly description: string;
}

export type ProductPoolStatus =
  | "forming"
  | "locked"
  | "bidding"
  | "ordered"
  | "completed"
  | "cancelled";

export interface ProductPool {
  readonly id: string;
  readonly productId: string;
  readonly status: ProductPoolStatus;
  readonly cutoffAt: IsoDateTime;
  /**
   * Smallest funded quantity that makes the pool viable when its commitment
   * window closes. This is a floor, never an enrollment target or cap: every
   * funded commitment submitted before `cutoffAt` remains welcome.
   */
  readonly minimumCommittedUnitCount: number;
  readonly committedUnitCount: number;
  readonly estimatedUnitPriceCents: Cents;
  readonly createdAt: IsoDateTime;
}

export interface BuyerProfile {
  readonly id: string;
  readonly displayName: string;
}

export interface SandboxBalance {
  readonly buyerId: string;
  readonly currency: Currency;
  readonly totalDepositedCents: Cents;
  readonly availableCents: Cents;
  readonly reservedCents: Cents;
  /** Consumed by a settled order. Mirrors `lib/funding`'s capture bucket. */
  readonly capturedCents: Cents;
}

/**
 * Where the workspace's spend ceiling comes from.
 *
 * `rain-sandbox` means the ceiling was read from the live Rain sandbox
 * (`GET /issuing/balances`) and is a real provider number. `local` means Rain
 * was unreachable, unconfigured, or locked, and the ceiling is a labeled
 * offline fixture. The distinction must stay visible in the UI.
 */
export type TreasurySource = "rain-sandbox" | "local";

/**
 * The workspace's funding ceiling. POOL may never let total deposits exceed
 * `spendingPowerCents`, because that is the amount the payment rail can
 * actually authorize. This is a rail-level capacity figure, not custody of
 * buyer money.
 */
export interface ProductTreasury {
  readonly source: TreasurySource;
  readonly currency: Currency;
  readonly spendingPowerCents: Cents;
  readonly creditLimitCents: Cents;
  readonly postedChargesCents: Cents;
  readonly pendingChargesCents: Cents;
  readonly syncedAt: IsoDateTime | null;
}

export type BuyingIntentStatus = "open" | "joined" | "withdrawn" | "expired";

export interface ProductBuyingIntent {
  readonly id: string;
  readonly buyerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly targetUnitPriceCents: Cents;
  readonly createdAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
  readonly status: BuyingIntentStatus;
}

export type PoolMembershipStatus = "active" | "left" | "released" | "settled";

/** A terminal market outcome that permits the full reservation to return. */
export type ReservationReleaseReason =
  | "minimum_not_met"
  | "no_acceptable_offer"
  | "authorization_declined"
  | "execution_failed"
  | "rehearsal_complete"
  | "execution_window_missed";

/**
 * Evidence retained when a post-cutoff market outcome releases a reservation.
 *
 * `operationId` is the server-derived execution operation that produced the
 * outcome. Recording it keeps retries auditable and prevents a release from
 * being confused with the buyer-controlled, pre-cutoff `left` transition.
 */
export interface MembershipRelease {
  readonly reason: ReservationReleaseReason;
  readonly operationId: string;
  readonly releasedCents: Cents;
  readonly releasedAt: IsoDateTime;
}

/** How a settlement's money movement was actually evidenced. */
export type SettlementEvidence = "rain-sandbox" | "rehearsal";

export interface PoolMembership {
  readonly id: string;
  readonly poolId: string;
  readonly intentId: string;
  readonly buyerId: string;
  readonly quantity: number;
  readonly reservedCents: Cents;
  readonly status: PoolMembershipStatus;
  readonly joinedAt: IsoDateTime;
  readonly leftAt?: IsoDateTime;
  readonly release?: MembershipRelease;
  readonly settlement?: MembershipSettlement;
}

/**
 * The complete, immutable portion of a local membership submitted to an
 * execution route. The API treats this as a signed-like evidence envelope: it
 * still validates every field against its server-owned catalog and never
 * accepts browser-proposed economics.
 */
export type PoolMembershipEnvelope = Readonly<
  Pick<
    PoolMembership,
    | "id"
    | "poolId"
    | "intentId"
    | "buyerId"
    | "quantity"
    | "reservedCents"
    | "status"
    | "joinedAt"
  >
>;

/**
 * The result of a cleared market, as applied to one buyer's commitment.
 *
 * Every amount here is derived by the server from its own catalog; the browser
 * never proposes a capture. `evidence` records whether real Rain sandbox
 * transactions backed the capture or it was a labeled rehearsal.
 */
export interface MembershipSettlement {
  readonly evidence: SettlementEvidence;
  readonly unitPriceCents: Cents;
  readonly capturedCents: Cents;
  readonly releasedCents: Cents;
  readonly merchantName: string;
  readonly settledAt: IsoDateTime;
  readonly rainTransactionId?: string;
  readonly rainCardLast4?: string;
}

export type ProductActivityKind =
  | "workspace.seeded"
  | "treasury.synced"
  | "sandbox.deposit_recorded"
  | "intent.created"
  | "pool.joined"
  | "pool.left"
  | "pool.reservation_released"
  | "pool.settled";

export type ProductActivityMetadata = Readonly<
  Record<string, string | number | boolean>
>;

export interface ProductActivityEntry {
  readonly id: string;
  readonly workspaceRevision: number;
  readonly at: IsoDateTime;
  readonly actorId: string;
  readonly kind: ProductActivityKind;
  readonly summary: string;
  readonly metadata: ProductActivityMetadata;
}

export interface ProductWorkspace {
  readonly schemaVersion: typeof PRODUCT_WORKSPACE_SCHEMA_VERSION;
  readonly seedVersion: typeof PRODUCT_SEED_VERSION;
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly createdAt: IsoDateTime;
  readonly owner: BuyerProfile;
  readonly treasury: ProductTreasury;
  readonly products: Readonly<Record<string, ProductListing>>;
  readonly pools: Readonly<Record<string, ProductPool>>;
  readonly balances: Readonly<Record<string, SandboxBalance>>;
  readonly intents: Readonly<Record<string, ProductBuyingIntent>>;
  readonly memberships: Readonly<Record<string, PoolMembership>>;
  readonly activity: readonly ProductActivityEntry[];
}

interface ProductActionEnvelope {
  readonly activityId: string;
  readonly at: IsoDateTime;
}

export type ProductWorkspaceAction =
  | (ProductActionEnvelope & {
      readonly type: "treasury/sync";
      readonly source: TreasurySource;
      readonly spendingPowerCents: Cents;
      readonly creditLimitCents: Cents;
      readonly postedChargesCents: Cents;
      readonly pendingChargesCents: Cents;
    })
  | (ProductActionEnvelope & {
      readonly type: "sandbox/deposit";
      readonly buyerId: string;
      readonly amountCents: Cents;
    })
  | (ProductActionEnvelope & {
      readonly type: "intent/create";
      readonly intentId: string;
      readonly buyerId: string;
      readonly productId: string;
      readonly quantity: number;
      readonly targetUnitPriceCents: Cents;
      readonly expiresAt: IsoDateTime;
    })
  | (ProductActionEnvelope & {
      readonly type: "pool/join";
      readonly membershipId: string;
      readonly poolId: string;
      readonly intentId: string;
      readonly buyerId: string;
    })
  | (ProductActionEnvelope & {
      readonly type: "pool/leave";
      readonly membershipId: string;
      readonly buyerId: string;
    })
  | (ProductActionEnvelope & {
      readonly type: "pool/release_after_outcome";
      readonly membershipId: string;
      readonly buyerId: string;
      readonly reason: ReservationReleaseReason;
      readonly operationId: string;
    })
  | (ProductActionEnvelope & {
      readonly type: "pool/settle";
      readonly membershipId: string;
      readonly buyerId: string;
      readonly evidence: SettlementEvidence;
      readonly unitPriceCents: Cents;
      readonly capturedCents: Cents;
      readonly merchantName: string;
      readonly rainTransactionId?: string;
      readonly rainCardLast4?: string;
    });

export type ProductDomainErrorCode =
  | "INVALID_IDENTIFIER"
  | "INVALID_TIMESTAMP"
  | "INVALID_MONEY"
  | "INVALID_QUANTITY"
  | "DUPLICATE_ACTIVITY"
  | "DUPLICATE_INTENT"
  | "DUPLICATE_MEMBERSHIP"
  | "BUYER_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "POOL_NOT_FOUND"
  | "INTENT_NOT_FOUND"
  | "MEMBERSHIP_NOT_FOUND"
  | "INTENT_BUYER_MISMATCH"
  | "INTENT_PRODUCT_MISMATCH"
  | "INTENT_NOT_OPEN"
  | "INTENT_EXPIRED"
  | "INTENT_PRICE_INCOMPATIBLE"
  | "INTENT_DEADLINE_INCOMPATIBLE"
  | "POOL_NOT_FORMING"
  | "POOL_CUTOFF_PASSED"
  | "POOL_CUTOFF_NOT_REACHED"
  | "INSUFFICIENT_AVAILABLE_BALANCE"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "RELEASE_OUTCOME_MISMATCH"
  | "DUPLICATE_RELEASE_OPERATION"
  | "TREASURY_LIMIT_EXCEEDED"
  | "CAPTURE_EXCEEDS_RESERVATION";

export class ProductDomainError extends Error {
  readonly code: ProductDomainErrorCode;

  constructor(code: ProductDomainErrorCode, message: string) {
    super(message);
    this.name = "ProductDomainError";
    this.code = code;
  }
}
