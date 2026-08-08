import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductWorkspaceInvariant,
  createSeededProductWorkspace,
  LOCAL_TREASURY_FIXTURE_CENTS,
  PRODUCT_SEED_VERSION,
  PRODUCT_WORKSPACE_SCHEMA_VERSION,
  reduceProductWorkspace,
} from "../lib/product/index.ts";

const T0 = "2026-08-08T16:00:00.000Z";
const T1 = "2026-08-08T16:01:00.000Z";
const T2 = "2026-08-08T16:02:00.000Z";
const T3 = "2026-08-08T16:03:00.000Z";
const BUYER_ID = "buyer-demo";
const SONY_PRODUCT_ID = "product-sony-wh1000xm6";
const SONY_POOL_ID = "pool-sony-xm6-august";
const SONY_MSRP_CENTS = 44_999;

// The live sandbox figures observed from Rain's GET /issuing/balances.
const RAIL_SPENDING_POWER_CENTS = 1_533_200;

const syncRailTreasury = (state) =>
  reduceProductWorkspace(state, {
    type: "treasury/sync",
    activityId: "activity-treasury-sync",
    at: T1,
    source: "rain-sandbox",
    spendingPowerCents: RAIL_SPENDING_POWER_CENTS,
    creditLimitCents: 2_000_000,
    postedChargesCents: 466_800,
    pendingChargesCents: 0,
  });

const deposit = (state, amountCents = SONY_MSRP_CENTS) =>
  reduceProductWorkspace(state, {
    type: "sandbox/deposit",
    activityId: `activity-deposit-${amountCents}`,
    at: T1,
    buyerId: BUYER_ID,
    amountCents,
  });

const createSonyIntent = (state, overrides = {}) =>
  reduceProductWorkspace(state, {
    type: "intent/create",
    activityId: "activity-intent-sony",
    at: T2,
    intentId: "intent-sony",
    buyerId: BUYER_ID,
    productId: SONY_PRODUCT_ID,
    quantity: 1,
    targetUnitPriceCents: 37_900,
    expiresAt: "2026-08-14T16:00:00.000Z",
    ...overrides,
  });

const joinSonyPool = (state, overrides = {}) =>
  reduceProductWorkspace(state, {
    type: "pool/join",
    activityId: "activity-join-sony",
    at: T3,
    membershipId: "membership-sony",
    poolId: SONY_POOL_ID,
    intentId: "intent-sony",
    buyerId: BUYER_ID,
    ...overrides,
  });

test("the versioned workspace seeds a product marketplace led by the Sony XM6 pool", () => {
  const state = createSeededProductWorkspace({ now: T0 });

  assert.equal(state.schemaVersion, PRODUCT_WORKSPACE_SCHEMA_VERSION);
  assert.equal(state.seedVersion, PRODUCT_SEED_VERSION);
  assert.equal(state.revision, 0);
  assert.equal(Object.keys(state.products).length, 4);
  assert.equal(Object.keys(state.pools).length, 4);
  assert.equal(state.products[SONY_PRODUCT_ID].name, "WH-1000XM6 Wireless Headphones");
  assert.equal(state.products[SONY_PRODUCT_ID].msrpUnitCents, SONY_MSRP_CENTS);
  assert.equal(state.pools[SONY_POOL_ID].committedUnitCount, 34);
  assert.equal(state.pools[SONY_POOL_ID].status, "forming");
  assert.equal(assertProductWorkspaceInvariant(state), true);
});

test("a sandbox deposit increases available funds without mutating the prior revision", () => {
  const original = createSeededProductWorkspace({ now: T0 });
  const funded = deposit(original, 60_000);

  assert.equal(original.balances[BUYER_ID].totalDepositedCents, 0);
  assert.equal(original.activity.length, 1);
  assert.equal(funded.balances[BUYER_ID].totalDepositedCents, 60_000);
  assert.equal(funded.balances[BUYER_ID].availableCents, 60_000);
  assert.equal(funded.revision, 1);
  assert.equal(funded.activity.at(-1).kind, "sandbox.deposit_recorded");
  assert.equal(Object.isFrozen(funded.activity.at(-1)), true);
  assert.equal(Object.isFrozen(funded.activity.at(-1).metadata), true);
  assert.equal(assertProductWorkspaceInvariant(funded), true);
});

