import assert from "node:assert/strict";
import test from "node:test";
import {
  createFundingLedger,
  depositFunds,
  freezeReservation,
  HERO_FUNDING,
  joinPool,
  leavePool,
  markReconciliationRequired,
  settleReservation,
  withdrawAvailableFunds,
} from "../lib/funding/index.ts";
import { HERO_DEMO } from "../lib/market/index.ts";

const joinInput = {
  poolId: "pool-test",
  intentId: "intent-test",
  buyerId: "buyer-test",
  productSku: "SKU-TEST",
  quantity: 1,
  msrpUnitCents: 47_900,
  currency: "USD",
  idempotencyKey: "test-join",
  now: "2026-08-08T17:00:00.000Z",
};

function ledgerWithDeposit(amountCents = 47_900) {
  return depositFunds(
    {
      buyerId: "buyer-test",
      amountCents,
      currency: "USD",
      idempotencyKey: "test-deposit",
    },
    createFundingLedger(),
  ).ledger;
}

test("hero buyers reserve MSRP, capture the deal, and unlock exactly $1,080", () => {
  assert.equal(HERO_FUNDING.summary.totalDepositedCents, 574_800);
  assert.equal(HERO_FUNDING.summary.totalReservedCents, 574_800);
  assert.equal(HERO_FUNDING.summary.totalCapturedCents, 466_800);
  assert.equal(HERO_FUNDING.summary.totalReleasedCents, 108_000);
  assert.deepEqual(
    HERO_FUNDING.summary.buyers.map((buyer) => [
      buyer.buyerId,
      buyer.reservedCents,
      buyer.capturedCents,
      buyer.releasedCents,
    ]),
    [
      ["buyer-harbor", 143_700, 116_700, 27_000],
      ["buyer-patchwork", 191_600, 155_600, 36_000],
      ["buyer-kernel", 239_500, 194_500, 45_000],
    ],
  );
  assert.ok(
    HERO_FUNDING.frozenReservations.every(
      (reservation) => reservation.state === "frozen",
    ),
  );
  assert.ok(
    HERO_FUNDING.settledReservations.every(
      (reservation) => reservation.state === "settled",
    ),
  );
});

test("an insufficient cleared deposit cannot join and does not mutate the ledger", () => {
  const ledger = ledgerWithDeposit(47_899);
  assert.throws(
    () => joinPool(joinInput, ledger),
    (error) => error?.code === "INSUFFICIENT_CLEARED_BALANCE",
  );
  assert.equal(ledger.accounts["buyer-test"].availableCents, 47_899);
  assert.deepEqual(ledger.reservations, {});
});

test("joining atomically moves MSRP from available to reserved", () => {
  const joined = joinPool(joinInput, ledgerWithDeposit());
  const account = joined.ledger.accounts["buyer-test"];
  assert.equal(account.availableCents, 0);
  assert.equal(account.reservedCents, 47_900);
  assert.equal(joined.reservation?.reservedCents, 47_900);
  assert.equal(joined.reservation?.state, "active");
});

test("surplus stays withdrawable while the MSRP reservation cannot be touched", () => {
  const joined = joinPool(joinInput, ledgerWithDeposit(60_000));
  const withdrew = withdrawAvailableFunds(
    {
      buyerId: "buyer-test",
      amountCents: 12_100,
      currency: "USD",
      idempotencyKey: "test-withdraw-surplus",
    },
    joined.ledger,
  );
  assert.equal(withdrew.ledger.accounts["buyer-test"].availableCents, 0);
  assert.equal(withdrew.ledger.accounts["buyer-test"].reservedCents, 47_900);
  assert.throws(
    () =>
      withdrawAvailableFunds(
        {
          buyerId: "buyer-test",
          amountCents: 1,
          currency: "USD",
          idempotencyKey: "test-withdraw-locked",
        },
        withdrew.ledger,
      ),
    (error) => error?.code === "INSUFFICIENT_AVAILABLE_BALANCE",
  );
});

