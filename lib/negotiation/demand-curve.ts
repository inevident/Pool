/**
 * Demand-curve reverse negotiation.
 *
 * This is the mechanism a buyer sees as "AI agents take our demand to the
 * merchants." Buyers do not name a single price — they pledge along a curve:
 * "I'd buy at 10% off", "I'd buy at 20% off", "I'd buy at 30% off". Each pledge
 * is the *highest* price that buyer will accept.
 *
 * When the commitment window closes, POOL's agent walks that curve down. At each
 * price level it can credibly promise a merchant the exact volume that unlocks —
 * every buyer whose ceiling is at or above that price. Deeper price levels
 * promise more units, and more units unlock deeper merchant discounts. The agent
 * keeps the level that produces the lowest price a merchant will actually honor,
 * and then *every* activated buyer pays that single clearing price — including
 * the buyers who would happily have paid much more.
 *
 * Everything here is pure and deterministic. The same pledges and the same
 * merchant roster always clear at the same price, so a server can re-derive the
 * outcome without trusting the browser and a reviewer can replay it. Merchant
 * floors and maximum discounts are private seller economics: they are used to
 * compute a quote and are never returned in a public projection.
 */

export type Cents = number;

/** Basis points. 10_000 bps = 100%. A 1_000 bps pledge is "10% off". */
export type BasisPoints = number;

/**
 * One rung of the demand curve.
 *
 * `discountBps` is how far below MSRP this group of buyers is willing to go, and
 * therefore fixes their private ceiling. `buyerCount` is how many buyers pledged
 * at exactly that ceiling.
 */
export interface DemandPledge {
  readonly discountBps: BasisPoints;
  readonly buyerCount: number;
  /** Units each of these buyers commits to. Defaults to 1. */
  readonly unitsPerBuyer?: number;
}

export interface DemandCurveInput {
  readonly productLabel: string;
  readonly msrpUnitCents: Cents;
  readonly pledges: readonly DemandPledge[];
}

/**
 * A merchant's private negotiating economics. Never serialize this to a client.
 *
 * A merchant discounts along the shared volume schedule but caps at its own
 * `maxDiscountBps`. That cap is the only thing that differentiates merchants:
 * some are simply willing to go deeper for a large enough guaranteed order.
 */
export interface NegotiationMerchant {
  readonly id: string;
  readonly name: string;
  readonly deliveryDays: number;
  readonly warrantyMonths: number;
  readonly maxDiscountBps: BasisPoints;
}

/** Public projection of a merchant quote — safe to return over the wire. */
export interface PublicQuote {
  readonly merchantId: string;
  readonly merchantName: string;
  readonly unitPriceCents: Cents;
  readonly deliveryDays: number;
  readonly warrantyMonths: number;
  readonly discountBps: BasisPoints;
}

export interface DemandCurvePoint {
  readonly discountBps: BasisPoints;
  readonly thresholdUnitPriceCents: Cents;
  /** Buyers who pledged at exactly this rung. */
  readonly buyerCount: number;
  /** Buyers who would buy at or below this rung's price (ceiling ≥ threshold). */
  readonly cumulativeBuyers: number;
  readonly cumulativeUnits: number;
}

export interface NegotiationRound {
  readonly sequence: number;
  readonly consideredDiscountBps: BasisPoints;
  readonly thresholdUnitPriceCents: Cents;
  readonly committedBuyers: number;
  readonly committedUnits: number;
  readonly quotes: readonly PublicQuote[];
  readonly bestUnitPriceCents: Cents;
  readonly bestMerchantId: string;
  /** True when the best quote is one the buyers at this rung would accept. */
  readonly accepted: boolean;
  readonly note: string;
}

export interface DemandTierOutcome {
  readonly discountBps: BasisPoints;
  readonly thresholdUnitPriceCents: Cents;
  readonly buyerCount: number;
  readonly included: boolean;
  readonly paidUnitPriceCents: Cents | null;
  /** How much less each buyer pays than the ceiling they pledged. */
  readonly surplusPerBuyerCents: Cents;
  readonly surplusTotalCents: Cents;
}

export interface DemandShortfall {
  /** The deepest price a merchant would honor at the largest promised volume. */
  readonly bestAchievableUnitPriceCents: Cents;
  /** The most any buyer was willing to pay. */
  readonly highestPledgeUnitPriceCents: Cents;
  readonly gapCents: Cents;
}

export type ClearingCode = "cleared" | "no_acceptable_offer";

