import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductPoolCommitment,
  hashConsumerOffer,
  hashProductPoolId,
  productReservationSet,
} from "../lib/monad/product-commitment.ts";
import { hashRainSettlement } from "../lib/monad/commitment.ts";
import { clearConsumerMarket } from "../lib/market/consumer.ts";
import { createSeededProductWorkspace } from "../lib/product/index.ts";

const catalog = createSeededProductWorkspace();
const pool = catalog.pools["pool-sony-xm6-august"];
const product = catalog.products[pool.productId];
const FROZEN_AT = "2026-08-08T20:00:00.000Z";
const BID_CLOSES_AT = "2026-08-08T21:00:00.000Z";

const buildCommitment = (overrides = {}) =>
  buildProductPoolCommitment({
    pool,
    product,
    reservations: productReservationSet({
      pool,
      product,
      buyerId: "buyer-demo",
      buyerIntentId: "intent-live",
      buyerQuantity: 1,
      ...overrides.reservationInput,
    }),
    frozenAt: FROZEN_AT,
    bidClosesAt: BID_CLOSES_AT,
    ...overrides,
  });

test("the reservation set covers every funded unit at full MSRP", () => {
  const reservations = productReservationSet({
    pool,
    product,
    buyerId: "buyer-demo",
    buyerIntentId: "intent-live",
    buyerQuantity: 2,
  });

  const units = reservations.reduce((sum, entry) => sum + entry.quantity, 0);
  const cents = reservations.reduce((sum, entry) => sum + entry.reservedCents, 0);

  assert.equal(units, pool.committedUnitCount + 2);
  assert.equal(cents, product.msrpUnitCents * units);
});

test("the commitment reconciles units, reservation, and pool identity", () => {
  const commitment = buildCommitment();

  assert.equal(commitment.unitCount, pool.committedUnitCount + 1);
  assert.equal(
    commitment.reservedCents,
    BigInt(product.msrpUnitCents * commitment.unitCount),
  );
  assert.equal(commitment.poolIdHash, hashProductPoolId(pool.id));
  assert.match(commitment.fundingRoot, /^0x[0-9a-f]{64}$/);
  assert.match(commitment.termsHash, /^0x[0-9a-f]{64}$/);
});

test("the funding root is deterministic and independent of buyer ordering", () => {
  const base = productReservationSet({
    pool,
    product,
    buyerId: "buyer-demo",
    buyerIntentId: "intent-live",
    buyerQuantity: 1,
  });
  const shuffled = [...base].reverse();

  const first = buildProductPoolCommitment({
    pool,
    product,
    reservations: base,
    frozenAt: FROZEN_AT,
    bidClosesAt: BID_CLOSES_AT,
  });
  const second = buildProductPoolCommitment({
    pool,
    product,
    reservations: shuffled,
    frozenAt: FROZEN_AT,
    bidClosesAt: BID_CLOSES_AT,
  });

  assert.equal(first.fundingRoot, second.fundingRoot);
  assert.equal(first.termsHash, second.termsHash);
});

test("a different coalition size produces a different commitment", () => {
  const one = buildCommitment();
  const two = buildProductPoolCommitment({
    pool,
    product,
    reservations: productReservationSet({
      pool,
      product,
      buyerId: "buyer-demo",
      buyerIntentId: "intent-live",
      buyerQuantity: 2,
    }),
    frozenAt: FROZEN_AT,
    bidClosesAt: BID_CLOSES_AT,
  });

  assert.notEqual(one.fundingRoot, two.fundingRoot);
  assert.notEqual(one.termsHash, two.termsHash);
});

test("a bid window that closes before the freeze is refused", () => {
  assert.throws(
    () =>
      buildProductPoolCommitment({
        pool,
        product,
        reservations: productReservationSet({
          pool,
          product,
          buyerId: "buyer-demo",
          buyerIntentId: "intent-live",
          buyerQuantity: 1,
        }),
        frozenAt: BID_CLOSES_AT,
        bidClosesAt: FROZEN_AT,
      }),
    (error) => error?.code === "OFFER_WINDOW_CLOSED",
  );
});

test("an offer hash binds terms, economics, and issue time", () => {
  const commitment = buildCommitment();
  const clearing = clearConsumerMarket({
    productId: product.id,
    aggregateUnits: commitment.unitCount,
    targetUnitPriceCents: pool.estimatedUnitPriceCents,
  });
  assert.equal(clearing.code, "cleared");

  const issuedAt = "2026-08-08T20:00:01.000Z";
  const base = {
    termsHash: commitment.termsHash,
    offer: clearing.winner,
    quantity: 1,
    totalCents: clearing.winner.unitPriceCents,
    issuedAt,
  };
  const hash = hashConsumerOffer(base);

  assert.equal(hash, hashConsumerOffer(base));
  // Any change to price or timing must change the sealed hash.
  assert.notEqual(
    hash,
    hashConsumerOffer({
      ...base,
      offer: { ...clearing.winner, unitPriceCents: clearing.winner.unitPriceCents - 1 },
    }),
  );
  assert.notEqual(
    hash,
    hashConsumerOffer({ ...base, issuedAt: "2026-08-08T20:00:02.000Z" }),
  );
  // An offer built against a different coalition cannot reuse the hash.
  assert.notEqual(
    hash,
    hashConsumerOffer({ ...base, termsHash: commitment.fundingRoot }),
  );
});

test("the settlement digest is bound to its commitment and offer", () => {
  const commitment = buildCommitment();
  const offerHash = hashConsumerOffer({
    termsHash: commitment.termsHash,
    offer: clearConsumerMarket({
      productId: product.id,
      aggregateUnits: commitment.unitCount,
      targetUnitPriceCents: pool.estimatedUnitPriceCents,
    }).winner,
    quantity: 1,
    totalCents: 37_765,
    issuedAt: "2026-08-08T20:00:01.000Z",
  });
  const commitmentId = commitment.termsHash;
  const rainTransactionIds = ["1246e29b-2459-4b13-a4a4-935f83d16841"];

  const digest = hashRainSettlement({
    commitmentId,
    acceptedOfferHash: offerHash,
    rainTransactionIds,
  });

  assert.equal(
    digest,
    hashRainSettlement({ commitmentId, acceptedOfferHash: offerHash, rainTransactionIds }),
  );
  assert.notEqual(
    digest,
    hashRainSettlement({
      commitmentId,
      acceptedOfferHash: offerHash,
      rainTransactionIds: ["00000000-0000-4000-8000-000000000000"],
    }),
  );
  assert.notEqual(
    digest,
    hashRainSettlement({
      commitmentId,
      acceptedOfferHash: commitment.fundingRoot,
      rainTransactionIds,
    }),
  );
});
