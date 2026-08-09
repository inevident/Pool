export const PRODUCT_WORKSPACE_SCHEMA_VERSION = 2 as const;
export const PRODUCT_SEED_VERSION = "2026.08.08" as const;

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
  readonly targetMemberCount: number;
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

export type PoolMembershipStatus = "active" | "left" | "settled";

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
  readonly settlement?: MembershipSettlement;
}

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
  | "POOL_NOT_FORMING"
  | "POOL_CUTOFF_PASSED"
  | "INSUFFICIENT_AVAILABLE_BALANCE"
  | "MEMBERSHIP_NOT_ACTIVE"
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