export interface DemandClearing {
  readonly code: ClearingCode;
  readonly productLabel: string;
  readonly msrpUnitCents: Cents;
  readonly curve: readonly DemandCurvePoint[];
  readonly rounds: readonly NegotiationRound[];
  readonly clearingUnitPriceCents: Cents | null;
  readonly clearingDiscountBps: BasisPoints | null;
  readonly winner: PublicQuote | null;
  readonly activatedBuyers: number;
  readonly activatedUnits: number;
  readonly clearingTotalCents: Cents;
  readonly msrpTotalCents: Cents;
  readonly totalSavingsCents: Cents;
  readonly tierOutcomes: readonly DemandTierOutcome[];
  readonly shortfall: DemandShortfall | null;
}

export class DemandCurveError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DemandCurveError";
    this.code = code;
  }
}

const MAX_DISCOUNT_BPS = 9_000;
const MAX_BUYERS_PER_TIER = 1_000_000;
const MAX_UNITS_PER_BUYER = 50;

const assertSafeInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value)) {
    throw new DemandCurveError("INVALID_INTEGER", `${label} must be a safe integer.`);
  }
};

/**
 * Volume → discount schedule shared by every merchant.
 *
 * A merchant's willingness to discount is a step function of the whole pool's
 * committed quantity. This is the entire economic reason POOL exists, so it
 * stays an explicit table rather than a hidden formula. It scales from a handful
 * of units up to the hundreds a real crowd produces.
 */
const VOLUME_TIERS: readonly { readonly minUnits: number; readonly discountBps: BasisPoints }[] = [
  { minUnits: 500, discountBps: 3_000 },
  { minUnits: 400, discountBps: 2_600 },
  { minUnits: 300, discountBps: 2_200 },
  { minUnits: 200, discountBps: 1_800 },
  { minUnits: 120, discountBps: 1_500 },
  { minUnits: 60, discountBps: 1_200 },
  { minUnits: 25, discountBps: 900 },
  { minUnits: 10, discountBps: 500 },
  { minUnits: 1, discountBps: 250 },
  { minUnits: 0, discountBps: 0 },
];

export function volumeDiscountBps(units: number): BasisPoints {
  return VOLUME_TIERS.find((tier) => units >= tier.minUnits)?.discountBps ?? 0;
}

/**
 * The default merchant roster for the reverse market.
 *
 * The only public difference is delivery and warranty; the negotiating depth
 * (`maxDiscountBps`) is private and is what makes the competition real — sellers
 * genuinely run out of room at different volumes.
 */
export const NEGOTIATION_MERCHANTS: readonly NegotiationMerchant[] = [
  { id: "merchant-atlas", name: "Atlas Retail Group", deliveryDays: 4, warrantyMonths: 24, maxDiscountBps: 2_600 },
  { id: "merchant-meridian", name: "Meridian Direct", deliveryDays: 7, warrantyMonths: 30, maxDiscountBps: 2_800 },
  { id: "merchant-vertex", name: "Vertex Supply Co.", deliveryDays: 6, warrantyMonths: 36, maxDiscountBps: 3_000 },
];

const thresholdFor = (msrpUnitCents: Cents, discountBps: BasisPoints): Cents =>
  Math.round((msrpUnitCents * (10_000 - discountBps)) / 10_000);

/** A merchant's best honest unit price for a given committed volume. */
const merchantUnitPrice = (
  merchant: NegotiationMerchant,
  msrpUnitCents: Cents,
  units: number,
): Cents => {
  const discountBps = Math.min(merchant.maxDiscountBps, volumeDiscountBps(units));
  return Math.round((msrpUnitCents * (10_000 - discountBps)) / 10_000);
};

const quoteAtVolume = (
  merchants: readonly NegotiationMerchant[],
  msrpUnitCents: Cents,
  units: number,
): readonly PublicQuote[] =>
  merchants.map((merchant) => {
    const unitPriceCents = merchantUnitPrice(merchant, msrpUnitCents, units);
    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      unitPriceCents,
      deliveryDays: merchant.deliveryDays,
      warrantyMonths: merchant.warrantyMonths,
      discountBps: Math.round(((msrpUnitCents - unitPriceCents) * 10_000) / msrpUnitCents),
    };
  });

/**
 * The cheapest quote wins. Ties break on faster delivery, then longer warranty,
 * then merchant id, so the outcome never depends on iteration order or a clock.
 */
const bestQuote = (quotes: readonly PublicQuote[]): PublicQuote =>
  [...quotes].sort(
    (a, b) =>
      a.unitPriceCents - b.unitPriceCents ||
      a.deliveryDays - b.deliveryDays ||
      b.warrantyMonths - a.warrantyMonths ||
      a.merchantId.localeCompare(b.merchantId),
  )[0];

