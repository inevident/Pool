import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductWorkspaceInvariant,
  createResetProductWorkspace,
  createSeededProductWorkspace,
  hasProductPoolMetMinimum,
  LOCAL_TREASURY_FIXTURE_CENTS,
  PRODUCT_POOL_BID_WINDOW_MS,
  PRODUCT_POOL_COMMITMENT_WINDOW_DAYS,
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
    expiresAt: "2026-09-08T16:00:00.000Z",
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

const releaseSonyAfterOutcome = (state, overrides = {}) =>
  reduceProductWorkspace(state, {
    type: "pool/release_after_outcome",
    activityId: "activity-release-sony-outcome",
    at: "2026-08-22T16:00:00.000Z",
    membershipId: "membership-sony",
    buyerId: BUYER_ID,
    reason: "no_acceptable_offer",
    operationId: "pool-settle-operation-sony",
    ...overrides,
  });

test("reset clears buyer state without relabeling a successful Rain observation", () => {
  const synced = syncRailTreasury(createSeededProductWorkspace({ now: T0 }));
  const funded = deposit(synced, 50_000);
  const reset = createResetProductWorkspace(funded);

  assert.deepEqual(reset.treasury, synced.treasury);
  assert.equal(reset.balances[BUYER_ID].totalDepositedCents, 0);
  assert.equal(reset.balances[BUYER_ID].availableCents, 0);
  assert.deepEqual(reset.intents, {});
  assert.deepEqual(reset.memberships, {});
  assert.equal(reset.revision, 0);
  assert.deepEqual(
    reset.activity.map((entry) => entry.kind),
    ["workspace.seeded"],
  );
  assert.doesNotThrow(() => assertProductWorkspaceInvariant(reset));
});

test("the versioned workspace seeds a product marketplace led by the Sony XM6 pool", () => {
  const state = createSeededProductWorkspace({ now: T0 });

  assert.equal(state.schemaVersion, PRODUCT_WORKSPACE_SCHEMA_VERSION);
  assert.equal(state.seedVersion, PRODUCT_SEED_VERSION);
  assert.equal(state.revision, 0);
  // The imported sample catalog extends the market, so assert the invariant
  // rather than a count: every product has exactly one pool, and the
  // hand-seeded entries the agent and evidence bind to are all still present.
  assert.equal(
    Object.keys(state.products).length,
    Object.keys(state.pools).length,
  );
  for (const id of [
    SONY_PRODUCT_ID,
    "product-steam-deck-oled-512",
    "product-macbook-air-m4-13",
    "product-dyson-airwrap-id",
    "product-monitor-27-4k-usbc",
  ]) {
    assert.ok(state.products[id], `${id} missing from the seeded catalog`);
  }
  for (const pool of Object.values(state.pools)) {
    assert.ok(
      state.products[pool.productId],
      `pool ${pool.id} references an unseeded product`,
    );
  }
  assert.equal(state.products[SONY_PRODUCT_ID].name, "WH-1000XM6 Wireless Headphones");
  assert.equal(state.products[SONY_PRODUCT_ID].msrpUnitCents, SONY_MSRP_CENTS);
  assert.equal(state.pools[SONY_POOL_ID].committedUnitCount, 34);
  assert.equal(state.pools[SONY_POOL_ID].minimumCommittedUnitCount, 10);
  assert.equal(
    state.products["product-monitor-27-4k-usbc"].msrpUnitCents,
    47_900,
  );
  assert.equal(
    state.pools["pool-monitor-reference-august"].committedUnitCount,
    12,
  );
  assert.equal(
    state.pools[SONY_POOL_ID].cutoffAt,
    "2026-08-22T16:00:00.000Z",
  );
  assert.equal(PRODUCT_POOL_COMMITMENT_WINDOW_DAYS, 14);
  for (const pool of Object.values(state.pools)) {
    assert.equal(pool.minimumCommittedUnitCount, 10);
    assert.equal("targetMemberCount" in pool, false);
    assert.equal(
      Date.parse(pool.cutoffAt) - Date.parse(pool.createdAt),
      PRODUCT_POOL_COMMITMENT_WINDOW_DAYS * 86_400_000,
    );
  }
  assert.equal(state.pools[SONY_POOL_ID].status, "forming");
  assert.equal(assertProductWorkspaceInvariant(state), true);
});

