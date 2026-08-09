/**
 * Deterministic consumer market for the seeded product catalog.
 *
 * This is the bridge between the buyer workspace and settlement: it turns a
 * frozen product pool into an anonymized aggregate order, runs the same three
 * fictional merchants against it, and clears at a price no merchant's private
 * floor forbids.
 *
 * Everything here is pure. Same inputs always produce the same offers, so a
 * server can re-derive a clearing price without trusting the browser, and a
 * judge can replay it. Merchant floors and opening quotes are private inputs:
 * they must never appear in an API response or a UI trace.
 */

export const ELECTRONICS_MCC = "5732";
export const APPLIANCE_MCC = "5722";
/** Deliberately off-policy. Used only to prove Rain enforces the allowlist. */
export const BLOCKED_MCC = "7995";

export type ConsumerMerchantId =
  | "merchant-keystone"
  | "merchant-northstar"
  | "merchant-signal";

export interface ConsumerMerchantIdentity {
  readonly id: ConsumerMerchantId;
  readonly name: string;
  readonly deliveryDays: number;
  readonly warrantyMonths: number;
}

/** Private per-product economics. Never serialize this to a client. */
interface ConsumerMerchantEconomics {
  readonly openingUnitCents: number;
  readonly floorUnitCents: number;
}

export const CONSUMER_MERCHANTS: readonly ConsumerMerchantIdentity[] = [
  {
    id: "merchant-keystone",
    name: "Keystone Retail Group",
    deliveryDays: 5,
    warrantyMonths: 24,
  },
  {
    id: "merchant-northstar",
    name: "Northstar Direct",
    deliveryDays: 9,
    warrantyMonths: 30,
  },
  {
    id: "merchant-signal",
    name: "Signal Supply Co.",
    deliveryDays: 7,
    warrantyMonths: 36,
  },
];

/** Earliest modeled fulfillment promise, used to reject impossible mandates. */
export function minimumConsumerDeliveryDays() {
  return Math.min(
    ...CONSUMER_MERCHANTS.map((merchant) => merchant.deliveryDays),
  );
}

/**
 * Volume tiers. A merchant's willingness to discount is a step function of the
 * whole coalition's funded quantity — this is the entire economic reason POOL
 * exists, so it stays explicit rather than buried in a formula.
 */
const VOLUME_TIERS: readonly { readonly minUnits: number; readonly discountBps: number }[] = [
  { minUnits: 100, discountBps: 1_600 },
  { minUnits: 50, discountBps: 1_300 },
  { minUnits: 25, discountBps: 900 },
  { minUnits: 10, discountBps: 400 },
  { minUnits: 0, discountBps: 0 },
];

export function volumeDiscountBps(units: number) {
  return VOLUME_TIERS.find((tier) => units >= tier.minUnits)?.discountBps ?? 0;
}

const ECONOMICS: Readonly<
  Record<string, Readonly<Record<ConsumerMerchantId, ConsumerMerchantEconomics>>>
> = {
  "product-sony-wh1000xm6": {
    "merchant-keystone": { openingUnitCents: 41_999, floorUnitCents: 38_500 },
    "merchant-northstar": { openingUnitCents: 42_499, floorUnitCents: 37_500 },
    "merchant-signal": { openingUnitCents: 41_500, floorUnitCents: 36_900 },
  },
  "product-steam-deck-oled-512": {
    "merchant-keystone": { openingUnitCents: 52_900, floorUnitCents: 48_500 },
    "merchant-northstar": { openingUnitCents: 52_400, floorUnitCents: 47_900 },
    "merchant-signal": { openingUnitCents: 51_900, floorUnitCents: 47_500 },
  },
  "product-macbook-air-m4-13": {
    "merchant-keystone": { openingUnitCents: 96_900, floorUnitCents: 90_000 },
    "merchant-northstar": { openingUnitCents: 95_900, floorUnitCents: 88_500 },
    "merchant-signal": { openingUnitCents: 96_500, floorUnitCents: 87_900 },
  },
  "product-dyson-airwrap-id": {
    "merchant-keystone": { openingUnitCents: 56_999, floorUnitCents: 52_000 },
    "merchant-northstar": { openingUnitCents: 57_499, floorUnitCents: 51_500 },
    "merchant-signal": { openingUnitCents: 56_499, floorUnitCents: 51_900 },
  },
  "product-monitor-27-4k-usbc": {
    // At the 10+ unit tier these produce the same $401 / $429 / $389
    // reference-market prices shown by the fixed technical fixture.
    "merchant-keystone": { openingUnitCents: 41_771, floorUnitCents: 39_500 },
    "merchant-northstar": { openingUnitCents: 44_688, floorUnitCents: 42_000 },
    "merchant-signal": { openingUnitCents: 40_521, floorUnitCents: 37_900 },
  },
};

export function merchantCategoryCodeFor(category: string) {
  return category === "home" ? APPLIANCE_MCC : ELECTRONICS_MCC;
}

