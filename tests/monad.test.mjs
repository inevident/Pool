import assert from "node:assert/strict";
import test from "node:test";

import {
  HERO_MONAD_COMMITMENT,
  buildFundingRoot,
  buildHeroCoalitionCommitment,
  hashFundingLeaf,
  hashRainSettlement,
  hashSealedMerchantOffer,
} from "../lib/monad/commitment.ts";
import { HERO_DEMO } from "../lib/market/index.ts";
import { clearRuntimeMonadPreparation } from "../lib/monad/runtime.ts";
import {
  attestSettledRainTransactionsOnMonad,
  getStableHeroBidWindow,
  prepareHeroMarketOnMonad,
} from "../lib/monad/workflow.ts";
import { keccak256, toBytes } from "viem";

const fakeTransaction = (label) => ({
  hash: keccak256(toBytes(label)),
  blockNumber: BigInt(42),
  status: "success",
  confirmation: "finalized",
  explorerUrl: `https://testnet.monadvision.com/tx/${label}`,
});

function fakeAdapter(calls) {
  return {
    async commitCoalition(commitment) {
      calls.push(["commit", commitment.termsHash]);
      return {
        commitmentId: keccak256(toBytes(`commitment:${commitment.termsHash}`)),
        replayed: false,
        transaction: fakeTransaction("commit"),
      };
    },
    async registerOffer(input) {
      calls.push(["offer", input.offerHash]);
      return {
        commitmentId: input.commitmentId,
        replayed: false,
        transaction: fakeTransaction(`offer:${input.offerHash}`),
      };
    },
    async attestSettlement(input) {
      calls.push(["attest", input.rainSettlementHash]);
      return {
        commitmentId: input.commitmentId,
        replayed: false,
        transaction: fakeTransaction("attest"),
      };
    },
  };
}

test("the Monad coalition commitment proves funding froze before seller bidding", () => {
  const proof = buildHeroCoalitionCommitment();
  assert.equal(proof.preBidFundingGatePassed, true);
  assert.ok(Date.parse(proof.latestFundingFreezeAt) < Date.parse(proof.firstOfferIssuedAt));
  assert.equal(proof.unitCount, HERO_DEMO.coalition.totalQuantity);
  assert.equal(Number(proof.reservedCents), HERO_DEMO.outcome.baselineTotalCents);
  assert.equal(proof.offerHashes.length, 6);
  assert.equal(
    proof.winningOfferHash,
    hashSealedMerchantOffer(proof.termsHash, HERO_DEMO.negotiation.winningOffer),
  );
});

test("funding roots are deterministic and independent of private buyer ordering", () => {
  const leafA = hashFundingLeaf({
    poolId: "pool-1",
    intentId: "intent-a",
    buyerId: "buyer-a",
    productSku: "sku-1",
    quantity: 2,
    msrpUnitCents: 47_900,
    reservedCents: 95_800,
    frozenAt: "2026-08-08T16:59:30.000Z",
  });
  const leafB = hashFundingLeaf({
    poolId: "pool-1",
    intentId: "intent-b",
    buyerId: "buyer-b",
    productSku: "sku-1",
    quantity: 1,
    msrpUnitCents: 47_900,
    reservedCents: 47_900,
    frozenAt: "2026-08-08T16:59:30.000Z",
  });
  assert.equal(buildFundingRoot([leafA, leafB]), buildFundingRoot([leafB, leafA]));
  assert.notEqual(
    leafA,
    hashFundingLeaf({
      poolId: "pool-1",
      intentId: "intent-a",
      buyerId: "buyer-a",
      productSku: "sku-1",
      quantity: 2,
      msrpUnitCents: 47_900,
      reservedCents: 95_799,
      frozenAt: "2026-08-08T16:59:30.000Z",
    }),
  );
});

test("the Rain settlement digest is set-based, commitment-bound, and non-empty", () => {
  const base = {
    commitmentId: HERO_MONAD_COMMITMENT.termsHash,
    acceptedOfferHash: HERO_MONAD_COMMITMENT.winningOfferHash,
  };
  const first = hashRainSettlement({
    ...base,
    rainTransactionIds: ["rain-txn-c", "rain-txn-a", "rain-txn-b"],
  });
  assert.equal(
    first,
    hashRainSettlement({
      ...base,
      rainTransactionIds: ["rain-txn-b", "rain-txn-c", "rain-txn-a"],
    }),
  );
  assert.notEqual(
    first,
    hashRainSettlement({
      ...base,
      commitmentId: HERO_MONAD_COMMITMENT.fundingRoot,
      rainTransactionIds: ["rain-txn-a", "rain-txn-b", "rain-txn-c"],
    }),
  );
  assert.throws(
    () => hashRainSettlement({ ...base, rainTransactionIds: [] }),
    (error) => error?.code === "EMPTY_RAIN_SETTLEMENT",
  );
});

test("live preparation finalizes the commitment before registering any offer and is repeat-stable", async () => {
  clearRuntimeMonadPreparation();
  const calls = [];
  const adapter = fakeAdapter(calls);
  const now = new Date("2026-08-08T18:30:00.000Z");
  const first = await prepareHeroMarketOnMonad({ now, adapter });
  const replay = await prepareHeroMarketOnMonad({ now, adapter });

  assert.equal(calls[0][0], "commit");
  assert.deepEqual(calls.slice(1).map(([kind]) => kind), Array(6).fill("offer"));
  assert.equal(first.preparation.commitment.offerHashes.length, 6);
  assert.equal(first.preparation.commitmentId, replay.preparation.commitmentId);
  assert.equal(replay.replayed, true);
  assert.equal(calls.length, 7, "runtime replay must not create another chain write");

  const early = getStableHeroBidWindow(new Date("2026-08-08T00:01:00.000Z"));
  const late = getStableHeroBidWindow(new Date("2026-08-08T23:59:00.000Z"));
  assert.deepEqual(early, late);
  assert.ok(Date.parse(early.bidClosesAt) > now.getTime());
});

test("post-Rain attestation binds the exact unique provider transaction set", async () => {
  clearRuntimeMonadPreparation();
  const calls = [];
  const adapter = fakeAdapter(calls);
  await prepareHeroMarketOnMonad({
    now: new Date("2026-08-08T18:30:00.000Z"),
    adapter,
  });
  const result = await attestSettledRainTransactionsOnMonad(
    {
      rainTransactionIds: ["rain-settlement-b", "rain-settlement-a", "rain-settlement-c"],
      capturedCents: HERO_DEMO.outcome.pooledTotalCents,
    },
    adapter,
  );
  assert.equal(result.rainTransactionCount, 3);
  assert.equal(calls.at(-1)[0], "attest");

  await assert.rejects(
    attestSettledRainTransactionsOnMonad(
      {
        rainTransactionIds: ["rain-settlement-a", "rain-settlement-a"],
      },
      adapter,
    ),
    (error) => error?.code === "INVALID_RAIN_TRANSACTION_SET",
  );
});
