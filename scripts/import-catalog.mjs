/**
 * Catalog importer.
 *
 * Pulls a sample product catalog from the public DummyJSON API and writes a
 * deterministic TypeScript module. The network call happens here, at authoring
 * time, never at runtime: the app ships the generated file, so the catalog is
 * reproducible, works offline, and adds no third-party origin to the CSP.
 *
 * Products are sample data, exactly like the hand-seeded catalog they join.
 * Nothing here claims a real listing, a real merchant, or real inventory.
 *
 *   node scripts/import-catalog.mjs
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const SOURCE = "https://dummyjson.com/products";
const OUT = join(process.cwd(), "lib", "product", "catalog-imported.ts");

/** DummyJSON category -> POOL category. Anything unmapped is skipped. */
const CATEGORY_MAP = {
  laptops: "computing",
  tablets: "computing",
  smartphones: "computing",
  "mobile-accessories": "audio",
  furniture: "home",
  "home-decoration": "home",
  "kitchen-accessories": "home",
};

/**
 * POOL organizes demand for purchases worth waiting for, so cheap impulse
 * items would misrepresent the product. Anything under this stays out.
 */
const MIN_PRICE_CENTS = 5_000;
const MAX_PRODUCTS = 48;

/** Deterministic 32-bit hash so every generated number is reproducible. */
function hash(value) {
  let h = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return Math.abs(h);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function titleCase(value) {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const response = await fetch(`${SOURCE}?limit=194&select=title,brand,category,price,description`);
if (!response.ok) throw new Error(`Catalog source responded ${response.status}`);
const { products: source } = await response.json();

const seen = new Set();
const imported = [];

for (const item of source) {
  const category = CATEGORY_MAP[item.category];
  if (!category) continue;

  const msrpUnitCents = Math.round(Number(item.price) * 100);
  if (!Number.isFinite(msrpUnitCents) || msrpUnitCents < MIN_PRICE_CENTS) continue;

  const slug = slugify(item.title);
  const id = `product-${slug}`;
  if (!slug || seen.has(id)) continue;
  seen.add(id);

  const seed = hash(id);
  const brand = (item.brand && String(item.brand).trim()) || titleCase(category);

  // Merchant economics are private seller data in the domain model, so they are
  // derived deterministically per product rather than invented per render.
  // Floors sit far enough below MSRP that a 10+ unit pool can actually clear.
  const opening = (pct) => Math.round((msrpUnitCents * pct) / 10_000);
  const economics = {
    "merchant-keystone": {
      openingUnitCents: opening(9_300 + (seed % 250)),
      floorUnitCents: opening(8_100 + (seed % 180)),
    },
    "merchant-northstar": {
      openingUnitCents: opening(9_500 + ((seed >> 3) % 250)),
      floorUnitCents: opening(8_400 + ((seed >> 3) % 180)),
    },
    "merchant-signal": {
      openingUnitCents: opening(9_150 + ((seed >> 6) % 250)),
      floorUnitCents: opening(7_900 + ((seed >> 6) % 180)),
    },
  };

  // The published estimate is the best price the roster can honour at the
  // seeded quantity, so the card never advertises a price the market cannot
  // reach. 12+ units earns the 700bps tier in lib/market/consumer.ts.
  const committedUnitCount = 10 + (seed % 26);
  const discountBps = committedUnitCount >= 12 ? 700 : 400;
  const estimatedUnitPriceCents = Math.min(
    ...Object.values(economics).map((priv) =>
      Math.max(
        priv.floorUnitCents,
        Math.round((priv.openingUnitCents * (10_000 - discountBps)) / 10_000),
      ),
    ),
  );

  imported.push({
    id,
    slug,
    name: item.title,
    brand,
    category,
    msrpUnitCents,
    description: String(item.description ?? "").trim().slice(0, 180),
    committedUnitCount,
    estimatedUnitPriceCents,
    economics,
  });

  if (imported.length >= MAX_PRODUCTS) break;
}

imported.sort((a, b) => a.id.localeCompare(b.id));

const file = `// GENERATED FILE -- do not edit by hand.
// Regenerate with: node scripts/import-catalog.mjs
//
// Sample catalog imported from the public DummyJSON API at authoring time and
// committed as static data. No network call happens at runtime, so the catalog
// is deterministic, works offline, and introduces no third-party origin.
//
// These are sample products in a sandbox market, exactly like the hand-seeded
// entries they join. None of them is a real listing, merchant, or inventory
// commitment.
import type { ProductCategory } from "./types.ts";

export interface ImportedCatalogEntry {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly category: ProductCategory;
  readonly msrpUnitCents: number;
  readonly description: string;
  /** Seeded funded demand at the pool's published cutoff. */
  readonly committedUnitCount: number;
  /** Best price the merchant roster can honour at that quantity. */
  readonly estimatedUnitPriceCents: number;
  readonly economics: Readonly<
    Record<
      "merchant-keystone" | "merchant-northstar" | "merchant-signal",
      { readonly openingUnitCents: number; readonly floorUnitCents: number }
    >
  >;
}

export const IMPORTED_CATALOG_SOURCE = "dummyjson.com/products" as const;

export const IMPORTED_CATALOG: readonly ImportedCatalogEntry[] = ${JSON.stringify(
  imported,
  null,
  2,
)} as const;
`;

await writeFile(OUT, file, "utf8");

const byCategory = imported.reduce((acc, p) => {
  acc[p.category] = (acc[p.category] ?? 0) + 1;
  return acc;
}, {});
console.log(`Wrote ${imported.length} products to ${OUT}`);
console.log("by category:", byCategory);
