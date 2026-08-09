/**
 * Catalog matching for the POOL browser extension.
 *
 * The extension follows a shopper across the web. On every product page it asks
 * POOL, "is this thing already forming a pool?" This module answers that from a
 * page's title and URL alone — no scraping of prices required — by scoring the
 * page's words against the seeded catalog. It is pure and deterministic so the
 * same page always resolves to the same product, and it never invents a match:
 * a page only resolves when enough distinctive signal (brand plus a model token)
 * is present.
 */

import { createSeededProductWorkspace } from "../product/seed.ts";
import type { ProductWorkspace } from "../product/types.ts";

export interface CatalogMatchQuery {
  readonly title?: string;
  readonly url?: string;
}

export interface MatchedProduct {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly slug: string;
  readonly category: string;
  readonly msrpUnitCents: number;
  readonly imageUrl: string;
}

export interface MatchedPool {
  readonly id: string;
  readonly status: string;
  readonly committedUnitCount: number;
  /**
   * Viability floor, never an enrollment target or cap. Every funded
   * commitment before `cutoffAt` is still accepted once this is met, so the
   * extension must not render it as a quota to fill.
   */
  readonly minimumCommittedUnitCount: number;
  readonly estimatedUnitPriceCents: number;
  readonly cutoffAt: string;
  /** Relative path to the pool on POOL. */
  readonly poolPath: string;
}

export interface CatalogMatchResult {
  readonly matched: boolean;
  readonly confidence: number;
  readonly product: MatchedProduct | null;
  readonly pool: MatchedPool | null;
  readonly reason: string;
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "buy",
  "shop",
  "new",
  "inch",
  "wireless",
  "official",
  "store",
  "com",
  "www",
  "amazon",
  "bestbuy",
  "target",
  "walmart",
  "apple",
]);

/** Split arbitrary text into comparable lowercase tokens. */
export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && token.length <= 20);
}

/**
 * Product-line qualifiers that recur across many unrelated products. They stay
 * in the signature because they help rank a match, but on their own they are
 * far too weak to establish one: "Apple Vision Pro" shares only "pro" with
 * "iPhone 13 Pro", which is a brand collision rather than the same product.
 */
const GENERIC_MODEL_TOKENS = new Set([
  "pro",
  "max",
  "plus",
  "mini",
  "air",
  "ultra",
  "lite",
  "series",
  "edition",
  "gen",
  "generation",
  "smart",
  "portable",
  "premium",
  "classic",
  "standard",
]);

const distinctiveTokens = (text: string): readonly string[] =>
  tokenize(text).filter((token) => !STOPWORDS.has(token));

interface ProductSignature {
  readonly brandTokens: readonly string[];
  readonly modelTokens: readonly string[];
}

const signatureFor = (name: string, brand: string, slug: string): ProductSignature => {
  const brandTokens = tokenize(brand);
  // Model tokens are the distinctive words of the product identity: everything
  // in the name and slug that is not the brand and not a generic shopping word.
  const brandSet = new Set(brandTokens);
  const modelTokens = [...new Set([...distinctiveTokens(name), ...distinctiveTokens(slug)])].filter(
    (token) => !brandSet.has(token),
  );
  return { brandTokens, modelTokens };
};

/**
 * Score a page against a single product.
 *
 * A page needs at least two identifying model tokens, or the brand plus one, to
 * count as a match. Identifying means the token is not a generic product-line
 * qualifier, so "Apple AirPods" cannot resolve to a MacBook on the shared brand
 * and "Apple Vision Pro" cannot resolve to an iPhone 13 Pro on the shared "pro".
 * Generic hits still contribute to the score, they just cannot create a match.
 */
function scoreProduct(
  queryTokens: ReadonlySet<string>,
  signature: ProductSignature,
): { readonly score: number; readonly matched: boolean } {
  const modelHits = signature.modelTokens.filter((token) => queryTokens.has(token));
  const identifyingHits = modelHits.filter((token) => !GENERIC_MODEL_TOKENS.has(token));
  const brandHit = signature.brandTokens.some((token) => queryTokens.has(token));
  const denominator = Math.max(1, signature.modelTokens.length);
  const coverage = modelHits.length / denominator;
  const score = Math.min(1, coverage + (brandHit ? 0.15 : 0));
  const matched =
    identifyingHits.length >= 2 || (brandHit && identifyingHits.length >= 1);
  return { score: matched ? score : 0, matched };
}

export function matchCatalogProduct(
  query: CatalogMatchQuery,
  workspace: ProductWorkspace = createSeededProductWorkspace(),
): CatalogMatchResult {
  const haystack = `${query.title ?? ""} ${query.url ?? ""}`.trim();
  if (haystack.length === 0) {
    return { matched: false, confidence: 0, product: null, pool: null, reason: "No page text to match." };
  }

  const queryTokens = new Set(tokenize(haystack));
  const products = Object.values(workspace.products);

  let best: { product: (typeof products)[number]; score: number } | null = null;
  for (const product of products) {
    const signature = signatureFor(product.name, product.brand, product.slug);
    const { score, matched } = scoreProduct(queryTokens, signature);
    if (matched && (!best || score > best.score)) {
      best = { product, score };
    }
  }

  if (!best) {
    return {
      matched: false,
      confidence: 0,
      product: null,
      pool: null,
      reason: "This product is not on POOL yet.",
    };
  }

  const poolEntry = Object.values(workspace.pools).find((pool) => pool.productId === best.product.id) ?? null;

  return {
    matched: true,
    confidence: Number(best.score.toFixed(2)),
    product: {
      id: best.product.id,
      name: best.product.name,
      brand: best.product.brand,
      slug: best.product.slug,
      category: best.product.category,
      msrpUnitCents: best.product.msrpUnitCents,
      imageUrl: best.product.imageUrl,
    },
    pool: poolEntry
      ? {
          id: poolEntry.id,
          status: poolEntry.status,
          committedUnitCount: poolEntry.committedUnitCount,
          minimumCommittedUnitCount: poolEntry.minimumCommittedUnitCount,
          estimatedUnitPriceCents: poolEntry.estimatedUnitPriceCents,
          cutoffAt: poolEntry.cutoffAt,
          poolPath: `/pools/${poolEntry.id}`,
        }
      : null,
    reason: poolEntry
      ? "A group buy is already forming for this product on POOL."
      : "This product is on POOL, but no pool is forming yet.",
  };
}

/** Public catalog projection the extension can cache for offline hinting. */
export function publicCatalog(
  workspace: ProductWorkspace = createSeededProductWorkspace(),
): readonly MatchedProduct[] {
  return Object.values(workspace.products).map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    slug: product.slug,
    category: product.category,
    msrpUnitCents: product.msrpUnitCents,
    imageUrl: product.imageUrl,
  }));
}