test("creating an intent captures product, quantity, target, and expiration", () => {
  const funded = deposit(createSeededProductWorkspace({ now: T0 }));
  const intended = createSonyIntent(funded);

  assert.equal(funded.intents["intent-sony"], undefined);
  assert.deepEqual(intended.intents["intent-sony"], {
    id: "intent-sony",
    buyerId: BUYER_ID,
    productId: SONY_PRODUCT_ID,
    quantity: 1,
    targetUnitPriceCents: 37_900,
    createdAt: T2,
    expiresAt: "2026-08-14T16:00:00.000Z",
    status: "open",
  });
  assert.equal(intended.activity.at(-1).kind, "intent.created");
});

test("joining atomically moves the full MSRP from available to reserved", () => {
  const funded = deposit(createSeededProductWorkspace({ now: T0 }), 60_000);
  const intended = createSonyIntent(funded);
  const joined = joinSonyPool(intended);

  assert.equal(intended.balances[BUYER_ID].availableCents, 60_000);
  assert.equal(joined.balances[BUYER_ID].availableCents, 15_001);
  assert.equal(joined.balances[BUYER_ID].reservedCents, SONY_MSRP_CENTS);
  assert.equal(joined.memberships["membership-sony"].reservedCents, SONY_MSRP_CENTS);
  assert.equal(joined.intents["intent-sony"].status, "joined");
  assert.equal(joined.pools[SONY_POOL_ID].committedUnitCount, 35);
  assert.equal(joined.activity.at(-1).kind, "pool.joined");
  assert.equal(assertProductWorkspaceInvariant(joined), true);
});

test("joining fails closed when even one cent short of full MSRP coverage", () => {
  const funded = deposit(
    createSeededProductWorkspace({ now: T0 }),
    SONY_MSRP_CENTS - 1,
  );
  const intended = createSonyIntent(funded);

  assert.throws(
    () => joinSonyPool(intended),
    (error) => error?.code === "INSUFFICIENT_AVAILABLE_BALANCE",
  );
  assert.equal(intended.balances[BUYER_ID].reservedCents, 0);
  assert.deepEqual(intended.memberships, {});
});

test("an intent or buyer cannot create a duplicate active pool commitment", () => {
  const funded = deposit(createSeededProductWorkspace({ now: T0 }), 100_000);
  const joined = joinSonyPool(createSonyIntent(funded));

  assert.throws(
    () =>
      joinSonyPool(joined, {
        activityId: "activity-join-duplicate",
        membershipId: "membership-sony-duplicate",
      }),
    (error) => error?.code === "INTENT_NOT_OPEN",
  );

  const secondIntent = createSonyIntent(joined, {
    activityId: "activity-intent-sony-second",
    intentId: "intent-sony-second",
  });
  assert.throws(
    () =>
      joinSonyPool(secondIntent, {
        activityId: "activity-join-second-intent",
        membershipId: "membership-sony-second",
        intentId: "intent-sony-second",
      }),
    (error) => error?.code === "DUPLICATE_MEMBERSHIP",
  );
});

test("leaving before cutoff releases exactly the original MSRP reservation", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(createSeededProductWorkspace({ now: T0 }), 60_000)),
  );
  const left = reduceProductWorkspace(joined, {
    type: "pool/leave",
    activityId: "activity-leave-sony",
    at: "2026-08-10T16:00:00.000Z",
    membershipId: "membership-sony",
    buyerId: BUYER_ID,
  });

  assert.equal(joined.balances[BUYER_ID].availableCents, 15_001);
  assert.equal(left.balances[BUYER_ID].availableCents, 60_000);
  assert.equal(left.balances[BUYER_ID].reservedCents, 0);
  assert.equal(left.memberships["membership-sony"].status, "left");
  assert.equal(left.intents["intent-sony"].status, "withdrawn");
  assert.equal(left.pools[SONY_POOL_ID].committedUnitCount, 34);
  assert.equal(left.activity.at(-1).metadata.releasedCents, SONY_MSRP_CENTS);
  assert.equal(assertProductWorkspaceInvariant(left), true);

  assert.throws(
    () =>
      reduceProductWorkspace(left, {
        type: "pool/leave",
        activityId: "activity-leave-sony-twice",
        at: "2026-08-10T16:01:00.000Z",
        membershipId: "membership-sony",
        buyerId: BUYER_ID,
      }),
    (error) => error?.code === "MEMBERSHIP_NOT_ACTIVE",
  );
});

