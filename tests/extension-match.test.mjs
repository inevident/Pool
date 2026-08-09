import assert from "node:assert/strict";
import test from "node:test";
import { matchCatalogProduct, publicCatalog, tokenize } from "../lib/extension/match.ts";

test("a MacBook product page resolves to the MacBook pool", () => {
  const result = matchCatalogProduct({
    title: "MacBook Air 13-inch (M4) - Apple",
    url: "https://www.apple.com/shop/buy-mac/macbook-air/13-inch-m4",
  });

  assert.equal(result.matched, true);
  assert.equal(result.product.id, "product-macbook-air-m4-13");
  assert.equal(result.pool.id, "pool-macbook-air-campus");
  assert.equal(result.pool.poolPath, "/pools/pool-macbook-air-campus");
  assert.ok(result.confidence >= 0.5);
});

test("a third-party retailer listing still resolves by model tokens", () => {
  const result = matchCatalogProduct({
    title: "Sony WH-1000XM6 Wireless Noise Cancelling Headphones | Best Buy",
    url: "https://www.bestbuy.com/site/sony-wh-1000xm6/6588491.p",
  });

  assert.equal(result.matched, true);
  assert.equal(result.product.id, "product-sony-wh1000xm6");
  assert.equal(result.product.brand, "Sony");
});

test("the Steam Deck OLED page resolves without a brand mention", () => {
  const result = matchCatalogProduct({
    title: "Steam Deck OLED 512GB — buy now",
    url: "https://store.steampowered.com/steamdeck",
  });

  assert.equal(result.matched, true);
  assert.equal(result.product.id, "product-steam-deck-oled-512");
});

test("an unrelated product does not produce a false match", () => {
  const result = matchCatalogProduct({
    title: "Logitech MX Master 3S Wireless Mouse",
    url: "https://www.logitech.com/products/mice/mx-master-3s",
  });

  assert.equal(result.matched, false);
  assert.equal(result.product, null);
  assert.equal(result.pool, null);
});

test("a same-brand different-product page does not resolve to the wrong SKU", () => {
  // Apple AirPods must not match the Apple MacBook just because both are Apple.
  const result = matchCatalogProduct({
    title: "AirPods Pro 2 - Apple",
    url: "https://www.apple.com/airpods-pro",
  });

  assert.equal(result.matched, false);
});

test("an empty query is handled without throwing", () => {
  const result = matchCatalogProduct({});
  assert.equal(result.matched, false);
  assert.equal(result.confidence, 0);
});

test("matching is deterministic", () => {
  const query = { title: "Dyson Airwrap i.d. Multi-Styler", url: "https://www.dyson.com/airwrap" };
  assert.deepEqual(matchCatalogProduct(query), matchCatalogProduct(query));
});

test("the public catalog exposes every seeded product without private economics", () => {
  const catalog = publicCatalog();
  assert.equal(catalog.length, 5);
  const serialized = JSON.stringify(catalog);
  assert.ok(!serialized.includes("floor"));
  assert.ok(!serialized.includes("opening"));
});

test("a matched pool exposes the viability floor, never an enrollment target", () => {
  const result = matchCatalogProduct({
    title: "MacBook Air 13-inch (M4) - Apple",
    url: "https://www.apple.com/shop/buy-mac/macbook-air/13-inch-m4",
  });

  assert.equal(result.matched, true);
  assert.ok(result.pool);
  // POOL accepts every funded commitment through the cutoff, so the extension
  // must never render a quota to fill. Reintroducing a target here would
  // contradict the product's own published commitment model.
  assert.equal("targetMemberCount" in result.pool, false);
  assert.equal(typeof result.pool.minimumCommittedUnitCount, "number");
  assert.ok(!JSON.stringify(result).includes("targetMemberCount"));
});

test("tokenizer drops punctuation and short noise", () => {
  assert.deepEqual(tokenize("WH-1000XM6 (Black)"), ["wh", "1000xm6", "black"]);
});
