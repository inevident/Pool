import {
  PRODUCT_SEED_VERSION,
  PRODUCT_WORKSPACE_SCHEMA_VERSION,
  type BuyerProfile,
  type ProductActivityEntry,
  type ProductListing,
  type ProductPool,
  type ProductWorkspace,
} from "./types.ts";

const DAY_MS = 86_400_000;
export const DEFAULT_PRODUCT_SEED_TIME = "2026-08-08T16:00:00.000Z";
export const PRODUCT_POOL_COMMITMENT_WINDOW_DAYS = 14;
export const TECHNICAL_FIXTURE_PRODUCT_ID = "product-monitor-27-4k-usbc";
export const TECHNICAL_FIXTURE_POOL_ID = "pool-monitor-reference-august";
export const TECHNICAL_FIXTURE_SCENARIO_VERSION = "monitor-pool-v1";
export const TECHNICAL_FIXTURE_PRODUCT_SKU = "DISPLAY-27-4K-IPS-USBC";

/**
 * Offline spend ceiling used before the live Rain sandbox balance is read.
 *
 * It is a labeled fixture, not a Rain figure. It sits above the largest single
 * commitment the seeded catalog allows (20 × $999.00) so offline development
 * behaves normally, and it is replaced by the real `spendingPower` as soon as
 * `treasury/sync` lands.
 */
export const LOCAL_TREASURY_FIXTURE_CENTS = 2_500_000;

const isoAfterDays = (at: string, days: number) =>
  new Date(new Date(at).getTime() + days * DAY_MS).toISOString();

const seededProducts: readonly ProductListing[] = [
  {
    id: "product-sony-wh1000xm6",
    slug: "sony-wh-1000xm6",
    name: "WH-1000XM6 Wireless Headphones",
    brand: "Sony",
    category: "audio",
    imageUrl:
      "https://sony.scene7.com/is/image/sonyglobalsolutions/WH-1000XM6_Primary_image_Black?$categorypdpnav$",
    msrpUnitCents: 44_999,
    currency: "USD",
    description:
      "Flagship noise-cancelling headphones with a foldable design and all-day battery.",
  },
  {
    id: "product-steam-deck-oled-512",
    slug: "steam-deck-oled-512gb",
    name: "Steam Deck OLED 512GB",
    brand: "Valve",
    category: "gaming",
    imageUrl:
      "https://cdn.cloudflare.steamstatic.com/steamdeck/images/oled/steamdeck_oled_hero.png",
    msrpUnitCents: 54_900,
    currency: "USD",
    description:
      "Portable PC gaming with a 7.4-inch HDR OLED display and faster Wi-Fi.",
  },
  {
    id: "product-macbook-air-m4-13",
    slug: "macbook-air-m4-13",
    name: "MacBook Air 13-inch (M4)",
    brand: "Apple",
    category: "computing",
    imageUrl:
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/refurb-mba13-m4-midnight-202503",
    msrpUnitCents: 99_900,
    currency: "USD",
    description:
      "Thin 13-inch laptop with Apple silicon, a fanless design, and all-day battery.",
  },
  {
    id: "product-dyson-airwrap-id",
    slug: "dyson-airwrap-id",
    name: "Airwrap i.d. Multi-Styler",
    brand: "Dyson",
    category: "home",
    imageUrl:
      "https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/533598-01.png",
    msrpUnitCents: 59_999,
    currency: "USD",
    description:
      "Connected multi-styler with personalized curling sequences and six attachments.",
  },
  {
    id: TECHNICAL_FIXTURE_PRODUCT_ID,
    slug: "27-inch-4k-usb-c-monitor",
    name: "27-inch 4K USB-C Monitor",
    brand: "POOL Reference",
    category: "computing",
    imageUrl: "/og.png",
    msrpUnitCents: 47_900,
    currency: "USD",
    description:
      "The same generic display specification used by POOL's public Rain and Monad technical fixture.",
  },
] as const;

export interface CreateSeededProductWorkspaceInput {
  readonly workspaceId?: string;
  readonly workspaceName?: string;
  readonly now?: string;
  readonly owner?: BuyerProfile;
}

export type CreateCanonicalProductWorkspaceInput = Omit<
  CreateSeededProductWorkspaceInput,
  "now"
>;