const formatCents = (cents: Cents): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const formatBps = (bps: BasisPoints): string =>
  `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

interface NormalizedPledge {
  readonly discountBps: BasisPoints;
  readonly buyerCount: number;
  readonly unitsPerBuyer: number;
  readonly thresholdUnitPriceCents: Cents;
  readonly units: number;
}

const normalizePledges = (input: DemandCurveInput): readonly NormalizedPledge[] => {
  assertSafeInteger(input.msrpUnitCents, "MSRP");
  if (input.msrpUnitCents <= 0) {
    throw new DemandCurveError("INVALID_MSRP", "MSRP must be a positive integer number of cents.");
  }
  if (input.pledges.length === 0) {
    throw new DemandCurveError("EMPTY_CURVE", "At least one demand pledge is required.");
  }

  const seen = new Set<number>();
  const normalized = input.pledges.map((pledge): NormalizedPledge => {
    assertSafeInteger(pledge.discountBps, "pledge discount");
    assertSafeInteger(pledge.buyerCount, "pledge buyer count");
    const unitsPerBuyer = pledge.unitsPerBuyer ?? 1;
    assertSafeInteger(unitsPerBuyer, "units per buyer");
    if (pledge.discountBps < 0 || pledge.discountBps > MAX_DISCOUNT_BPS) {
      throw new DemandCurveError("INVALID_DISCOUNT", `Pledge discount must be between 0 and ${MAX_DISCOUNT_BPS} bps.`);
    }
    if (pledge.buyerCount <= 0 || pledge.buyerCount > MAX_BUYERS_PER_TIER) {
      throw new DemandCurveError("INVALID_BUYER_COUNT", "Each pledge needs a positive, bounded buyer count.");
    }
    if (unitsPerBuyer <= 0 || unitsPerBuyer > MAX_UNITS_PER_BUYER) {
      throw new DemandCurveError("INVALID_UNITS", `Units per buyer must be between 1 and ${MAX_UNITS_PER_BUYER}.`);
    }
    if (seen.has(pledge.discountBps)) {
      throw new DemandCurveError("DUPLICATE_TIER", "Each pledge discount tier must be distinct.");
    }
    seen.add(pledge.discountBps);
    return {
      discountBps: pledge.discountBps,
      buyerCount: pledge.buyerCount,
      unitsPerBuyer,
      thresholdUnitPriceCents: thresholdFor(input.msrpUnitCents, pledge.discountBps),
      units: pledge.buyerCount * unitsPerBuyer,
    };
  });

  // Shallowest discount first == highest ceiling first == demand curve read top-down.
  return [...normalized].sort((a, b) => a.discountBps - b.discountBps);
};

export interface NegotiateOptions {
  readonly merchants?: readonly NegotiationMerchant[];
}

/**
 * Run the full reverse negotiation for a demand curve.
 *
 * The agent evaluates committing down to each pledged price level. A level is
 * self-consistent when the best merchant quote for the volume it promises is a
 * price those buyers already agreed to pay. Among the self-consistent levels it
 * takes the one with the lowest clearing price, and every activated buyer pays
 * exactly that price.
 */
export function negotiateDemandCurve(
  input: DemandCurveInput,
  options: NegotiateOptions = {},
): DemandClearing {
  const pledges = normalizePledges(input);
  const merchants = [...(options.merchants ?? NEGOTIATION_MERCHANTS)].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (merchants.length === 0) {
    throw new DemandCurveError("NO_MERCHANTS", "A market requires at least one merchant.");
  }

  const msrp = input.msrpUnitCents;

  // Cumulative demand: buyers willing at price ≤ a rung's threshold are every
  // buyer whose ceiling is at or above it — i.e. this rung and all shallower ones.
  let cumulativeBuyers = 0;
  let cumulativeUnits = 0;
  const curve: DemandCurvePoint[] = pledges.map((pledge) => {
    cumulativeBuyers += pledge.buyerCount;
    cumulativeUnits += pledge.units;
    return {
      discountBps: pledge.discountBps,
      thresholdUnitPriceCents: pledge.thresholdUnitPriceCents,
      buyerCount: pledge.buyerCount,
      cumulativeBuyers,
      cumulativeUnits,
    };
  });

  const rounds: NegotiationRound[] = curve.map((point, index): NegotiationRound => {
    const quotes = quoteAtVolume(merchants, msrp, point.cumulativeUnits);
    const best = bestQuote(quotes);
    const accepted = best.unitPriceCents <= point.thresholdUnitPriceCents;
    return {
      sequence: index + 1,
      consideredDiscountBps: point.discountBps,
      thresholdUnitPriceCents: point.thresholdUnitPriceCents,
      committedBuyers: point.cumulativeBuyers,
      committedUnits: point.cumulativeUnits,
      quotes,
      bestUnitPriceCents: best.unitPriceCents,
      bestMerchantId: best.merchantId,
      accepted,
      note: accepted
        ? `${point.cumulativeUnits} committed units pull ${best.merchantName} to ${formatCents(best.unitPriceCents)} (${formatBps(best.discountBps)} off).`
        : `At ${formatBps(point.discountBps)} off the deepest quote is ${formatCents(best.unitPriceCents)} — above the ${formatCents(point.thresholdUnitPriceCents)} ceiling of these buyers.`,
    };
  });

  const acceptedRounds = rounds.filter((round) => round.accepted);
  const msrpUnits = cumulativeUnits;

  if (acceptedRounds.length === 0) {
    const deepest = curve[curve.length - 1];
    const deepestBest = bestQuote(quoteAtVolume(merchants, msrp, deepest.cumulativeUnits));
    const highestThreshold = curve[0].thresholdUnitPriceCents;
    return {
      code: "no_acceptable_offer",
      productLabel: input.productLabel,
      msrpUnitCents: msrp,
      curve,
      rounds,
      clearingUnitPriceCents: null,
      clearingDiscountBps: null,
      winner: null,
      activatedBuyers: 0,
      activatedUnits: 0,
      clearingTotalCents: 0,
      msrpTotalCents: msrpUnits * msrp,
      totalSavingsCents: 0,
      tierOutcomes: curve.map((point) => ({
        discountBps: point.discountBps,
        thresholdUnitPriceCents: point.thresholdUnitPriceCents,
        buyerCount: point.buyerCount,
        included: false,
        paidUnitPriceCents: null,
        surplusPerBuyerCents: 0,
        surplusTotalCents: 0,
      })),
      shortfall: {
        bestAchievableUnitPriceCents: deepestBest.unitPriceCents,
        highestPledgeUnitPriceCents: highestThreshold,
        gapCents: deepestBest.unitPriceCents - highestThreshold,
      },
    };
  }

  // Buyer-optimal: the lowest clearing price wins; on a tie, serve more units.
  const winningRound = [...acceptedRounds].sort(
    (a, b) => a.bestUnitPriceCents - b.bestUnitPriceCents || b.committedUnits - a.committedUnits,
  )[0];
  const clearingUnitPriceCents = winningRound.bestUnitPriceCents;
  const winner =
    winningRound.quotes.find((quote) => quote.merchantId === winningRound.bestMerchantId) ?? null;

  // Every buyer whose ceiling is at or above the clearing price is served, and
  // all of them pay the clearing price — that is the point of the mechanism.
  const includedPledges = pledges.filter(
    (pledge) => pledge.thresholdUnitPriceCents >= clearingUnitPriceCents,
  );
  const activatedBuyers = includedPledges.reduce((sum, pledge) => sum + pledge.buyerCount, 0);
  const activatedUnits = includedPledges.reduce((sum, pledge) => sum + pledge.units, 0);
  const clearingTotalCents = activatedUnits * clearingUnitPriceCents;
  const msrpTotalCents = activatedUnits * msrp;

  const tierOutcomes: DemandTierOutcome[] = curve.map((point) => {
    const included = point.thresholdUnitPriceCents >= clearingUnitPriceCents;
    const surplusPerBuyerCents = included
      ? point.thresholdUnitPriceCents - clearingUnitPriceCents
      : 0;
    const unitsPerBuyer =
      pledges.find((pledge) => pledge.discountBps === point.discountBps)?.unitsPerBuyer ?? 1;
    return {
      discountBps: point.discountBps,
      thresholdUnitPriceCents: point.thresholdUnitPriceCents,
      buyerCount: point.buyerCount,
      included,
      paidUnitPriceCents: included ? clearingUnitPriceCents : null,
      surplusPerBuyerCents,
      surplusTotalCents: surplusPerBuyerCents * point.buyerCount * unitsPerBuyer,
    };
  });

  return {
    code: "cleared",
    productLabel: input.productLabel,
    msrpUnitCents: msrp,
    curve,
    rounds,
    clearingUnitPriceCents,
    clearingDiscountBps: Math.round(((msrp - clearingUnitPriceCents) * 10_000) / msrp),
    winner,
    activatedBuyers,
    activatedUnits,
    clearingTotalCents,
    msrpTotalCents,
    totalSavingsCents: msrpTotalCents - clearingTotalCents,
    tierOutcomes,
    shortfall: null,
  };
}

/**
 * The scenario the user pitched: a $1,000 MacBook with three pledge rungs. It
 * clears all the way to 30% off because the deepest rung's volume is exactly
 * what unlocks the deepest merchant, and every activated buyer pays that price.
 */
export const MACBOOK_DEMAND_SCENARIO: DemandCurveInput = {
  productLabel: "MacBook Air 13-inch (M4)",
  msrpUnitCents: 100_000,
  pledges: [
    { discountBps: 1_000, buyerCount: 300 },
    { discountBps: 2_000, buyerCount: 180 },
    { discountBps: 3_000, buyerCount: 80 },
  ],
};
