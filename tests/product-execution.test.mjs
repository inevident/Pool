import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeterministicProductCommitment,
  buildSettlementProviderAuthority,
  createCanonicalProductWorkspace,
  createSeededProductWorkspace,
  deriveSettlementOperationId,
  deterministicScopedCardExpiry,
  evaluateProductExecutionWindow,
  evaluateProductPoolFunding,
  poolMembershipEnvelopeSchema,
  PRODUCT_POOL_BID_WINDOW_MS,
  productExecutionSchedule,
  evaluateProductSettlementConstraints,
  validateProductExecutionIntent,
  resolveMissedExecutionWindow,
  validateProductExecutionMembership,
} from "../lib/product/index.ts";

const catalog = createSeededProductWorkspace();
const pool = catalog.pools["pool-sony-xm6-august"];
const product = catalog.products[pool.productId];
const membership = Object.freeze({
  id: "membership-sony-demo",
  poolId: pool.id,
  intentId: "intent-sony-demo",
  buyerId: catalog.owner.id,
  quantity: 2,
  reservedCents: product.msrpUnitCents * 2,
  status: "active",
  joinedAt: "2026-08-10T16:00:00.000Z",
});

const validate = (overrides = {}, poolId = pool.id) =>
  validateProductExecutionMembership({
    workspace: catalog,
    poolId,
    membership: { ...membership, ...overrides },
  });

test("execution schemas require the complete strict membership envelope", () => {
  assert.equal(poolMembershipEnvelopeSchema.safeParse(membership).success, true);
  const missingIntent = {
    id: membership.id,
    poolId: membership.poolId,
    buyerId: membership.buyerId,
    quantity: membership.quantity,
    reservedCents: membership.reservedCents,
    status: membership.status,
    joinedAt: membership.joinedAt,
  };
  assert.equal(poolMembershipEnvelopeSchema.safeParse(missingIntent).success, false);
  assert.equal(
    poolMembershipEnvelopeSchema.safeParse({ ...membership, captureCents: 1 }).success,
    false,
  );
});

test("membership validation rebuilds server economics and rejects each mismatch", () => {
  const execution = validate();
  assert.equal(execution.buyerReservedCents, product.msrpUnitCents * 2);
  assert.equal(execution.aggregateUnits, pool.committedUnitCount + 2);
  assert.equal(
    execution.aggregateReservedCents,
    product.msrpUnitCents * execution.aggregateUnits,
  );

  const cases = [
    [{ poolId: "pool-steam-deck-oled-august" }, "membership_pool_mismatch"],
    [{ buyerId: "buyer-attacker" }, "membership_buyer_mismatch"],
    [{ status: "settled" }, "membership_not_active"],
    [{ status: "released" }, "membership_not_active"],
    [{ reservedCents: membership.reservedCents - 1 }, "membership_reservation_mismatch"],
    [{ joinedAt: pool.cutoffAt }, "membership_joined_after_cutoff"],
  ];
  for (const [override, expectedCode] of cases) {
    assert.throws(() => validate(override), (error) => error?.code === expectedCode);
  }
  assert.throws(
    () => validate({}, "missing-pool"),
    (error) => error?.code === "pool_not_found",
  );
});

test("cutoff and bid close are deterministic, exact boundaries", () => {
  const cutoff = Date.parse(pool.cutoffAt);
  const before = evaluateProductExecutionWindow(pool, cutoff - 1);
  assert.equal(before.status, "waiting_for_cutoff");
  assert.equal(before.code, "waiting_for_cutoff");
  assert.equal(before.remainingMs, 1);

  const exactCutoff = evaluateProductExecutionWindow(pool, cutoff);
  assert.equal(exactCutoff.status, "open");
  assert.equal(exactCutoff.remainingMs, PRODUCT_POOL_BID_WINDOW_MS);
  assert.equal(
    exactCutoff.bidClosesAt,
    new Date(cutoff + PRODUCT_POOL_BID_WINDOW_MS).toISOString(),
  );

  assert.equal(
    evaluateProductExecutionWindow(
      pool,
      cutoff + PRODUCT_POOL_BID_WINDOW_MS - 1,
    ).status,
    "open",
  );
  const exactClose = evaluateProductExecutionWindow(
    pool,
    cutoff + PRODUCT_POOL_BID_WINDOW_MS,
  );
  assert.equal(exactClose.status, "closed");
  assert.equal(exactClose.code, "bid_window_closed");
});

