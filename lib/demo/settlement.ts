import { HERO_DEMO } from "../market/index";
import { HERO_FUNDING } from "../funding/index";

export const DEMO_SCENARIO_VERSION = "monitor-pool-v1";
export const BLOCKED_MCC = "7995";

const marketAuthorization = HERO_DEMO.authorization.authorization;
const winningMerchant = HERO_DEMO.merchants.find(
  (merchant) => merchant.id === HERO_DEMO.negotiation.winningOffer.merchantId,
);

export const DEMO_MERCHANT = `${winningMerchant?.displayName ?? "Unknown seller"} (Demo Merchant)`;
export const ELECTRONICS_MCC = marketAuthorization?.merchantCategoryCode ?? "";

export const settlementAllocations = HERO_DEMO.outcome.buyers.map((buyer) => {
  const charge = marketAuthorization?.charges.find(
    (candidate) => candidate.intentId === buyer.intentId,
  );
  return {
    buyerId: charge?.buyerId ?? `invalid:${buyer.intentId}`,
    buyerName: buyer.buyerDisplayName,
    quantity: buyer.quantity,
    unitPriceInCents: HERO_DEMO.outcome.pooledUnitPriceCents,
    amountInCents: buyer.poolTotalCents,
  };
});

export const settlementTotalInCents = settlementAllocations.reduce(
  (total, allocation) => total + allocation.amountInCents,
  0,
);

export type DemoFundingState =
  | "frozen_for_retry"
  | "reconciliation_required"
  | "settled";

export function getDemoFundingState(
  state: DemoFundingState,
  externalSettledInCents = 0,
) {
  const isSettled = state === "settled";
  return {
    simulatedLedger: true as const,
    ledger: "POOL" as const,
    state,
    currency: HERO_FUNDING.currency,
    msrpUnitInCents: HERO_FUNDING.msrpUnitCents,
    dealUnitInCents: HERO_FUNDING.dealUnitCents,
    totalDepositedInCents: HERO_FUNDING.summary.totalDepositedCents,
    totalReservedBeforeInCents: HERO_FUNDING.summary.totalReservedCents,
    totalLockedInCents: isSettled
      ? 0
      : HERO_FUNDING.summary.totalReservedCents,
    totalCapturedInCents: isSettled
      ? HERO_FUNDING.summary.totalCapturedCents
      : 0,
    totalReleasedInCents: isSettled
      ? HERO_FUNDING.summary.totalReleasedCents
      : 0,
    externalSettledInCents,
    buyers: HERO_FUNDING.summary.buyers.map((buyer) => ({
      ...buyer,
      buyerName:
        HERO_FUNDING.buyers.find(
          (candidate) => candidate.buyerId === buyer.buyerId,
        )?.buyerName ?? buyer.buyerId,
      state: isSettled ? ("settled" as const) : state,
      lockedInCents: isSettled ? 0 : buyer.reservedCents,
      capturedInCents: isSettled ? buyer.capturedCents : 0,
      releasedInCents: isSettled ? buyer.releasedCents : 0,
      availableInCents: isSettled ? buyer.availableAfterCents : 0,
    })),
  };
}

/**
 * Fail closed before the external payment rail if the public demo settlement ever
 * drifts from the accepted, fingerprinted market-engine agreement.
 */
export function demoSettlementBoundaryIsValid() {
  const commitmentTransition = HERO_DEMO.fundedCoalition.stateHistory.find(
    (transition) => transition.to === "committed",
  );
  const marketOpenTransition = HERO_DEMO.lifecycle.stateHistory.find(
    (transition) => transition.to === "market_open",
  );
  return Boolean(
    HERO_DEMO.policy.passed &&
      HERO_DEMO.authorization.approved &&
      HERO_DEMO.authorization.code === "READY_FOR_PAYMENT_RAIL" &&
      marketAuthorization &&
      winningMerchant &&
      ELECTRONICS_MCC === "5732" &&
      marketAuthorization.merchantId === HERO_DEMO.negotiation.winningOffer.merchantId &&
      marketAuthorization.totalAmountCents === settlementTotalInCents &&
      HERO_DEMO.negotiation.winningOffer.totalCents === settlementTotalInCents &&
      HERO_DEMO.outcome.pooledTotalCents === settlementTotalInCents &&
      HERO_FUNDING.poolId === HERO_DEMO.coalition.id &&
      HERO_FUNDING.productSku === HERO_DEMO.product.sku &&
      HERO_FUNDING.currency === HERO_DEMO.product.currency &&
      HERO_FUNDING.msrpUnitCents === HERO_DEMO.product.baselineUnitPriceCents &&
      HERO_FUNDING.dealUnitCents === HERO_DEMO.outcome.pooledUnitPriceCents &&
      HERO_FUNDING.summary.totalDepositedCents ===
        HERO_DEMO.outcome.baselineTotalCents &&
      HERO_FUNDING.summary.totalReservedCents ===
        HERO_DEMO.outcome.baselineTotalCents &&
      HERO_FUNDING.summary.totalCapturedCents === settlementTotalInCents &&
      HERO_FUNDING.summary.totalReleasedCents ===
        HERO_DEMO.outcome.totalSavingsCents &&
      HERO_DEMO.fundedCoalition.state === "committed" &&
      commitmentTransition &&
      marketOpenTransition &&
      Date.parse(commitmentTransition.at) < Date.parse(marketOpenTransition.at) &&
      marketAuthorization.charges.length === settlementAllocations.length &&
      HERO_FUNDING.frozenReservations.length === settlementAllocations.length &&
      settlementAllocations.every((allocation) => {
        const charge = marketAuthorization.charges.find(
          (candidate) => candidate.buyerId === allocation.buyerId,
        );
        const reservation = HERO_FUNDING.frozenReservations.find(
          (candidate) => candidate.buyerId === allocation.buyerId,
        );
        return (
          charge?.quantity === allocation.quantity &&
          charge.amountCents === allocation.amountInCents &&
          reservation?.intentId === charge.intentId &&
          reservation.poolId === HERO_DEMO.coalition.id &&
          reservation.productSku === HERO_DEMO.product.sku &&
          reservation.currency === HERO_DEMO.product.currency &&
          reservation.quantity === allocation.quantity &&
          reservation.msrpUnitCents ===
            HERO_DEMO.product.baselineUnitPriceCents &&
          reservation.reservedCents ===
            allocation.quantity * HERO_DEMO.product.baselineUnitPriceCents &&
          reservation.state === "frozen" &&
          reservation.frozenAt &&
          Date.parse(reservation.frozenAt) <= Date.parse(commitmentTransition.at) &&
          allocation.amountInCents <= reservation.reservedCents
        );
      }),
  );
}
