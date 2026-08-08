export const PRODUCT_WORKSPACE_SCHEMA_VERSION = 1 as const;
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

export type PoolMembershipStatus = "active" | "left";

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
}

export type ProductActivityKind =
  | "workspace.seeded"
  | "sandbox.deposit_recorded"
  | "intent.created"
  | "pool.joined"
  | "pool.left";

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
  | "MEMBERSHIP_NOT_ACTIVE";

export class ProductDomainError extends Error {
  readonly code: ProductDomainErrorCode;

  constructor(code: ProductDomainErrorCode, message: string) {
    super(message);
    this.name = "ProductDomainError";
    this.code = code;
  }
}