test("the pool minimum is a viability floor, never a target or enrollment cap", () => {
  const original = createSeededProductWorkspace({ now: T0 });
  const minimum = original.pools[SONY_POOL_ID].minimumCommittedUnitCount;
  const atMinimum = {
    ...original,
    pools: {
      ...original.pools,
      [SONY_POOL_ID]: {
        ...original.pools[SONY_POOL_ID],
        committedUnitCount: minimum,
      },
    },
  };

  assert.equal(hasProductPoolMetMinimum(atMinimum.pools[SONY_POOL_ID]), true);

  const funded = deposit(atMinimum, SONY_MSRP_CENTS * 2);
  const intended = createSonyIntent(funded, { quantity: 2 });
  const joined = joinSonyPool(intended);

  assert.equal(joined.pools[SONY_POOL_ID].committedUnitCount, minimum + 2);
  assert.equal(
    joined.pools[SONY_POOL_ID].committedUnitCount >
      joined.pools[SONY_POOL_ID].minimumCommittedUnitCount,
    true,
  );
  assert.equal(hasProductPoolMetMinimum(joined.pools[SONY_POOL_ID]), true);
  assert.equal(joined.pools[SONY_POOL_ID].status, "forming");

  const belowMinimum = {
    ...joined.pools[SONY_POOL_ID],
    committedUnitCount: minimum - 1,
  };
  assert.equal(hasProductPoolMetMinimum(belowMinimum), false);
  assert.equal(assertProductWorkspaceInvariant(joined), true);
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
    expiresAt: "2026-09-08T16:00:00.000Z",
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

test("joining rejects pools outside the saved price or deadline mandate", () => {
  const funded = deposit(createSeededProductWorkspace({ now: T0 }), 60_000);
  const overMaximum = createSonyIntent(funded, {
    targetUnitPriceCents: 37_899,
  });
  assert.throws(
    () => joinSonyPool(overMaximum),
    (error) => error?.code === "INTENT_PRICE_INCOMPATIBLE",
  );

  const deadlineBeforeFastestDelivery = createSonyIntent(funded, {
    activityId: "activity-intent-short-deadline",
    intentId: "intent-short-deadline",
    // The merchant market has closed, but even the fastest five-day offer
    // cannot arrive by this mandate deadline.
    expiresAt: "2026-08-26T16:30:00.000Z",
  });
  assert.throws(
    () =>
      joinSonyPool(deadlineBeforeFastestDelivery, {
        activityId: "activity-join-short-deadline",
        intentId: "intent-short-deadline",
      }),
    (error) => error?.code === "INTENT_DEADLINE_INCOMPATIBLE",
  );
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
    { expiresAt: "2026-09-08T16:00:00.000Z" },
  );
  assert.throws(
    () => joinSonyPool(intended, { at: "2026-08-22T16:00:00.000Z" }),
    (error) => error?.code === "POOL_CUTOFF_PASSED",
  );

  const joined = joinSonyPool(intended);
  assert.throws(
    () =>
      reduceProductWorkspace(joined, {
        type: "pool/leave",
        activityId: "activity-leave-after-cutoff",
        at: "2026-08-22T16:00:00.000Z",
        membershipId: "membership-sony",
        buyerId: BUYER_ID,
      }),
    (error) => error?.code === "POOL_CUTOFF_PASSED",
  );
  assert.equal(joined.balances[BUYER_ID].reservedCents, SONY_MSRP_CENTS);
});

test("a below-minimum outcome releases the full reservation exactly once after cutoff", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(createSeededProductWorkspace({ now: T0 }), 60_000)),
  );
  const belowMinimum = {
    ...joined,
    pools: {
      ...joined.pools,
      [SONY_POOL_ID]: {
        ...joined.pools[SONY_POOL_ID],
        committedUnitCount:
          joined.pools[SONY_POOL_ID].minimumCommittedUnitCount - 1,
      },
    },
  };
  const releaseAction = {
    type: "pool/release_after_outcome",
    activityId: "activity-release-below-minimum",
    at: belowMinimum.pools[SONY_POOL_ID].cutoffAt,
    membershipId: "membership-sony",
    buyerId: BUYER_ID,
    reason: "minimum_not_met",
    operationId: "pool-settle-operation-below-minimum",
  };
  const released = reduceProductWorkspace(belowMinimum, releaseAction);

  assert.equal(released.balances[BUYER_ID].availableCents, 60_000);
  assert.equal(released.balances[BUYER_ID].reservedCents, 0);
  assert.equal(released.memberships["membership-sony"].status, "released");
  assert.deepEqual(released.memberships["membership-sony"].release, {
    reason: "minimum_not_met",
    operationId: "pool-settle-operation-below-minimum",
    releasedCents: SONY_MSRP_CENTS,
    releasedAt: belowMinimum.pools[SONY_POOL_ID].cutoffAt,
  });
  assert.equal(released.intents["intent-sony"].status, "expired");
  assert.equal(released.pools[SONY_POOL_ID].status, "cancelled");
  assert.equal(released.activity.at(-1).kind, "pool.reservation_released");
  assert.equal(assertProductWorkspaceInvariant(released), true);

  // Exact retries are idempotent and cannot create another credit or activity.
  assert.equal(reduceProductWorkspace(released, releaseAction), released);
  assert.throws(
    () =>
      releaseSonyAfterOutcome(released, {
        activityId: "activity-release-different-outcome",
        operationId: "different-market-operation",
      }),
    (error) => error?.code === "MEMBERSHIP_NOT_ACTIVE",
  );
});