test("browser and API catalogs share the exact canonical execution schedule", () => {
  const browserCatalog = createCanonicalProductWorkspace();
  const apiCatalog = createCanonicalProductWorkspace();

  assert.equal(browserCatalog.createdAt, apiCatalog.createdAt);
  for (const poolId of Object.keys(browserCatalog.pools)) {
    const browserPool = browserCatalog.pools[poolId];
    const apiPool = apiCatalog.pools[poolId];
    assert.deepEqual(
      productExecutionSchedule(browserPool),
      productExecutionSchedule(apiPool),
    );

    const schedule = productExecutionSchedule(apiPool);
    const eligibleAt = Date.parse(schedule.cutoffAt) + 30 * 60 * 1_000;
    assert.equal(
      evaluateProductExecutionWindow(browserPool, eligibleAt).status,
      "open",
    );
    assert.equal(
      evaluateProductExecutionWindow(apiPool, eligibleAt).status,
      "open",
    );
    assert.equal(
      evaluateProductExecutionWindow(
        browserPool,
        Date.parse(schedule.bidClosesAt),
      ).status,
      "closed",
    );
  }
});

test("a fully funded membership is executable inside the canonical server window", () => {
  const execution = validate();
  const funding = evaluateProductPoolFunding({
    pool: execution.pool,
    aggregateFundedUnitCount: execution.aggregateUnits,
  });
  const schedule = productExecutionSchedule(execution.pool);
  const serverWindow = evaluateProductExecutionWindow(
    execution.pool,
    Date.parse(schedule.cutoffAt) + 1,
  );
  const commitment = buildDeterministicProductCommitment(execution);

  assert.equal(funding.hasMetMinimum, true);
  assert.equal(serverWindow.status, "open");
  assert.equal(serverWindow.bidClosesAt, schedule.bidClosesAt);
  assert.equal(
    commitment.bidClosesAt,
    BigInt(Math.floor(Date.parse(schedule.bidClosesAt) / 1_000)),
  );
});

test("missed product rehearsal windows are always safe to release", () => {
  const execution = validate();
  const safe = resolveMissedExecutionWindow(execution);
  assert.deepEqual(
    {
      status: safe.status,
      code: safe.code,
      reservationState: safe.reservationState,
      releaseReason: safe.releaseReason,
      providerOperationState: safe.providerOperationState,
      operationId: safe.operationId,
      reservedCents: safe.reservedCents,
    },
    {
      status: "execution_window_missed",
      code: "bid_window_closed",
      reservationState: "release_available",
      releaseReason: "execution_window_missed",
      providerOperationState: "impossible_by_design",
      operationId: deriveSettlementOperationId(execution),
      reservedCents: execution.buyerReservedCents,
    },
  );

  assert.equal(
    safe.resolutionBasis,
    "product_rehearsal_only",
  );
});

test("commitment freezes at cutoff and binds the actual buyer and intent", () => {
  const execution = validate();
  const first = buildDeterministicProductCommitment(execution);
  const retry = buildDeterministicProductCommitment(validate());
  assert.deepEqual(first, retry);
  assert.equal(first.frozenAt, pool.cutoffAt);
  assert.equal(
    first.bidClosesAt,
    BigInt(Math.floor((Date.parse(pool.cutoffAt) + PRODUCT_POOL_BID_WINDOW_MS) / 1_000)),
  );
  assert.equal(first.unitCount, execution.aggregateUnits);
  assert.equal(first.reservedCents, BigInt(execution.aggregateReservedCents));

  const differentIntent = buildDeterministicProductCommitment(
    validate({ intentId: "intent-sony-different" }),
  );
  assert.notEqual(first.fundingRoot, differentIntent.fundingRoot);
  assert.equal(first.termsHash, differentIntent.termsHash);
});