const toRecord = <T extends { readonly id: string }>(items: readonly T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;

export function createSeededProductWorkspace(
  input: CreateSeededProductWorkspaceInput = {},
): ProductWorkspace {
  const createdAt = input.now ?? DEFAULT_PRODUCT_SEED_TIME;
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new TypeError("Seed time must be a valid ISO date-time.");
  }

  const owner = input.owner ?? {
    id: "buyer-demo",
    displayName: "Alex Morgan",
  };

  const pools: readonly ProductPool[] = [
    {
      id: "pool-sony-xm6-august",
      productId: "product-sony-wh1000xm6",
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, PRODUCT_POOL_COMMITMENT_WINDOW_DAYS),
      minimumCommittedUnitCount: 10,
      committedUnitCount: 34,
      estimatedUnitPriceCents: 37_900,
      createdAt,
    },
    {
      id: "pool-steam-deck-oled-august",
      productId: "product-steam-deck-oled-512",
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, PRODUCT_POOL_COMMITMENT_WINDOW_DAYS),
      minimumCommittedUnitCount: 10,
      committedUnitCount: 18,
      estimatedUnitPriceCents: 49_400,
      createdAt,
    },
    {
      id: "pool-macbook-air-campus",
      productId: "product-macbook-air-m4-13",
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, PRODUCT_POOL_COMMITMENT_WINDOW_DAYS),
      minimumCommittedUnitCount: 10,
      committedUnitCount: 11,
      estimatedUnitPriceCents: 89_900,
      createdAt,
    },
    {
      id: "pool-dyson-airwrap-fall",
      productId: "product-dyson-airwrap-id",
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, PRODUCT_POOL_COMMITMENT_WINDOW_DAYS),
      minimumCommittedUnitCount: 10,
      committedUnitCount: 27,
      estimatedUnitPriceCents: 52_500,
      createdAt,
    },
    {
      id: TECHNICAL_FIXTURE_POOL_ID,
      productId: TECHNICAL_FIXTURE_PRODUCT_ID,
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, PRODUCT_POOL_COMMITMENT_WINDOW_DAYS),
      minimumCommittedUnitCount: 10,
      committedUnitCount: 12,
      estimatedUnitPriceCents: 38_900,
      createdAt,
    },
  ] as const;

  const seededActivity = Object.freeze<ProductActivityEntry>({
    id: "activity-workspace-seeded",
    workspaceRevision: 0,
    at: createdAt,
    actorId: "system",
    kind: "workspace.seeded",
    summary: "Product workspace initialized with active group buys.",
    metadata: Object.freeze({
      seedVersion: PRODUCT_SEED_VERSION,
      poolCount: pools.length,
    }),
  });

  return {
    schemaVersion: PRODUCT_WORKSPACE_SCHEMA_VERSION,
    seedVersion: PRODUCT_SEED_VERSION,
    id: input.workspaceId ?? "workspace-pool-marketplace",
    name: input.workspaceName ?? "POOL Marketplace",
    revision: 0,
    createdAt,
    owner,
    treasury: {
      source: "local",
      currency: "USD",
      spendingPowerCents: LOCAL_TREASURY_FIXTURE_CENTS,
      creditLimitCents: LOCAL_TREASURY_FIXTURE_CENTS,
      postedChargesCents: 0,
      pendingChargesCents: 0,
      syncedAt: null,
    },
    products: toRecord(seededProducts),
    pools: toRecord(pools),
    balances: {
      [owner.id]: {
        buyerId: owner.id,
        currency: "USD",
        totalDepositedCents: 0,
        availableCents: 0,
        reservedCents: 0,
        capturedCents: 0,
      },
    },
    intents: {},
    memberships: {},
    activity: Object.freeze([seededActivity]),
  };
}

/**
 * The product routes and browser must execute against the same published
 * fixture window. Runtime callers therefore use this canonical constructor;
 * the clock-injectable constructor above remains available for isolated domain
 * tests only.
 *
 * Neither request bodies nor a visitor's device clock can move this window.
 * Commit and settlement routes still evaluate eligibility with server time.
 */
export function createCanonicalProductWorkspace(
  input: CreateCanonicalProductWorkspaceInput = {},
): ProductWorkspace {
  return createSeededProductWorkspace({
    ...input,
    now: DEFAULT_PRODUCT_SEED_TIME,
  });
}

/**
 * Reset buyer-authored sandbox state without rewriting the last observed rail
 * capacity. A reset clears deposits, intents, memberships, and local activity;
 * it does not make a successful Rain read retroactively become "unavailable."
 */
export function createResetProductWorkspace(
  current: Pick<
    ProductWorkspace,
    "id" | "name" | "owner" | "treasury"
  >,
): ProductWorkspace {
  const reset = createCanonicalProductWorkspace({
    workspaceId: current.id,
    workspaceName: current.name,
    owner: current.owner,
  });

  return {
    ...reset,
    treasury: { ...current.treasury },
  };
}
