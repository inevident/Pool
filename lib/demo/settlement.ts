import { HERO_DEMO } from "../market/index";

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

/**
 * Fail closed before the external payment rail if the public demo settlement ever
 * drifts from the accepted, fingerprinted market-engine agreement.
 */
export function demoSettlementBoundaryIsValid() {
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
      marketAuthorization.charges.length === settlementAllocations.length &&
      settlementAllocations.every((allocation) => {
        const charge = marketAuthorization.charges.find(
          (candidate) => candidate.buyerId === allocation.buyerId,
        );
        return (
          charge?.quantity === allocation.quantity &&
          charge.amountCents === allocation.amountInCents
        );
      }),
  );
}