test("provider operation ids and every retry key/payload are deterministic", () => {
  const execution = validate();
  const operationId = deriveSettlementOperationId(execution);
  assert.match(
    operationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(operationId, deriveSettlementOperationId(validate()));
  assert.equal(
    operationId,
    deriveSettlementOperationId(
      validate({
        id: "membership-sony-other",
        intentId: "intent-sony-other",
        joinedAt: "2026-08-11T16:00:00.000Z",
      }),
    ),
  );

  const input = {
    capturedCents: 75_530,
    allowedMcc: "5732",
    blockedMcc: "7995",
    merchantName: "Signal Supply Co.",
  };
  const first = buildSettlementProviderAuthority(execution, input);
  const retry = buildSettlementProviderAuthority(validate(), input);
  assert.deepEqual(first, retry);
  assert.equal(first.operationId, operationId);
  assert.equal(first.card.expiresAt, deterministicScopedCardExpiry(pool));
  assert.equal(first.card.amountInUSDCents, input.capturedCents);
  assert.deepEqual(first.card.allowedMccs, [input.allowedMcc]);
  for (const key of [
    first.card.idempotencyKey,
    first.blockedProbe.idempotencyKey,
    first.authorization.idempotencyKey,
    first.settlementIdempotencyKey,
    first.unsafeProbeReversalIdempotencyKey,
    first.compensationIdempotencyKey,
  ]) {
    assert.match(key, new RegExp(operationId));
  }
  assert.deepEqual(
    first,
    buildSettlementProviderAuthority(
      validate({
        id: "membership-sony-other",
        intentId: "intent-sony-other",
        joinedAt: "2026-08-11T16:00:00.000Z",
      }),
      input,
    ),
  );
  assert.notEqual(
    operationId,
    deriveSettlementOperationId(
      validate({
        quantity: 1,
        reservedCents: product.msrpUnitCents,
      }),
    ),
  );
  assert.notEqual(
    first.card.idempotencyKey,
    buildSettlementProviderAuthority(execution, {
      ...input,
      capturedCents: input.capturedCents - 1,
    }).card.idempotencyKey,
  );
  for (const key of [
    first.card.idempotencyKey,
    first.blockedProbe.idempotencyKey,
    first.authorization.idempotencyKey,
    first.settlementIdempotencyKey,
    first.unsafeProbeReversalIdempotencyKey,
    first.compensationIdempotencyKey,
  ]) {
    assert.ok(key.length <= 64, `${key} exceeds Rain's 64-character limit`);
  }
});

test("saved mandate constraints bind price and promised delivery", () => {
  const execution = validate();
  const constraints = validateProductExecutionIntent({
    execution,
    intent: {
      id: membership.intentId,
      buyerId: membership.buyerId,
      productId: product.id,
      quantity: membership.quantity,
      targetUnitPriceCents: pool.estimatedUnitPriceCents,
      createdAt: "2026-08-10T15:00:00.000Z",
      expiresAt: "2026-09-01T16:00:00.000Z",
      status: "joined",
    },
  });
  assert.equal(constraints.maxUnitPriceCents, pool.estimatedUnitPriceCents);

  assert.equal(
    evaluateProductSettlementConstraints({
      pool,
      constraints,
      unitPriceCents: pool.estimatedUnitPriceCents,
      deliveryDays: 5,
    }).accepted,
    true,
  );
  assert.equal(
    evaluateProductSettlementConstraints({
      pool,
      constraints,
      unitPriceCents: pool.estimatedUnitPriceCents + 1,
      deliveryDays: 5,
    }).code,
    "buyer_price_limit_exceeded",
  );
  assert.equal(
    evaluateProductSettlementConstraints({
      pool,
      constraints: { ...constraints, deliverBy: "2026-08-23T16:00:00.000Z" },
      unitPriceCents: pool.estimatedUnitPriceCents,
      deliveryDays: 5,
    }).code,
    "buyer_deadline_exceeded",
  );
});