export interface ConsumerOffer {
  readonly merchantId: ConsumerMerchantId;
  readonly merchantName: string;
  readonly unitPriceCents: number;
  readonly deliveryDays: number;
  readonly warrantyMonths: number;
  /** True when the merchant's private floor stopped it discounting further. */
  readonly atFloor: boolean;
  readonly meetsTarget: boolean;
}

/**
 * Every merchant's best deterministic quote at this coalition size.
 *
 * A merchant discounts its opening quote by the volume tier, then refuses to go
 * below its private floor. The floor is what makes competition real: merchants
 * genuinely run out of room at different points.
 */
export function collectConsumerOffers(input: {
  readonly productId: string;
  readonly aggregateUnits: number;
  readonly targetUnitPriceCents: number;
}): readonly ConsumerOffer[] {
  const economics = ECONOMICS[input.productId];
  if (!economics) return [];
  const discountBps = volumeDiscountBps(input.aggregateUnits);

  return CONSUMER_MERCHANTS.map((merchant) => {
    const priv = economics[merchant.id];
    const discounted = Math.round(
      (priv.openingUnitCents * (10_000 - discountBps)) / 10_000,
    );
    const unitPriceCents = Math.max(priv.floorUnitCents, discounted);
    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      unitPriceCents,
      deliveryDays: merchant.deliveryDays,
      warrantyMonths: merchant.warrantyMonths,
      atFloor: unitPriceCents === priv.floorUnitCents,
      meetsTarget: unitPriceCents <= input.targetUnitPriceCents,
    };
  });
}

export const CONSUMER_POLICY = {
  maxDeliveryDays: 30,
  minWarrantyMonths: 12,
} as const;

export type ConsumerClearingCode = "cleared" | "no_acceptable_offer";

export interface ConsumerClearing {
  readonly code: ConsumerClearingCode;
  readonly aggregateUnits: number;
  readonly discountBps: number;
  readonly offers: readonly ConsumerOffer[];
  readonly winner?: ConsumerOffer;
  /**
   * Additional funded units needed before any merchant can beat the published
   * target, or null when the pool already clears or can never clear.
   */
  readonly unitsToClear: number | null;
}

/**
 * Deterministic award.
 *
 * An offer is only eligible if it beats the pool's published target and
 * satisfies the delivery and warranty rules. The cheapest eligible offer wins;
 * ties break on faster delivery, then merchant id, so the outcome never depends
 * on iteration order or a clock.
 */
export function clearConsumerMarket(input: {
  readonly productId: string;
  readonly aggregateUnits: number;
  readonly targetUnitPriceCents: number;
}): ConsumerClearing {
  const offers = collectConsumerOffers(input);
  const discountBps = volumeDiscountBps(input.aggregateUnits);

  const eligible = offers.filter(
    (offer) =>
      offer.meetsTarget &&
      offer.deliveryDays <= CONSUMER_POLICY.maxDeliveryDays &&
      offer.warrantyMonths >= CONSUMER_POLICY.minWarrantyMonths,
  );

  const winner = [...eligible].sort(
    (a, b) =>
      a.unitPriceCents - b.unitPriceCents ||
      a.deliveryDays - b.deliveryDays ||
      a.merchantId.localeCompare(b.merchantId),
  )[0];

  if (winner) {
    return {
      code: "cleared",
      aggregateUnits: input.aggregateUnits,
      discountBps,
      offers,
      winner,
      unitsToClear: null,
    };
  }

  return {
    code: "no_acceptable_offer",
    aggregateUnits: input.aggregateUnits,
    discountBps,
    offers,
    unitsToClear: unitsRequiredToClear(input),
  };
}

/**
 * Smallest coalition size at which some merchant can beat the target.
 *
 * Returns null when even the deepest tier leaves every merchant above target —
 * the pool's published estimate is simply unreachable and the product should say
 * so rather than implying more demand would help.
 */
function unitsRequiredToClear(input: {
  readonly productId: string;
  readonly targetUnitPriceCents: number;
}): number | null {
  const thresholds = [...VOLUME_TIERS]
    .map((tier) => tier.minUnits)
    .sort((a, b) => a - b);

  for (const units of thresholds) {
    const cleared = collectConsumerOffers({
      productId: input.productId,
      aggregateUnits: units,
      targetUnitPriceCents: input.targetUnitPriceCents,
    }).some(
      (offer) =>
        offer.meetsTarget &&
        offer.deliveryDays <= CONSUMER_POLICY.maxDeliveryDays &&
        offer.warrantyMonths >= CONSUMER_POLICY.minWarrantyMonths,
    );
    if (cleared) return units;
  }
  return null;
}

/**
 * Public projection of an offer.
 *
 * Merchant floors and opening quotes are stripped: a buyer or a competing seller
 * may learn the quoted price and terms, never the private economics behind them.
 */
export function publicOffer(offer: ConsumerOffer) {
  return {
    merchantId: offer.merchantId,
    merchantName: offer.merchantName,
    unitPriceCents: offer.unitPriceCents,
    deliveryDays: offer.deliveryDays,
    warrantyMonths: offer.warrantyMonths,
  };
}