test("cutoff is a hard boundary for both joins and reservation releases", () => {
  const intended = createSonyIntent(
    deposit(createSeededProductWorkspace({ now: T0 })),
    { expiresAt: "2026-08-20T16:00:00.000Z" },
  );
  assert.throws(
    () => joinSonyPool(intended, { at: "2026-08-15T16:00:00.000Z" }),
    (error) => error?.code === "POOL_CUTOFF_PASSED",
  );

  const joined = joinSonyPool(intended);
  assert.throws(
    () =>
      reduceProductWorkspace(joined, {
        type: "pool/leave",
        activityId: "activity-leave-after-cutoff",
        at: "2026-08-15T16:00:00.000Z",
        membershipId: "membership-sony",
        buyerId: BUYER_ID,
      }),
    (error) => error?.code === "POOL_CUTOFF_PASSED",
  );
  assert.equal(joined.balances[BUYER_ID].reservedCents, SONY_MSRP_CENTS);
});

test("non-forming pools never accept new commitments", () => {
  const intended = createSonyIntent(
    deposit(createSeededProductWorkspace({ now: T0 })),
  );
  const locked = {
    ...intended,
    pools: {
      ...intended.pools,
      [SONY_POOL_ID]: { ...intended.pools[SONY_POOL_ID], status: "bidding" },
    },
  };

  assert.throws(
    () => joinSonyPool(locked),
    (error) => error?.code === "POOL_NOT_FORMING",
  );
});

test("a fresh workspace starts on the labeled offline ceiling", () => {
  const state = createSeededProductWorkspace({ now: T0 });
  assert.equal(state.treasury.source, "local");
  assert.equal(state.treasury.syncedAt, null);
  assert.equal(state.treasury.spendingPowerCents, LOCAL_TREASURY_FIXTURE_CENTS);
  assert.ok(assertProductWorkspaceInvariant(state));
});

test("syncing the rail ceiling records its provenance", () => {
  const synced = syncRailTreasury(createSeededProductWorkspace({ now: T0 }));

  assert.equal(synced.treasury.source, "rain-sandbox");
  assert.equal(synced.treasury.spendingPowerCents, RAIL_SPENDING_POWER_CENTS);
  assert.equal(synced.treasury.postedChargesCents, 466_800);
  assert.equal(synced.treasury.syncedAt, T1);
  assert.equal(synced.activity.at(-1).kind, "treasury.synced");
  assert.equal(synced.activity.at(-1).metadata.source, "rain-sandbox");
  assert.ok(assertProductWorkspaceInvariant(synced));
});

test("credits cannot exceed the rail's real spending power", () => {
  const synced = syncRailTreasury(createSeededProductWorkspace({ now: T0 }));

  const atCeiling = reduceProductWorkspace(synced, {
    type: "sandbox/deposit",
    activityId: "activity-deposit-ceiling",
    at: T2,
    buyerId: BUYER_ID,
    amountCents: RAIL_SPENDING_POWER_CENTS,
  });
  assert.equal(
    atCeiling.balances[BUYER_ID].availableCents,
    RAIL_SPENDING_POWER_CENTS,
  );

  // One cent past the live ceiling must fail closed.
  assert.throws(
    () =>
      reduceProductWorkspace(atCeiling, {
        type: "sandbox/deposit",
        activityId: "activity-deposit-over",
        at: T3,
        buyerId: BUYER_ID,
        amountCents: 1,
      }),
    (error) => error?.code === "TREASURY_LIMIT_EXCEEDED",
  );
  assert.ok(assertProductWorkspaceInvariant(atCeiling));
});

test("a ceiling below existing credits is rejected, not silently applied", () => {
  const funded = deposit(
    syncRailTreasury(createSeededProductWorkspace({ now: T0 })),
    100_000,
  );

  assert.throws(
    () =>
      reduceProductWorkspace(funded, {
        type: "treasury/sync",
        activityId: "activity-treasury-shrink",
        at: T3,
        source: "rain-sandbox",
        spendingPowerCents: 99_999,
        creditLimitCents: 2_000_000,
        postedChargesCents: 1_900_001,
        pendingChargesCents: 0,
      }),
    (error) => error?.code === "TREASURY_LIMIT_EXCEEDED",
  );
  assert.equal(funded.treasury.spendingPowerCents, RAIL_SPENDING_POWER_CENTS);
  assert.ok(assertProductWorkspaceInvariant(funded));
});
