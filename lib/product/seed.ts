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
] as const;

export interface CreateSeededProductWorkspaceInput {
  readonly workspaceId?: string;
  readonly workspaceName?: string;
  readonly now?: string;
  readonly owner?: BuyerProfile;
}

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
      cutoffAt: isoAfterDays(createdAt, 7),
      targetMemberCount: 50,
      committedUnitCount: 34,
      estimatedUnitPriceCents: 37_900,
      createdAt,
    },
    {
      id: "pool-steam-deck-oled-august",
      productId: "product-steam-deck-oled-512",
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, 10),
      targetMemberCount: 30,
      committedUnitCount: 18,
      estimatedUnitPriceCents: 49_400,
      createdAt,
    },
    {
      id: "pool-macbook-air-campus",
      productId: "product-macbook-air-m4-13",
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, 14),
      targetMemberCount: 25,
      committedUnitCount: 11,
      estimatedUnitPriceCents: 89_900,
      createdAt,
    },
    {
      id: "pool-dyson-airwrap-fall",
      productId: "product-dyson-airwrap-id",
      status: "forming",
      cutoffAt: isoAfterDays(createdAt, 18),
      targetMemberCount: 40,
      committedUnitCount: 27,
      estimatedUnitPriceCents: 52_500,
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
    products: toRecord(seededProducts),
    pools: toRecord(pools),
    balances: {
      [owner.id]: {
        buyerId: owner.id,
        currency: "USD",
        totalDepositedCents: 0,
        availableCents: 0,
        reservedCents: 0,
      },
    },
    intents: {},
    memberships: {},
    activity: Object.freeze([seededActivity]),
  };
}