test("a no-acceptable-offer outcome releases only after cutoff", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(createSeededProductWorkspace({ now: T0 }), 60_000)),
  );

  assert.throws(
    () =>
      releaseSonyAfterOutcome(joined, {
        at: "2026-08-22T15:59:59.999Z",
      }),
    (error) => error?.code === "POOL_CUTOFF_NOT_REACHED",
  );

  const released = releaseSonyAfterOutcome(joined);
  assert.equal(released.balances[BUYER_ID].reservedCents, 0);
  assert.equal(released.balances[BUYER_ID].availableCents, 60_000);
  assert.equal(
    released.memberships["membership-sony"].release.reason,
    "no_acceptable_offer",
  );
  assert.equal(assertProductWorkspaceInvariant(released), true);
});

test("a modeled quote leaves the reservation intact until explicit local release", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(createSeededProductWorkspace({ now: T0 }), 60_000)),
  );

  // Rendering a modeled quote performs no reducer transition at all.
  assert.equal(joined.memberships["membership-sony"].status, "active");
  assert.equal(joined.memberships["membership-sony"].settlement, undefined);
  assert.equal(joined.balances[BUYER_ID].reservedCents, SONY_MSRP_CENTS);
  assert.equal(joined.balances[BUYER_ID].capturedCents, 0);

  const released = releaseSonyAfterOutcome(joined, {
    reason: "rehearsal_complete",
    operationId: "pool-modeled-quote-sony",
  });
  assert.equal(released.memberships["membership-sony"].status, "released");
  assert.equal(released.memberships["membership-sony"].settlement, undefined);
  assert.equal(
    released.memberships["membership-sony"].release.reason,
    "rehearsal_complete",
  );
  assert.equal(released.balances[BUYER_ID].reservedCents, 0);
  assert.equal(released.balances[BUYER_ID].capturedCents, 0);
  assert.equal(released.balances[BUYER_ID].availableCents, 60_000);
  assert.equal(assertProductWorkspaceInvariant(released), true);
});

test("an explicit authorization decline can release without capturing funds", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(createSeededProductWorkspace({ now: T0 }), 60_000)),
  );
  const released = releaseSonyAfterOutcome(joined, {
    reason: "authorization_declined",
    operationId: "pool-settle-operation-declined",
  });

  assert.equal(released.balances[BUYER_ID].capturedCents, 0);
  assert.equal(released.balances[BUYER_ID].reservedCents, 0);
  assert.equal(released.balances[BUYER_ID].availableCents, 60_000);
  assert.equal(
    released.memberships["membership-sony"].release.reason,
    "authorization_declined",
  );
  assert.equal(assertProductWorkspaceInvariant(released), true);
});

test("a missed execution window releases only at the exact bid-close boundary", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(createSeededProductWorkspace({ now: T0 }), 60_000)),
  );
  const bidClosesAt = new Date(
    Date.parse(joined.pools[SONY_POOL_ID].cutoffAt) +
      PRODUCT_POOL_BID_WINDOW_MS,
  ).toISOString();

  assert.throws(
    () =>
      releaseSonyAfterOutcome(joined, {
        at: new Date(Date.parse(bidClosesAt) - 1).toISOString(),
        reason: "execution_window_missed",
        operationId: "pool-settle-operation-missed-too-early",
      }),
    (error) => error?.code === "RELEASE_OUTCOME_MISMATCH",
  );

  const released = releaseSonyAfterOutcome(joined, {
    at: bidClosesAt,
    reason: "execution_window_missed",
    operationId: "pool-settle-operation-missed",
  });
  assert.equal(released.balances[BUYER_ID].capturedCents, 0);
  assert.equal(released.balances[BUYER_ID].reservedCents, 0);
  assert.equal(released.balances[BUYER_ID].availableCents, 60_000);
  assert.deepEqual(released.memberships["membership-sony"].release, {
    reason: "execution_window_missed",
    operationId: "pool-settle-operation-missed",
    releasedCents: SONY_MSRP_CENTS,
    releasedAt: bidClosesAt,
  });
  assert.equal(assertProductWorkspaceInvariant(released), true);
});

