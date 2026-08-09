import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNegotiationTranscript,
  DemandCurveError,
  MACBOOK_DEMAND_SCENARIO,
  negotiateDemandCurve,
  volumeDiscountBps,
} from "../lib/negotiation/index.ts";

test("the MacBook demand curve clears to 30% off and everyone pays the same price", () => {
  const clearing = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO);

  assert.equal(clearing.code, "cleared");
  // Deepest rung's volume (560 units) unlocks Vertex's 30% floor.
  assert.equal(clearing.clearingUnitPriceCents, 70_000);
  assert.equal(clearing.clearingDiscountBps, 3_000);
  assert.equal(clearing.winner.merchantId, "merchant-vertex");

  // All three rungs are willing to pay $700, so all 560 buyers activate.
  assert.equal(clearing.activatedBuyers, 560);
  assert.equal(clearing.activatedUnits, 560);

  // The 300 who pledged only 10% off ($900) still pay $700.
  const tenPercent = clearing.tierOutcomes.find((tier) => tier.discountBps === 1_000);
  assert.equal(tenPercent.included, true);
  assert.equal(tenPercent.paidUnitPriceCents, 70_000);
  assert.equal(tenPercent.surplusPerBuyerCents, 20_000); // $900 ceiling − $700 paid

  // Total savings versus MSRP: 560 × ($1000 − $700).
  assert.equal(clearing.totalSavingsCents, 560 * 30_000);
});

test("a buyer who commits at $900 still gets a $790-style lower clearing price", () => {
  // Merchants that bottom out at 21% off ($790) instead of 30%.
  const shallow = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO, {
    merchants: [
      { id: "merchant-a", name: "A", deliveryDays: 5, warrantyMonths: 24, maxDiscountBps: 2_100 },
      { id: "merchant-b", name: "B", deliveryDays: 5, warrantyMonths: 24, maxDiscountBps: 2_000 },
    ],
  });

  assert.equal(shallow.code, "cleared");
  assert.equal(shallow.clearingUnitPriceCents, 79_000); // 21% off $1,000
  // Buyers who pledged 10% off ($900) and 20% off ($800) are willing at $790.
  assert.equal(shallow.activatedBuyers, 480);
  // The 30%-off ($700) rung is NOT willing to pay $790 and is excluded.
  const thirty = shallow.tierOutcomes.find((tier) => tier.discountBps === 3_000);
  assert.equal(thirty.included, false);
  assert.equal(thirty.paidUnitPriceCents, null);
});

test("deeper committed volume never produces a worse merchant price", () => {
  const clearing = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO);
  const bestByRound = clearing.rounds.map((round) => round.bestUnitPriceCents);
  for (let i = 1; i < bestByRound.length; i += 1) {
    assert.ok(
      bestByRound[i] <= bestByRound[i - 1],
      "a deeper price level should never quote higher",
    );
  }
});

test("negotiation is fully deterministic", () => {
  const a = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO);
  const b = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO);
  assert.deepEqual(a, b);
});

test("a curve demanding more than any merchant will give clears no deal", () => {
  const clearing = negotiateDemandCurve({
    productLabel: "Impossible ask",
    msrpUnitCents: 100_000,
    pledges: [{ discountBps: 4_000, buyerCount: 5 }], // wants 40% off, thin volume
  });

  assert.equal(clearing.code, "no_acceptable_offer");
  assert.equal(clearing.winner, null);
  assert.equal(clearing.activatedUnits, 0);
  assert.ok(clearing.shortfall.gapCents > 0);
  // The reported best achievable price is genuinely above the highest pledge.
  assert.ok(
    clearing.shortfall.bestAchievableUnitPriceCents > clearing.shortfall.highestPledgeUnitPriceCents,
  );
});

test("the public transcript never leaks a private merchant floor or max discount", () => {
  const clearing = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO);
  const serialized = JSON.stringify({
    clearing,
    transcript: buildNegotiationTranscript(clearing),
  });
  assert.ok(!serialized.includes("maxDiscountBps"));
  assert.ok(!serialized.toLowerCase().includes("floor"));
});

test("the transcript ends on the cleared price it was given", () => {
  const clearing = negotiateDemandCurve(MACBOOK_DEMAND_SCENARIO);
  const transcript = buildNegotiationTranscript(clearing);
  const last = transcript.at(-1);
  assert.equal(last.kind, "cleared");
  assert.equal(last.unitPriceCents, clearing.clearingUnitPriceCents);
});

test("volume discount schedule is monotonic and bounded", () => {
  assert.equal(volumeDiscountBps(0), 0);
  assert.equal(volumeDiscountBps(5), 250);
  assert.equal(volumeDiscountBps(300), 2_200);
  assert.equal(volumeDiscountBps(560), 3_000);
  assert.equal(volumeDiscountBps(10_000), 3_000); // capped
});

test("invalid curves are rejected before any negotiation happens", () => {
  assert.throws(
    () => negotiateDemandCurve({ productLabel: "x", msrpUnitCents: 0, pledges: [{ discountBps: 1_000, buyerCount: 1 }] }),
    DemandCurveError,
  );
  assert.throws(
    () => negotiateDemandCurve({ productLabel: "x", msrpUnitCents: 100_000, pledges: [] }),
    DemandCurveError,
  );
  assert.throws(
    () =>
      negotiateDemandCurve({
        productLabel: "x",
        msrpUnitCents: 100_000,
        pledges: [
          { discountBps: 1_000, buyerCount: 1 },
          { discountBps: 1_000, buyerCount: 2 },
        ],
      }),
    DemandCurveError,
  );
});