test("join retries are idempotent and conflicting payloads fail closed", () => {
  const funded = ledgerWithDeposit(100_000);
  const first = joinPool(joinInput, funded);
  const replay = joinPool(joinInput, first.ledger);
  assert.equal(replay.replayed, true);
  assert.equal(replay.ledger.accounts["buyer-test"].reservedCents, 47_900);
  assert.throws(
    () => joinPool({ ...joinInput, quantity: 2 }, first.ledger),
    (error) => error?.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("the same available dollars cannot back a second pool", () => {
  const first = joinPool(joinInput, ledgerWithDeposit());
  assert.throws(
    () =>
      joinPool(
        {
          ...joinInput,
          poolId: "pool-second",
          intentId: "intent-second",
          idempotencyKey: "test-second-join",
        },
        first.ledger,
      ),
    (error) => error?.code === "INSUFFICIENT_CLEARED_BALANCE",
  );
});

test("leaving before cutoff releases MSRP exactly once", () => {
  const joined = joinPool(joinInput, ledgerWithDeposit());
  const reservationId = joined.reservation.id;
  const leaveInput = {
    reservationId,
    idempotencyKey: "test-leave",
    now: "2026-08-08T17:05:00.000Z",
  };
  const left = leavePool(leaveInput, joined.ledger);
  assert.equal(left.ledger.accounts["buyer-test"].availableCents, 47_900);
  assert.equal(left.ledger.accounts["buyer-test"].reservedCents, 0);
  assert.equal(left.reservation?.state, "released");
  assert.equal(leavePool(leaveInput, left.ledger).replayed, true);
  assert.equal(left.ledger.accounts["buyer-test"].availableCents, 47_900);
});

test("offer acceptance freezes the reservation and blocks buyer withdrawal", () => {
  const joined = joinPool(joinInput, ledgerWithDeposit());
  const frozen = freezeReservation(
    {
      reservationId: joined.reservation.id,
      idempotencyKey: "test-freeze",
      now: "2026-08-08T17:10:00.000Z",
    },
    joined.ledger,
  );
  assert.equal(frozen.reservation?.state, "frozen");
  assert.throws(
    () =>
      leavePool(
        {
          reservationId: joined.reservation.id,
          idempotencyKey: "test-late-leave",
          now: "2026-08-08T17:11:00.000Z",
        },
        frozen.ledger,
      ),
    (error) => error?.code === "COMMITMENT_CUTOFF_PASSED",
  );
});

test("settlement cannot exceed the lock and releases only the savings", () => {
  const joined = joinPool(joinInput, ledgerWithDeposit());
  const frozen = freezeReservation(
    {
      reservationId: joined.reservation.id,
      idempotencyKey: "test-freeze-for-settle",
      now: "2026-08-08T17:10:00.000Z",
    },
    joined.ledger,
  );
  assert.throws(
    () =>
      settleReservation(
        {
          reservationId: joined.reservation.id,
          captureCents: 47_901,
          idempotencyKey: "test-over-capture",
          now: "2026-08-08T17:12:00.000Z",
        },
        frozen.ledger,
      ),
    (error) => error?.code === "CAPTURE_EXCEEDS_RESERVATION",
  );
  const settled = settleReservation(
    {
      reservationId: joined.reservation.id,
      captureCents: 38_900,
      idempotencyKey: "test-settle",
      now: "2026-08-08T17:12:00.000Z",
    },
    frozen.ledger,
  );
  assert.equal(settled.ledger.accounts["buyer-test"].reservedCents, 0);
  assert.equal(settled.ledger.accounts["buyer-test"].capturedCents, 38_900);
  assert.equal(settled.ledger.accounts["buyer-test"].availableCents, 9_000);
  assert.equal(settled.reservation?.releasedCents, 9_000);
});

test("partial-provider reconciliation keeps the entire internal lock frozen", () => {
  const joined = joinPool(joinInput, ledgerWithDeposit());
  const frozen = freezeReservation(
    {
      reservationId: joined.reservation.id,
      idempotencyKey: "test-freeze-partial",
      now: "2026-08-08T17:10:00.000Z",
    },
    joined.ledger,
  );
  const reconciliation = markReconciliationRequired(
    {
      reservationId: joined.reservation.id,
      idempotencyKey: "test-reconciliation",
      now: "2026-08-08T17:12:00.000Z",
    },
    frozen.ledger,
  );
  assert.equal(reconciliation.reservation?.state, "reconciliation_required");
  assert.equal(reconciliation.ledger.accounts["buyer-test"].reservedCents, 47_900);
  assert.equal(reconciliation.ledger.accounts["buyer-test"].availableCents, 0);
});

test("funding snapshots reconcile to the market agreement and authorization", () => {
  const authorization = HERO_DEMO.authorization.authorization;
  assert.ok(authorization);
  assert.equal(HERO_FUNDING.poolId, HERO_DEMO.coalition.id);
  assert.equal(HERO_FUNDING.productSku, HERO_DEMO.product.sku);
  assert.equal(HERO_FUNDING.msrpUnitCents, HERO_DEMO.product.baselineUnitPriceCents);
  assert.equal(HERO_FUNDING.dealUnitCents, HERO_DEMO.outcome.pooledUnitPriceCents);
  assert.equal(HERO_FUNDING.summary.totalCapturedCents, authorization.totalAmountCents);
  for (const reservation of HERO_FUNDING.frozenReservations) {
    const charge = authorization.charges.find(
      (candidate) => candidate.buyerId === reservation.buyerId,
    );
    assert.ok(charge);
    assert.equal(reservation.intentId, charge.intentId);
    assert.equal(reservation.quantity, charge.quantity);
    assert.equal(reservation.state, "frozen");
    assert.ok(charge.amountCents <= reservation.reservedCents);
  }
});
