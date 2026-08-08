import test from "node:test";
import assert from "node:assert/strict";

import {
  HERO_DEMO,
  HERO_INTENTS,
  HERO_MERCHANTS,
  HERO_PAYMENT_RAIL_CAP_CENTS,
  HERO_PRODUCTS,
  RAIN_SANDBOX_ROLLING_CAP_CENTS,
  allocateOfferAcrossIntents,
  assessProductCompatibility,
  createSettlementLedger,
  formatMoney,
  processSettlement,
  runNegotiation,
  transitionPoolState,
  validateMerchantEconomics,
} from "../lib/market/index.ts";

test("hero market pools three independent buyers into a 12-unit order", () => {
  assert.equal(HERO_DEMO.discovery.matched, true);
  assert.equal(HERO_DEMO.coalition.totalQuantity, 12);
  assert.deepEqual(
    HERO_DEMO.intents.map((intent) => intent.demand.quantity),
    [3, 4, 5],
  );
  assert.equal(HERO_DEMO.discovery.selectedProduct?.sku, HERO_DEMO.product.sku);
  assert.deepEqual(HERO_DEMO.coalition.memberIntentIds, [
    "intent-harbor",
    "intent-kernel",
    "intent-patchwork",
  ]);
});

test("semantic compatibility includes varied hard requirements and excludes the ultrawide intent", () => {
  for (const intent of HERO_INTENTS) {
    assert.equal(assessProductCompatibility(HERO_DEMO.product, intent).compatible, true);
  }
  const incompatible = assessProductCompatibility(
    HERO_DEMO.product,
    HERO_DEMO.incompatibleIntent,
  );
  assert.equal(incompatible.compatible, false);
  assert.ok(incompatible.reasons.some((reason) => reason.code === "FORM_FACTOR_MISMATCH"));
  assert.ok(HERO_DEMO.discovery.excluded.some((item) => item.intentId === "intent-studio-arc"));
});

test("public intent projections never carry private reservation values", () => {
  const projected = HERO_DEMO.publicIntents[0];
  assert.equal("privateMandate" in projected, false);
  assert.equal(projected.mandate.visibility, "private");
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("maxUnitPriceCents"), false);
  assert.equal(serialized.includes("targetUnitPriceCents"), false);
});

test("merchant economics are coherent and quantity-tier competition reaches $389", () => {
  for (const merchant of HERO_MERCHANTS) {
    assert.deepEqual(validateMerchantEconomics(merchant), []);
  }
  assert.deepEqual(
    HERO_DEMO.negotiation.initialOffers.map((offer) => offer.unitPriceCents),
    [40_500, 40_700, 40_100],
  );
  assert.deepEqual(
    HERO_DEMO.negotiation.finalOffers.map((offer) => offer.unitPriceCents),
    [39_500, 39_700, 38_900],
  );
  assert.equal(HERO_DEMO.negotiation.winningOffer.merchantId, "merchant-signal");
  assert.equal(HERO_DEMO.negotiation.winningOffer.unitPriceCents, 38_900);

  for (const offer of HERO_DEMO.negotiation.finalOffers) {
    const merchant = HERO_MERCHANTS.find((candidate) => candidate.id === offer.merchantId);
    const item = merchant.inventory.find((candidate) => candidate.productSku === offer.productSku);
    assert.ok(offer.unitPriceCents >= item.pricing.floorUnitPriceCents);
  }
});

test("seller agents cannot see or negotiate against demand before funded commitment", () => {
  assert.equal(HERO_DEMO.fundedCoalition.state, "committed");
  assert.throws(
    () =>
      runNegotiation({
        coalition: HERO_DEMO.coalition,
        product: HERO_DEMO.product,
        merchants: HERO_MERCHANTS,
        startedAt: "2026-08-08T17:00:10.000Z",
      }),
    (error) => error?.code === "MARKET_NOT_OPEN",
  );
});

test("the final offer passes every private mandate and fits the Rain sandbox cap", () => {
  assert.equal(HERO_DEMO.policy.passed, true);
  assert.equal(HERO_DEMO.policy.buyerResults.length, 3);
  assert.ok(HERO_DEMO.policy.buyerResults.every((buyer) => buyer.passed));
  assert.equal(HERO_DEMO.outcome.pooledTotalCents, 466_800);
  assert.equal(HERO_DEMO.outcome.underPaymentRailCap, true);
  assert.equal(HERO_PAYMENT_RAIL_CAP_CENTS, RAIN_SANDBOX_ROLLING_CAP_CENTS);
  assert.ok(HERO_DEMO.outcome.pooledTotalCents < RAIN_SANDBOX_ROLLING_CAP_CENTS);
});