test("a below-minimum release must match the pool's actual frozen quantity", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(createSeededProductWorkspace({ now: T0 }), 60_000)),
  );

  assert.throws(
    () =>
      releaseSonyAfterOutcome(joined, {
        reason: "minimum_not_met",
      }),
    (error) => error?.code === "RELEASE_OUTCOME_MISMATCH",
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

const settleSony = (state, overrides = {}) =>
  reduceProductWorkspace(state, {
    type: "pool/settle",
    activityId: "activity-settle-sony",
    at: "2026-08-22T16:00:00.000Z",
    membershipId: "membership-sony",
    buyerId: BUYER_ID,
    evidence: "rain-sandbox",
    unitPriceCents: 37_765,
    capturedCents: 37_765,
    merchantName: "Signal Supply Co.",
    rainTransactionId: "11111111-2222-3333-4444-555555555555",
    rainCardLast4: "4242",
    ...overrides,
  });

test("settlement cannot mutate reservations before cutoff; exact cutoff succeeds", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(syncRailTreasury(createSeededProductWorkspace({ now: T0 })))),
  );
  const before = structuredClone(joined);

  assert.throws(
    () => settleSony(joined, { at: "2026-08-22T15:59:59.999Z" }),
    (error) => error?.code === "POOL_CUTOFF_NOT_REACHED",
  );
  assert.deepEqual(joined, before);

  const atCutoff = settleSony(joined);
  assert.equal(atCutoff.memberships["membership-sony"].status, "settled");
  assert.equal(
    atCutoff.memberships["membership-sony"].settlement.settledAt,
    joined.pools[SONY_POOL_ID].cutoffAt,
  );
});

test("settling captures the deal price and releases the exact difference", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(syncRailTreasury(createSeededProductWorkspace({ now: T0 })))),
  );
  const settled = settleSony(joined);
  const balance = settled.balances[BUYER_ID];

  assert.equal(balance.reservedCents, 0);
  assert.equal(balance.capturedCents, 37_765);
  assert.equal(balance.availableCents, SONY_MSRP_CENTS - 37_765);
  assert.equal(
    balance.availableCents + balance.reservedCents + balance.capturedCents,
    balance.totalDepositedCents,
  );

  const membership = settled.memberships["membership-sony"];
  assert.equal(membership.status, "settled");
  assert.equal(membership.settlement.releasedCents, SONY_MSRP_CENTS - 37_765);
  assert.equal(membership.settlement.evidence, "rain-sandbox");
  assert.equal(settled.pools[SONY_POOL_ID].status, "ordered");
  assert.equal(settled.activity.at(-1).kind, "pool.settled");
  assert.ok(assertProductWorkspaceInvariant(settled));
});

test("a capture larger than the reservation is refused", () => {
  const joined = joinSonyPool(
    createSonyIntent(deposit(syncRailTreasury(createSeededProductWorkspace({ now: T0 })))),
  );

  assert.throws(
    () => settleSony(joined, { capturedCents: SONY_MSRP_CENTS + 1 }),
    (error) => error?.code === "CAPTURE_EXCEEDS_RESERVATION",
  );
  assert.equal(joined.balances[BUYER_ID].reservedCents, SONY_MSRP_CENTS);
  assert.ok(assertProductWorkspaceInvariant(joined));
});

test("a commitment settles once and cannot settle, leave, or release afterwards", () => {
  const settled = settleSony(
    joinSonyPool(
      createSonyIntent(deposit(syncRailTreasury(createSeededProductWorkspace({ now: T0 })))),
    ),
  );

  assert.throws(
    () => settleSony(settled, { activityId: "activity-settle-again" }),
    (error) => error?.code === "MEMBERSHIP_NOT_ACTIVE",
  );
  assert.throws(
    () =>
      reduceProductWorkspace(settled, {
        type: "pool/leave",
        activityId: "activity-leave-after-settle",
        at: T3,
        membershipId: "membership-sony",
        buyerId: BUYER_ID,
      }),
    (error) => error?.code === "MEMBERSHIP_NOT_ACTIVE",
  );
  assert.throws(
    () =>
      releaseSonyAfterOutcome(settled, {
        activityId: "activity-release-after-settle",
        reason: "authorization_declined",
      }),
    (error) => error?.code === "MEMBERSHIP_NOT_ACTIVE",
  );
  assert.ok(assertProductWorkspaceInvariant(settled));
});
