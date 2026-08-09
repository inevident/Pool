import assert from "node:assert/strict";
import test from "node:test";
import {
  clearConsumerMarket,
  collectConsumerOffers,
  CONSUMER_MERCHANTS,
  merchantCategoryCodeFor,
  publicOffer,
  volumeDiscountBps,
} from "../lib/market/consumer.ts";
import { createSeededProductWorkspace } from "../lib/product/index.ts";

const SONY = "product-sony-wh1000xm6";
const SONY_TARGET = 37_900;
const STEAM = "product-steam-deck-oled-512";
const STEAM_TARGET = 49_400;
const MONITOR = "product-monitor-27-4k-usbc";

test("deeper volume tiers unlock strictly better prices", () => {
  const bpsByUnits = [5, 12, 30, 60, 150].map(volumeDiscountBps);
  assert.deepEqual(bpsByUnits, [0, 400, 900, 1_300, 1_600]);

  const thin = collectConsumerOffers({
    productId: SONY,
    aggregateUnits: 5,
    targetUnitPriceCents: SONY_TARGET,
  });
  const deep = collectConsumerOffers({
    productId: SONY,
    aggregateUnits: 60,
    targetUnitPriceCents: SONY_TARGET,
  });

  for (const [index, offer] of deep.entries()) {
    assert.ok(
      offer.unitPriceCents <= thin[index].unitPriceCents,
      `${offer.merchantName} should not quote higher at greater volume`,
    );
  }
});

test("market pricing uses every funded unit above the pool minimum", () => {
  const catalog = createSeededProductWorkspace();
  const pool = catalog.pools["pool-sony-xm6-august"];
  const atMinimum = clearConsumerMarket({
    productId: SONY,
    aggregateUnits: pool.minimumCommittedUnitCount,
    targetUnitPriceCents: SONY_TARGET,
  });
  const actualFundedUnits = pool.minimumCommittedUnitCount + 90;
  const aboveMinimum = clearConsumerMarket({
    productId: SONY,
    aggregateUnits: actualFundedUnits,
    targetUnitPriceCents: SONY_TARGET,
  });

  assert.equal(aboveMinimum.aggregateUnits, actualFundedUnits);
  assert.ok(aboveMinimum.discountBps > atMinimum.discountBps);
});

test("a merchant never bids below its private floor", () => {
  // The deepest tier is where floors bind hardest.
  const offers = collectConsumerOffers({
    productId: SONY,
    aggregateUnits: 10_000,
    targetUnitPriceCents: SONY_TARGET,
  });
  assert.equal(offers.length, CONSUMER_MERCHANTS.length);
  for (const offer of offers) {
    assert.ok(offer.atFloor, `${offer.merchantName} should be pinned at its floor`);
    assert.ok(offer.unitPriceCents > 0);
  }
});

test("the cheapest eligible offer wins deterministically", () => {
  const run = () =>
    clearConsumerMarket({
      productId: SONY,
      aggregateUnits: 35,
      targetUnitPriceCents: SONY_TARGET,
    });

  const first = run();
  assert.equal(first.code, "cleared");
  assert.ok(first.winner);
  assert.ok(first.winner.unitPriceCents <= SONY_TARGET);

  const cheapest = Math.min(...first.offers.map((offer) => offer.unitPriceCents));
  assert.equal(first.winner.unitPriceCents, cheapest);

  // Same inputs must always produce the same award.
  assert.deepEqual(run(), first);
});

test("the reference monitor market preserves the published fixture price shape", () => {
  const clearing = clearConsumerMarket({
    productId: MONITOR,
    aggregateUnits: 12,
    targetUnitPriceCents: 38_900,
  });

  assert.deepEqual(
    clearing.offers.map((offer) => offer.unitPriceCents),
    [40_100, 42_900, 38_900],
  );
  assert.equal(clearing.code, "cleared");
  assert.equal(clearing.winner?.unitPriceCents, 38_900);
});

test("an under-funded pool refuses to buy and reports the clearing size", () => {
  const thin = clearConsumerMarket({
    productId: STEAM,
    aggregateUnits: 19,
    targetUnitPriceCents: STEAM_TARGET,
  });

  assert.equal(thin.code, "no_acceptable_offer");
  assert.equal(thin.winner, undefined);
  assert.ok(typeof thin.unitsToClear === "number");

  // The reported threshold must actually clear.
  const atThreshold = clearConsumerMarket({
    productId: STEAM,
    aggregateUnits: thin.unitsToClear,
    targetUnitPriceCents: STEAM_TARGET,
  });
  assert.equal(atThreshold.code, "cleared");
});

test("a winning price never exceeds the buyer's MSRP reservation", () => {
  const catalog = createSeededProductWorkspace();
  for (const pool of Object.values(catalog.pools)) {
    const product = catalog.products[pool.productId];
    const clearing = clearConsumerMarket({
      productId: product.id,
      aggregateUnits: pool.committedUnitCount + 1,
      targetUnitPriceCents: pool.estimatedUnitPriceCents,
    });
    if (clearing.code !== "cleared") continue;
    assert.ok(
      clearing.winner.unitPriceCents <= product.msrpUnitCents,
      `${product.name} cleared above MSRP`,
    );
    assert.ok(clearing.winner.unitPriceCents <= pool.estimatedUnitPriceCents);
  }
});

test("public projections never leak private merchant economics", () => {
  const clearing = clearConsumerMarket({
    productId: SONY,
    aggregateUnits: 35,
    targetUnitPriceCents: SONY_TARGET,
  });
  const projection = publicOffer(clearing.winner);
  const keys = Object.keys(projection).sort();

  assert.deepEqual(keys, [
    "deliveryDays",
    "merchantId",
    "merchantName",
    "unitPriceCents",
    "warrantyMonths",
  ]);
  const serialized = JSON.stringify(projection);
  assert.ok(!serialized.includes("floor"));
  assert.ok(!serialized.includes("opening"));
  assert.ok(!serialized.includes("atFloor"));
});

test("merchant category codes follow the product category", () => {
  assert.equal(merchantCategoryCodeFor("audio"), "5732");
  assert.equal(merchantCategoryCodeFor("computing"), "5732");
  assert.equal(merchantCategoryCodeFor("gaming"), "5732");
  assert.equal(merchantCategoryCodeFor("home"), "5722");
});