test("outcome metrics reconcile to $1,080 of real coalition savings", () => {
  assert.equal(HERO_DEMO.outcome.baselineUnitPriceCents, 47_900);
  assert.equal(HERO_DEMO.outcome.pooledUnitPriceCents, 38_900);
  assert.equal(HERO_DEMO.outcome.baselineTotalCents, 574_800);
  assert.equal(HERO_DEMO.outcome.pooledTotalCents, 466_800);
  assert.equal(HERO_DEMO.outcome.totalSavingsCents, 108_000);
  assert.equal(
    HERO_DEMO.outcome.buyers.reduce((total, buyer) => total + buyer.savingsCents, 0),
    HERO_DEMO.outcome.totalSavingsCents,
  );
  assert.equal(formatMoney(HERO_DEMO.outcome.pooledTotalCents), "$4,668");
});

test("an over-budget merchant revision is blocked without exposing buyer ceilings", () => {
  const policy = HERO_DEMO.safety.overBudgetPolicy;
  assert.equal(policy.passed, false);
  assert.ok(
    policy.buyerResults.some((buyer) =>
      buyer.checks.some((check) => check.code === "UNIT_PRICE_LIMIT" && !check.passed),
    ),
  );
  assert.ok(
    policy.globalChecks.some((check) => check.code === "PAYMENT_RAIL_LIMIT" && !check.passed),
  );
  assert.equal(policy.deniedReasons.join(" ").includes("$"), false);
});

test("accepted terms cannot be tampered with and stale offers cannot settle", () => {
  assert.equal(HERO_DEMO.safety.tamperedDecision.approved, false);
  assert.equal(HERO_DEMO.safety.tamperedDecision.code, "TERMS_TAMPERED");
  assert.equal(HERO_DEMO.safety.staleDecision.approved, false);
  assert.equal(HERO_DEMO.safety.staleDecision.code, "STALE_OFFER");
});

test("settlement authorization is idempotent across retries and conflicts", () => {
  const request = {
    idempotencyKey: "test:settlement:once",
    agreement: HERO_DEMO.agreement,
    offer: HERO_DEMO.negotiation.winningOffer,
    coalition: HERO_DEMO.coalition,
    intents: HERO_INTENTS,
    products: HERO_PRODUCTS,
    merchants: HERO_MERCHANTS,
    now: "2026-08-08T17:13:00.000Z",
    expectedOfferId: HERO_DEMO.negotiation.winningOffer.id,
    paymentRailCapCents: HERO_PAYMENT_RAIL_CAP_CENTS,
  };
  const first = processSettlement(request, createSettlementLedger());
  const replay = processSettlement(request, first.ledger);
  assert.equal(first.decision.code, "READY_FOR_PAYMENT_RAIL");
  assert.equal(first.decision.replayed, false);
  assert.equal(replay.decision.code, "READY_FOR_PAYMENT_RAIL");
  assert.equal(replay.decision.replayed, true);
  assert.equal(
    replay.decision.authorization?.authorizationId,
    first.decision.authorization?.authorizationId,
  );

  const conflict = processSettlement(
    { ...request, offer: HERO_DEMO.safety.tamperedOffer },
    first.ledger,
  );
  assert.equal(conflict.decision.code, "IDEMPOTENCY_CONFLICT");

  const duplicateAgreement = processSettlement(
    { ...request, idempotencyKey: "test:settlement:different-key" },
    first.ledger,
  );
  assert.equal(duplicateAgreement.decision.code, "ALREADY_AUTHORIZED");
});

test("buyer allocations reconcile exactly and illegal lifecycle jumps fail closed", () => {
  const allocations = allocateOfferAcrossIntents(
    HERO_DEMO.negotiation.winningOffer,
    HERO_DEMO.coalition,
    HERO_INTENTS,
  );
  assert.equal(
    allocations.reduce((total, allocation) => total + allocation.totalCents, 0),
    HERO_DEMO.negotiation.winningOffer.totalCents,
  );
  assert.throws(
    () =>
      transitionPoolState(
        HERO_DEMO.coalition,
        "settled",
        "2026-08-08T17:15:00.000Z",
        "skip authorization",
      ),
    (error) => error?.code === "INVALID_STATE_TRANSITION",
  );
  assert.equal(HERO_DEMO.lifecycle.state, "dissolved");
  assert.deepEqual(
    HERO_DEMO.lifecycle.stateHistory.map((transition) => transition.to),
    ["matched", "committed", "market_open", "negotiating", "policy_review", "authorized", "settling", "settled", "dissolved"],
  );
});
