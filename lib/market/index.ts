/**
 * POOL's deterministic market core.
 *
 * AI may translate prose into these structures or propose a negotiating move,
 * but compatibility, money, offer validity, and authorization are enforced here.
 * All money is represented as integer cents.
 */

import { createHash } from "node:crypto";

export type Currency = "USD";
export type IsoDateTime = string;
export type IsoDate = string;
export type Port = "usb-c" | "displayport" | "hdmi";
export type PanelTechnology = "ips" | "oled" | "va";
export type DisplayFormFactor = "flat-panel" | "ultrawide";

export type PoolState =
  | "collecting"
  | "matched"
  | "committed"
  | "market_open"
  | "negotiating"
  | "policy_review"
  | "authorized"
  | "settling"
  | "settled"
  | "dissolved"
  | "blocked";

export interface Resolution {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly label: string;
}

export interface ProductSpecs {
  readonly formFactor: DisplayFormFactor;
  readonly diagonalInches: number;
  readonly resolution: Resolution;
  readonly panelTechnology: PanelTechnology;
  readonly ports: readonly Port[];
  readonly usbPowerDeliveryWatts: number;
  readonly vesaMount: boolean;
}

export interface CatalogProduct {
  readonly sku: string;
  readonly categoryKey: "display";
  readonly displayName: string;
  readonly shortName: string;
  readonly baselineUnitPriceCents: number;
  readonly currency: Currency;
  readonly specs: ProductSpecs;
}

export interface ProductRequirement {
  readonly categoryKey: "display";
  readonly productLabel: string;
  readonly formFactor: DisplayFormFactor;
  readonly minDiagonalInches?: number;
  readonly maxDiagonalInches?: number;
  readonly minResolution: Resolution;
  readonly allowedPanelTechnologies?: readonly PanelTechnology[];
  readonly requiredPorts?: readonly Port[];
  readonly minUsbPowerDeliveryWatts?: number;
  readonly requireVesaMount?: boolean;
}

export interface BuyerIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly agentName: string;
  readonly initials: string;
}

export interface PurchaseDemand {
  readonly description: string;
  readonly requirement: ProductRequirement;
  readonly quantity: number;
  readonly destinationCountry: string;
  readonly destinationRegion: string;
  readonly deliverBy: IsoDate;
  readonly minWarrantyMonths: number;
}

/** This object is never part of the public market projection. */
export interface PrivateBuyerMandate {
  readonly mandateId: string;
  readonly targetUnitPriceCents: number;
  readonly maxUnitPriceCents: number;
  readonly maxTotalSpendCents: number;
  readonly allowedProductSkus: readonly string[];
  readonly allowedMerchantIds: readonly string[];
  readonly allowedMerchantCategoryCodes: readonly string[];
  readonly validUntil: IsoDateTime;
}

export interface BuyingIntent {
  readonly id: string;
  readonly buyer: BuyerIdentity;
  readonly demand: PurchaseDemand;
  readonly privateMandate: PrivateBuyerMandate;
  readonly createdAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
  readonly status: "open" | "pooled" | "fulfilled" | "expired" | "withdrawn";
}

export interface PublicBuyingIntent {
  readonly id: string;
  readonly buyer: BuyerIdentity;
  readonly demand: PurchaseDemand;
  readonly createdAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
  readonly status: BuyingIntent["status"];
  readonly mandate: {
    readonly visibility: "private";
    readonly enforcedPolicyCount: number;
  };
}

export interface QuantityPriceTier {
  readonly minQuantity: number;
  readonly unitPriceCents: number;
}

/** Merchant floors and response premiums are private seller economics. */
export interface PrivateMerchantPricing {
  readonly listUnitPriceCents: number;
  readonly floorUnitPriceCents: number;
  readonly quantityTiers: readonly QuantityPriceTier[];
  readonly counterResponsePremiumCents: number;
}

export interface MerchantCatalogItem {
  readonly productSku: string;
  readonly availableQuantity: number;
  readonly pricing: PrivateMerchantPricing;
}

export interface Merchant {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly simulated: true;
  readonly merchantCategoryCode: string;
  readonly deliveryDays: number;
  readonly warrantyMonths: number;
  readonly supportedCountries: readonly string[];
  readonly inventory: readonly MerchantCatalogItem[];
}

export interface PublicMerchant {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly simulated: true;
  readonly merchantCategoryCode: string;
  readonly deliveryDays: number;
  readonly warrantyMonths: number;
  readonly supportedCountries: readonly string[];
  readonly productSkus: readonly string[];
  readonly economics: {
    readonly visibility: "private";
    readonly usesQuantityTiers: true;
  };
}

export type CompatibilityReasonCode =
  | "CATEGORY_MISMATCH"
  | "FORM_FACTOR_MISMATCH"
  | "DIAGONAL_TOO_SMALL"
  | "DIAGONAL_TOO_LARGE"
  | "RESOLUTION_TOO_LOW"
  | "PANEL_NOT_ALLOWED"
  | "MISSING_REQUIRED_PORT"
  | "POWER_DELIVERY_TOO_LOW"
  | "VESA_MOUNT_REQUIRED";

export interface CompatibilityReason {
  readonly code: CompatibilityReasonCode;
  readonly message: string;
}

export interface ProductCompatibility {
  readonly productSku: string;
  readonly intentId: string;
  readonly compatible: boolean;
  readonly reasons: readonly CompatibilityReason[];
}

export interface CoalitionCandidate {
  readonly productSku: string;
  readonly intentIds: readonly string[];
  readonly totalQuantity: number;
}

export interface ExcludedIntent {
  readonly intentId: string;
  readonly buyerDisplayName: string;
  readonly reasons: readonly CompatibilityReason[];
}

export interface PoolStateTransition {
  readonly from: PoolState;
  readonly to: PoolState;
  readonly at: IsoDateTime;
  readonly reason: string;
}

export interface BuyingCoalition {
  readonly id: string;
  readonly productSku: string;
  readonly memberIntentIds: readonly string[];
  readonly totalQuantity: number;
  readonly state: PoolState;
  readonly createdAt: IsoDateTime;
  readonly version: number;
  readonly stateHistory: readonly PoolStateTransition[];
}

export interface CoalitionDiscovery {
  readonly matched: boolean;
  readonly selectedProduct: CatalogProduct | null;
  readonly coalition: BuyingCoalition | null;
  readonly candidates: readonly CoalitionCandidate[];
  readonly excluded: readonly ExcludedIntent[];
  readonly explanation: string;
}

export type OfferStatus = "active" | "superseded" | "accepted" | "declined" | "expired";

export interface MerchantOffer {
  readonly id: string;
  readonly poolId: string;
  readonly merchantId: string;
  readonly productSku: string;
  readonly revision: number;
  readonly supersedesOfferId?: string;
  readonly quantity: number;
  readonly currency: Currency;
  readonly unitPriceCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly deliveryDate: IsoDate;
  readonly warrantyMonths: number;
  readonly issuedAt: IsoDateTime;
  readonly validUntil: IsoDateTime;
  readonly status: OfferStatus;
}

export type NegotiationEventKind =
  | "MARKET_OPENED"
  | "INITIAL_OFFER"
  | "COALITION_COUNTERED"
  | "MERCHANT_REVISED"
  | "WINNER_SELECTED";

export interface NegotiationEvent {
  readonly id: string;
  readonly sequence: number;
  readonly at: IsoDateTime;
  readonly kind: NegotiationEventKind;
  readonly actorType: "market" | "buyer_coalition" | "merchant";
  readonly actorId: string;
  readonly title: string;
  readonly detail: string;
  readonly offerId?: string;
  readonly unitPriceCents?: number;
}

export interface NegotiationResult {
  readonly poolId: string;
  readonly counterUnitPriceCents: number;
  readonly initialOffers: readonly MerchantOffer[];
  readonly finalOffers: readonly MerchantOffer[];
  readonly winningOffer: MerchantOffer;
  readonly events: readonly NegotiationEvent[];
}

export type PolicyRuleCode =
  | "OFFER_TOTAL_INTACT"
  | "OFFER_NOT_EXPIRED"
  | "OFFER_IS_CURRENT"
  | "OFFER_STATUS_VALID"
  | "PRODUCT_EXISTS"
  | "MERCHANT_EXISTS"
  | "MERCHANT_CAN_FULFILL"
  | "COALITION_QUANTITY_MATCH"
  | "PAYMENT_RAIL_LIMIT"
  | "MANDATE_ACTIVE"
  | "PRODUCT_ALLOWED"
  | "PRODUCT_MATCH"
  | "MERCHANT_ALLOWED"
  | "MERCHANT_CATEGORY_ALLOWED"
  | "UNIT_PRICE_LIMIT"
  | "TOTAL_SPEND_LIMIT"
  | "DELIVERY_DEADLINE"
  | "WARRANTY_MINIMUM";

export interface PolicyRuleResult {
  readonly code: PolicyRuleCode;
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface BuyerPolicyResult {
  readonly intentId: string;
  readonly buyerDisplayName: string;
  readonly allocationQuantity: number;
  readonly allocationTotalCents: number;
  readonly passed: boolean;
  readonly checks: readonly PolicyRuleResult[];
}

export interface PolicyEvaluation {
  readonly offerId: string;
  readonly evaluatedAt: IsoDateTime;
  readonly passed: boolean;
  readonly totalCents: number;
  readonly globalChecks: readonly PolicyRuleResult[];
  readonly buyerResults: readonly BuyerPolicyResult[];
  readonly deniedReasons: readonly string[];
}

export interface PolicyEvaluationInput {
  readonly offer: MerchantOffer;
  readonly coalition: BuyingCoalition;
  readonly intents: readonly BuyingIntent[];
  readonly products: readonly CatalogProduct[];
  readonly merchants: readonly Merchant[];
  readonly now: IsoDateTime;
  readonly expectedOfferId?: string;
  readonly paymentRailCapCents?: number;
}

export interface DealAgreement {
  readonly id: string;
  readonly poolId: string;
  readonly offerId: string;
  readonly offerRevision: number;
  readonly termsFingerprint: string;
  readonly acceptedAt: IsoDateTime;
  readonly status: "accepted";
}

export interface BuyerChargeInstruction {
  readonly intentId: string;
  readonly buyerId: string;
  readonly mandateId: string;
  readonly quantity: number;
  readonly amountCents: number;
}

export interface PaymentAuthorizationRequest {
  readonly authorizationId: string;
  readonly agreementId: string;
  readonly poolId: string;
  readonly merchantId: string;
  readonly merchantCategoryCode: string;
  readonly productSku: string;
  readonly currency: Currency;
  readonly totalAmountCents: number;
  readonly expiresAt: IsoDateTime;
  readonly charges: readonly BuyerChargeInstruction[];
}

export type SettlementDecisionCode =
  | "READY_FOR_PAYMENT_RAIL"
  | "TERMS_TAMPERED"
  | "STALE_OFFER"
  | "POLICY_REJECTED"
  | "IDEMPOTENCY_CONFLICT"
  | "ALREADY_AUTHORIZED";

export interface SettlementDecision {
  readonly approved: boolean;
  readonly code: SettlementDecisionCode;
  readonly message: string;
  readonly replayed: boolean;
  readonly policy?: PolicyEvaluation;
  readonly authorization?: PaymentAuthorizationRequest;
}

export interface SettlementRecord {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly agreementId: string;
  readonly decision: SettlementDecision;
  readonly createdAt: IsoDateTime;
}

export interface SettlementLedger {
  readonly recordsByIdempotencyKey: Readonly<Record<string, SettlementRecord>>;
  readonly authorizationKeyByAgreementId: Readonly<Record<string, string>>;
}

export interface SettlementRequest extends PolicyEvaluationInput {
  readonly idempotencyKey: string;
  readonly agreement: DealAgreement;
}

export interface ProcessSettlementResult {
  readonly decision: SettlementDecision;
  readonly ledger: SettlementLedger;
}

export interface BuyerOutcome {
  readonly intentId: string;
  readonly buyerDisplayName: string;
  readonly quantity: number;
  readonly baselineTotalCents: number;
  readonly poolTotalCents: number;
  readonly savingsCents: number;
}

export interface OutcomeMetrics {
  readonly buyerCount: number;
  readonly merchantCount: number;
  readonly totalQuantity: number;
  readonly baselineUnitPriceCents: number;
  readonly pooledUnitPriceCents: number;
  readonly baselineTotalCents: number;
  readonly pooledTotalCents: number;
  readonly totalSavingsCents: number;
  readonly discountBasisPoints: number;
  readonly underPaymentRailCap: boolean;
  readonly paymentRailHeadroomCents: number;
  readonly buyers: readonly BuyerOutcome[];
}

export interface HeroSafetyScenarios {
  readonly overBudgetOffer: MerchantOffer;
  readonly overBudgetPolicy: PolicyEvaluation;
  readonly tamperedOffer: MerchantOffer;
  readonly tamperedDecision: SettlementDecision;
  readonly staleDecision: SettlementDecision;
}

export interface HeroDemo {
  readonly clockStartedAt: IsoDateTime;
  readonly product: CatalogProduct;
  readonly intents: readonly BuyingIntent[];
  readonly publicIntents: readonly PublicBuyingIntent[];
  readonly incompatibleIntent: BuyingIntent;
  readonly publicIncompatibleIntent: PublicBuyingIntent;
  readonly discovery: CoalitionDiscovery;
  readonly coalition: BuyingCoalition;
  /** Snapshot after funded membership is frozen, before any seller receives the RFP. */
  readonly fundedCoalition: BuyingCoalition;
  readonly lifecycle: BuyingCoalition;
  readonly merchants: readonly PublicMerchant[];
  readonly negotiation: NegotiationResult;
  readonly policy: PolicyEvaluation;
  readonly agreement: DealAgreement;
  readonly outcome: OutcomeMetrics;
  readonly authorization: SettlementDecision;
  readonly idempotentReplay: SettlementDecision;
  readonly safety: HeroSafetyScenarios;
}

export class MarketInvariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MarketInvariantError";
    this.code = code;
  }
}

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MarketInvariantError("INVALID_INTEGER", label + " must be a positive integer");
  }
};

const assertNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MarketInvariantError("INVALID_MONEY", label + " must be a non-negative integer number of cents");
  }
};

const toTime = (value: IsoDateTime, label: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new MarketInvariantError("INVALID_DATE", label + " must be an ISO date or date-time");
  }
  return timestamp;
};

const addMinutes = (value: IsoDateTime, minutes: number): IsoDateTime =>
  new Date(toTime(value, "date") + minutes * 60_000).toISOString();

const addSeconds = (value: IsoDateTime, seconds: number): IsoDateTime =>
  new Date(toTime(value, "date") + seconds * 1_000).toISOString();

const addDaysAsDate = (value: IsoDateTime, days: number): IsoDate =>
  new Date(toTime(value, "date") + days * 86_400_000).toISOString().slice(0, 10);

const atMinute = (start: IsoDateTime, minute: number): IsoDateTime => addMinutes(start, minute);

export const formatMoney = (cents: number, currency: Currency = "USD"): string => {
  assertNonNegativeInteger(cents, "cents");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

export const formatBasisPoints = (basisPoints: number): string =>
  (basisPoints / 100).toFixed(1).replace(/\.0$/, "") + "%";

export const calculateOfferTotal = (offer: Pick<MerchantOffer, "quantity" | "unitPriceCents" | "shippingCents">): number => {
  assertPositiveInteger(offer.quantity, "offer quantity");
  assertNonNegativeInteger(offer.unitPriceCents, "offer unit price");
  assertNonNegativeInteger(offer.shippingCents, "offer shipping");
  return offer.quantity * offer.unitPriceCents + offer.shippingCents;
};

export const toPublicIntent = (intent: BuyingIntent): PublicBuyingIntent => ({
  id: intent.id,
  buyer: intent.buyer,
  demand: intent.demand,
  createdAt: intent.createdAt,
  expiresAt: intent.expiresAt,
  status: intent.status,
  mandate: {
    visibility: "private",
    enforcedPolicyCount: 7,
  },
});

export const toPublicMerchant = (merchant: Merchant): PublicMerchant => ({
  id: merchant.id,
  displayName: merchant.displayName,
  description: merchant.description,
  simulated: true,
  merchantCategoryCode: merchant.merchantCategoryCode,
  deliveryDays: merchant.deliveryDays,
  warrantyMonths: merchant.warrantyMonths,
  supportedCountries: merchant.supportedCountries,
  productSkus: merchant.inventory.map((item) => item.productSku),
  economics: {
    visibility: "private",
    usesQuantityTiers: true,
  },
});

export const assessProductCompatibility = (
  product: CatalogProduct,
  intent: BuyingIntent,
): ProductCompatibility => {
  const requirement = intent.demand.requirement;
  const reasons: CompatibilityReason[] = [];

  if (product.categoryKey !== requirement.categoryKey) {
    reasons.push({ code: "CATEGORY_MISMATCH", message: "The product category does not match the request." });
  }
  if (product.specs.formFactor !== requirement.formFactor) {
    reasons.push({ code: "FORM_FACTOR_MISMATCH", message: "The display form factor is incompatible." });
  }
  if (
    requirement.minDiagonalInches !== undefined &&
    product.specs.diagonalInches < requirement.minDiagonalInches
  ) {
    reasons.push({ code: "DIAGONAL_TOO_SMALL", message: "The display is smaller than the required size." });
  }
  if (
    requirement.maxDiagonalInches !== undefined &&
    product.specs.diagonalInches > requirement.maxDiagonalInches
  ) {
    reasons.push({ code: "DIAGONAL_TOO_LARGE", message: "The display is larger than the allowed size." });
  }
  if (
    product.specs.resolution.widthPixels < requirement.minResolution.widthPixels ||
    product.specs.resolution.heightPixels < requirement.minResolution.heightPixels
  ) {
    reasons.push({ code: "RESOLUTION_TOO_LOW", message: "The display resolution is below the requirement." });
  }
  if (
    requirement.allowedPanelTechnologies &&
    !requirement.allowedPanelTechnologies.includes(product.specs.panelTechnology)
  ) {
    reasons.push({ code: "PANEL_NOT_ALLOWED", message: "The panel technology is not accepted." });
  }
  for (const port of requirement.requiredPorts ?? []) {
    if (!product.specs.ports.includes(port)) {
      reasons.push({
        code: "MISSING_REQUIRED_PORT",
        message: "The display is missing required " + port.toUpperCase() + " connectivity.",
      });
    }
  }
  if (
    requirement.minUsbPowerDeliveryWatts !== undefined &&
    product.specs.usbPowerDeliveryWatts < requirement.minUsbPowerDeliveryWatts
  ) {
    reasons.push({
      code: "POWER_DELIVERY_TOO_LOW",
      message: "USB-C power delivery is below the required wattage.",
    });
  }
  if (requirement.requireVesaMount && !product.specs.vesaMount) {
    reasons.push({ code: "VESA_MOUNT_REQUIRED", message: "A VESA-compatible mount is required." });
  }

  return {
    productSku: product.sku,
    intentId: intent.id,
    compatible: reasons.length === 0,
    reasons,
  };
};

export interface DiscoverCoalitionOptions {
  readonly poolId: string;
  readonly now: IsoDateTime;
  readonly minimumBuyers?: number;
}

export const discoverCoalition = (
  intents: readonly BuyingIntent[],
  products: readonly CatalogProduct[],
  options: DiscoverCoalitionOptions,
): CoalitionDiscovery => {
  const minimumBuyers = options.minimumBuyers ?? 2;
  assertPositiveInteger(minimumBuyers, "minimum buyers");
  const now = toTime(options.now, "discovery time");
  const openIntents = intents.filter(
    (intent) =>
      intent.status === "open" &&
      toTime(intent.expiresAt, "intent expiry") >= now &&
      toTime(intent.privateMandate.validUntil, "mandate expiry") >= now,
  );

  const candidates = products
    .map((product): CoalitionCandidate => {
      const compatible = openIntents.filter(
        (intent) => assessProductCompatibility(product, intent).compatible,
      );
      return {
        productSku: product.sku,
        intentIds: compatible.map((intent) => intent.id).sort(),
        totalQuantity: compatible.reduce((total, intent) => total + intent.demand.quantity, 0),
      };
    })
    .sort(
      (a, b) =>
        b.intentIds.length - a.intentIds.length ||
        b.totalQuantity - a.totalQuantity ||
        a.productSku.localeCompare(b.productSku),
    );

  const selectedCandidate = candidates.find((candidate) => candidate.intentIds.length >= minimumBuyers) ?? null;
  if (!selectedCandidate) {
    return {
      matched: false,
      selectedProduct: null,
      coalition: null,
      candidates,
      excluded: openIntents.map((intent) => ({
        intentId: intent.id,
        buyerDisplayName: intent.buyer.displayName,
        reasons: [{ code: "CATEGORY_MISMATCH", message: "No shared catalog product satisfies enough buyers." }],
      })),
      explanation: "No product currently satisfies at least " + minimumBuyers + " independent buying intents.",
    };
  }

  const product = products.find((candidate) => candidate.sku === selectedCandidate.productSku);
  if (!product) {
    throw new MarketInvariantError("PRODUCT_NOT_FOUND", "Selected coalition product disappeared from the catalog");
  }
  const includedIds = new Set(selectedCandidate.intentIds);
  const excluded = openIntents
    .filter((intent) => !includedIds.has(intent.id))
    .map((intent): ExcludedIntent => {
      const assessment = assessProductCompatibility(product, intent);
      return {
        intentId: intent.id,
        buyerDisplayName: intent.buyer.displayName,
        reasons: assessment.reasons,
      };
    });

  const coalition: BuyingCoalition = {
    id: options.poolId,
    productSku: product.sku,
    memberIntentIds: selectedCandidate.intentIds,
    totalQuantity: selectedCandidate.totalQuantity,
    state: "matched",
    createdAt: options.now,
    version: 1,
    stateHistory: [
      {
        from: "collecting",
        to: "matched",
        at: options.now,
        reason: selectedCandidate.intentIds.length + " compatible intents discovered",
      },
    ],
  };

  return {
    matched: true,
    selectedProduct: product,
    coalition,
    candidates,
    excluded,
    explanation:
      selectedCandidate.intentIds.length +
      " independent buyers share one satisfiable product specification, creating " +
      selectedCandidate.totalQuantity +
      " units of negotiable demand.",
  };
};

const ALLOWED_POOL_TRANSITIONS: Readonly<Record<PoolState, readonly PoolState[]>> = {
  collecting: ["matched", "blocked"],
  matched: ["committed", "blocked"],
  committed: ["market_open", "blocked"],
  market_open: ["negotiating", "blocked"],
  negotiating: ["policy_review", "blocked"],
  policy_review: ["authorized", "blocked"],
  authorized: ["settling", "blocked"],
  settling: ["settled", "blocked"],
  settled: ["dissolved"],
  dissolved: [],
  blocked: [],
};

export const canTransitionPoolState = (from: PoolState, to: PoolState): boolean =>
  ALLOWED_POOL_TRANSITIONS[from].includes(to);

export const transitionPoolState = (
  coalition: BuyingCoalition,
  to: PoolState,
  at: IsoDateTime,
  reason: string,
): BuyingCoalition => {
  if (!canTransitionPoolState(coalition.state, to)) {
    throw new MarketInvariantError(
      "INVALID_STATE_TRANSITION",
      "Cannot transition pool from " + coalition.state + " to " + to,
    );
  }
  if (toTime(at, "transition time") < toTime(coalition.createdAt, "pool creation time")) {
    throw new MarketInvariantError("INVALID_TRANSITION_TIME", "Pool transition cannot predate pool creation");
  }
  return {
    ...coalition,
    state: to,
    version: coalition.version + 1,
    stateHistory: [...coalition.stateHistory, { from: coalition.state, to, at, reason }],
  };
};

export const validateMerchantEconomics = (merchant: Merchant): readonly string[] => {
  const errors: string[] = [];
  for (const item of merchant.inventory) {
    assertPositiveInteger(item.availableQuantity, "merchant inventory");
    const pricing = item.pricing;
    assertNonNegativeInteger(pricing.listUnitPriceCents, "merchant list price");
    assertNonNegativeInteger(pricing.floorUnitPriceCents, "merchant floor price");
    assertNonNegativeInteger(pricing.counterResponsePremiumCents, "merchant response premium");
    if (pricing.floorUnitPriceCents > pricing.listUnitPriceCents) {
      errors.push(item.productSku + ": floor exceeds list price");
    }
    let previousMinimum = 0;
    let previousPrice = Number.POSITIVE_INFINITY;
    for (const tier of pricing.quantityTiers) {
      if (tier.minQuantity <= previousMinimum) {
        errors.push(item.productSku + ": quantity tiers are not strictly ascending");
      }
      if (tier.unitPriceCents > previousPrice) {
        errors.push(item.productSku + ": quantity price increases at a higher tier");
      }
      if (tier.unitPriceCents < pricing.floorUnitPriceCents) {
        errors.push(item.productSku + ": quantity tier undercuts the private floor");
      }
      previousMinimum = tier.minQuantity;
      previousPrice = tier.unitPriceCents;
    }
    if (pricing.quantityTiers[0]?.minQuantity !== 1) {
      errors.push(item.productSku + ": first quantity tier must begin at one unit");
    }
  }
  return errors;
};

export const getTierUnitPrice = (merchant: Merchant, productSku: string, quantity: number): number => {
  assertPositiveInteger(quantity, "quote quantity");
  const item = merchant.inventory.find((candidate) => candidate.productSku === productSku);
  if (!item) {
    throw new MarketInvariantError("MERCHANT_PRODUCT_MISSING", merchant.displayName + " does not carry " + productSku);
  }
  if (quantity > item.availableQuantity) {
    throw new MarketInvariantError("INSUFFICIENT_INVENTORY", merchant.displayName + " cannot fulfill the requested quantity");
  }
  const errors = validateMerchantEconomics(merchant);
  if (errors.length > 0) {
    throw new MarketInvariantError("INVALID_MERCHANT_ECONOMICS", errors.join("; "));
  }
  const eligibleTiers = item.pricing.quantityTiers.filter((tier) => tier.minQuantity <= quantity);
  const tier = eligibleTiers[eligibleTiers.length - 1];
  if (!tier) {
    throw new MarketInvariantError("NO_PRICE_TIER", merchant.displayName + " has no applicable price tier");
  }
  return tier.unitPriceCents;
};

const offerId = (poolId: string, merchantId: string, revision: number): string =>
  "offer:" + poolId + ":" + merchantId + ":r" + revision;

const createOffer = (
  coalition: BuyingCoalition,
  merchant: Merchant,
  unitPriceCents: number,
  revision: number,
  issuedAt: IsoDateTime,
  validForMinutes: number,
  supersedesOfferId?: string,
): MerchantOffer => {
  const shippingCents = 0;
  const draft = {
    quantity: coalition.totalQuantity,
    unitPriceCents,
    shippingCents,
  };
  return {
    id: offerId(coalition.id, merchant.id, revision),
    poolId: coalition.id,
    merchantId: merchant.id,
    productSku: coalition.productSku,
    revision,
    ...(supersedesOfferId ? { supersedesOfferId } : {}),
    quantity: coalition.totalQuantity,
    currency: "USD",
    unitPriceCents,
    shippingCents,
    totalCents: calculateOfferTotal(draft),
    deliveryDate: addDaysAsDate(issuedAt, merchant.deliveryDays),
    warrantyMonths: merchant.warrantyMonths,
    issuedAt,
    validUntil: addMinutes(issuedAt, validForMinutes),
    status: "active",
  };
};

export const computeCoalitionCounterPrice = (
  baselineUnitPriceCents: number,
  totalQuantity: number,
  merchantCount: number,
): number => {
  assertNonNegativeInteger(baselineUnitPriceCents, "baseline unit price");
  assertPositiveInteger(totalQuantity, "coalition quantity");
  assertPositiveInteger(merchantCount, "merchant count");
  const leverageRate = Math.min(0.2, totalQuantity * 0.015 + merchantCount * 0.01);
  return Math.round((baselineUnitPriceCents * (1 - leverageRate)) / 100) * 100;
};

const createNegotiationEvent = (
  sequence: number,
  at: IsoDateTime,
  kind: NegotiationEventKind,
  actorType: NegotiationEvent["actorType"],
  actorId: string,
  title: string,
  detail: string,
  offer?: MerchantOffer,
): NegotiationEvent => ({
  id: "event:" + String(sequence).padStart(2, "0") + ":" + kind.toLowerCase(),
  sequence,
  at,
  kind,
  actorType,
  actorId,
  title,
  detail,
  ...(offer ? { offerId: offer.id, unitPriceCents: offer.unitPriceCents } : {}),
});

export interface RunNegotiationInput {
  readonly coalition: BuyingCoalition;
  readonly product: CatalogProduct;
  readonly merchants: readonly Merchant[];
  readonly startedAt: IsoDateTime;
}

export const runNegotiation = (input: RunNegotiationInput): NegotiationResult => {
  const { coalition, product, merchants, startedAt } = input;
  if (coalition.state !== "market_open" && coalition.state !== "negotiating") {
    throw new MarketInvariantError(
      "MARKET_NOT_OPEN",
      "Seller negotiation cannot begin until funded membership is committed and the market is opened",
    );
  }
  if (coalition.productSku !== product.sku) {
    throw new MarketInvariantError("PRODUCT_POOL_MISMATCH", "Negotiation product does not match the coalition");
  }
  if (merchants.length === 0) {
    throw new MarketInvariantError("NO_MERCHANTS", "A market requires at least one merchant");
  }

  const eligibleMerchants = merchants
    .filter((merchant) => {
      const item = merchant.inventory.find((candidate) => candidate.productSku === product.sku);
      return Boolean(item && item.availableQuantity >= coalition.totalQuantity);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligibleMerchants.length === 0) {
    throw new MarketInvariantError("NO_ELIGIBLE_MERCHANTS", "No merchant can fulfill the pooled quantity");
  }

  const events: NegotiationEvent[] = [
    createNegotiationEvent(
      1,
      startedAt,
      "MARKET_OPENED",
      "market",
      coalition.id,
      "Demand market opened",
      coalition.totalQuantity + " committed units invited " + eligibleMerchants.length + " seller agents to compete.",
    ),
  ];
  const initialOffers = eligibleMerchants.map((merchant, index) => {
    const offer = createOffer(
      coalition,
      merchant,
      getTierUnitPrice(merchant, product.sku, coalition.totalQuantity),
      1,
      atMinute(startedAt, index + 1),
      15,
    );
    events.push(
      createNegotiationEvent(
        events.length + 1,
        offer.issuedAt,
        "INITIAL_OFFER",
        "merchant",
        merchant.id,
        merchant.displayName + " entered",
        formatMoney(offer.unitPriceCents) + " per unit with " + merchant.deliveryDays + "-day delivery.",
        offer,
      ),
    );
    return offer;
  });

  const counterUnitPriceCents = computeCoalitionCounterPrice(
    product.baselineUnitPriceCents,
    coalition.totalQuantity,
    eligibleMerchants.length,
  );
  events.push(
    createNegotiationEvent(
      events.length + 1,
      atMinute(startedAt, 5),
      "COALITION_COUNTERED",
      "buyer_coalition",
      coalition.id,
      "Coalition countered as one buyer",
      "POOL offered " + formatMoney(counterUnitPriceCents) + " per unit for all " + coalition.totalQuantity + " committed units.",
    ),
  );

  const revisedOffers = eligibleMerchants.map((merchant, index) => {
    const item = merchant.inventory.find((candidate) => candidate.productSku === product.sku);
    if (!item) {
      throw new MarketInvariantError("MERCHANT_PRODUCT_MISSING", "Eligible merchant lost its product");
    }
    const initialOffer = initialOffers.find((offer) => offer.merchantId === merchant.id);
    if (!initialOffer) {
      throw new MarketInvariantError("INITIAL_OFFER_MISSING", "Merchant has no initial offer");
    }
    const responsePrice = Math.min(
      initialOffer.unitPriceCents,
      Math.max(
        item.pricing.floorUnitPriceCents,
        counterUnitPriceCents + item.pricing.counterResponsePremiumCents,
      ),
    );
    const offer = createOffer(
      coalition,
      merchant,
      responsePrice,
      2,
      atMinute(startedAt, 7 + index),
      18,
      initialOffer.id,
    );
    events.push(
      createNegotiationEvent(
        events.length + 1,
        offer.issuedAt,
        "MERCHANT_REVISED",
        "merchant",
        merchant.id,
        merchant.displayName + " revised",
        "The committed pool unlocked a final offer of " + formatMoney(offer.unitPriceCents) + " per unit.",
        offer,
      ),
    );
    return offer;
  });

  const winnerDraft = [...revisedOffers].sort(
    (a, b) =>
      a.unitPriceCents - b.unitPriceCents ||
      a.deliveryDate.localeCompare(b.deliveryDate) ||
      b.warrantyMonths - a.warrantyMonths ||
      a.merchantId.localeCompare(b.merchantId),
  )[0];
  if (!winnerDraft) {
    throw new MarketInvariantError("NO_WINNING_OFFER", "Negotiation produced no final offer");
  }
  const initialOfferResults = initialOffers.map((offer) => ({ ...offer, status: "superseded" as const }));
  const finalOffers = revisedOffers.map((offer) => ({
    ...offer,
    status: offer.id === winnerDraft.id ? ("accepted" as const) : ("declined" as const),
  }));
  const winningOffer = finalOffers.find((offer) => offer.id === winnerDraft.id);
  if (!winningOffer) {
    throw new MarketInvariantError("NO_WINNING_OFFER", "Winning offer was not preserved");
  }
  const winningMerchant = eligibleMerchants.find((merchant) => merchant.id === winningOffer.merchantId);
  if (!winningMerchant) {
    throw new MarketInvariantError("WINNING_MERCHANT_MISSING", "Winning merchant was not preserved");
  }
  events.push(
    createNegotiationEvent(
      events.length + 1,
      atMinute(startedAt, 10),
      "WINNER_SELECTED",
      "market",
      coalition.id,
      winningMerchant.displayName + " leads the market",
      formatMoney(winningOffer.unitPriceCents) + " per unit is the strongest compliant commercial offer.",
      winningOffer,
    ),
  );

  return {
    poolId: coalition.id,
    counterUnitPriceCents,
    initialOffers: initialOfferResults,
    finalOffers,
    winningOffer,
    events,
  };
};

export interface OfferAllocation {
  readonly intent: BuyingIntent;
  readonly quantity: number;
  readonly shippingCents: number;
  readonly totalCents: number;
}

export const allocateOfferAcrossIntents = (
  offer: MerchantOffer,
  coalition: BuyingCoalition,
  intents: readonly BuyingIntent[],
): readonly OfferAllocation[] => {
  const intentById = new Map(intents.map((intent) => [intent.id, intent]));
  const members = coalition.memberIntentIds.map((intentId) => {
    const intent = intentById.get(intentId);
    if (!intent) {
      throw new MarketInvariantError("COALITION_INTENT_MISSING", "Coalition member " + intentId + " is missing");
    }
    return intent;
  });
  const requestedQuantity = members.reduce((total, intent) => total + intent.demand.quantity, 0);
  if (requestedQuantity <= 0) {
    throw new MarketInvariantError("EMPTY_COALITION", "Cannot allocate an offer across zero units");
  }

  const initialShipping = members.map((intent) =>
    Math.floor((offer.shippingCents * intent.demand.quantity) / requestedQuantity),
  );
  let remainder = offer.shippingCents - initialShipping.reduce((total, value) => total + value, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % initialShipping.length) {
    initialShipping[index] += 1;
    remainder -= 1;
  }

  return members.map((intent, index) => ({
    intent,
    quantity: intent.demand.quantity,
    shippingCents: initialShipping[index] ?? 0,
    totalCents:
      intent.demand.quantity * offer.unitPriceCents + (initialShipping[index] ?? 0),
  }));
};

const rule = (
  code: PolicyRuleCode,
  label: string,
  passed: boolean,
  passDetail: string,
  failDetail: string,
): PolicyRuleResult => ({
  code,
  label,
  passed,
  detail: passed ? passDetail : failDetail,
});

export const evaluateOfferPolicies = (input: PolicyEvaluationInput): PolicyEvaluation => {
  const { offer, coalition, intents, products, merchants, now } = input;
  const nowTime = toTime(now, "policy evaluation time");
  const product = products.find((candidate) => candidate.sku === offer.productSku);
  const merchant = merchants.find((candidate) => candidate.id === offer.merchantId);
  const memberIntents = coalition.memberIntentIds
    .map((intentId) => intents.find((intent) => intent.id === intentId))
    .filter((intent): intent is BuyingIntent => Boolean(intent));
  const requestedQuantity = memberIntents.reduce((total, intent) => total + intent.demand.quantity, 0);
  const inventoryItem = merchant?.inventory.find((item) => item.productSku === offer.productSku);
  const supportedDestinations = memberIntents.every((intent) =>
    merchant?.supportedCountries.includes(intent.demand.destinationCountry),
  );
  const merchantDeliveryIsPlausible = merchant
    ? offer.deliveryDate >= addDaysAsDate(offer.issuedAt, merchant.deliveryDays)
    : false;
  const sellerPriceIsValid = inventoryItem
    ? offer.unitPriceCents >= inventoryItem.pricing.floorUnitPriceCents
    : false;
  const merchantCanFulfill = Boolean(
    inventoryItem &&
      inventoryItem.availableQuantity >= offer.quantity &&
      supportedDestinations &&
      merchantDeliveryIsPlausible &&
      sellerPriceIsValid,
  );

  const globalChecks: PolicyRuleResult[] = [
    rule(
      "OFFER_TOTAL_INTACT",
      "Offer arithmetic",
      offer.totalCents === calculateOfferTotal(offer),
      "Quantity, unit price, shipping, and total reconcile exactly.",
      "The stated offer total does not match its line-item terms.",
    ),
    rule(
      "OFFER_NOT_EXPIRED",
      "Offer validity",
      nowTime <= toTime(offer.validUntil, "offer expiry"),
      "The offer is inside its signed validity window.",
      "The offer validity window has closed.",
    ),
    rule(
      "OFFER_IS_CURRENT",
      "Current revision",
      input.expectedOfferId === undefined || offer.id === input.expectedOfferId,
      "The offer is the selected current revision.",
      "A newer or different offer was selected for this pool.",
    ),
    rule(
      "OFFER_STATUS_VALID",
      "Offer status",
      offer.status === "active" || offer.status === "accepted",
      "The offer is active for evaluation.",
      "A superseded, declined, or expired offer cannot authorize payment.",
    ),
    rule(
      "PRODUCT_EXISTS",
      "Known product",
      Boolean(product && product.sku === coalition.productSku),
      "The offered SKU is the product selected by the pool.",
      "The offered SKU is unknown or differs from the selected product.",
    ),
    rule(
      "MERCHANT_EXISTS",
      "Known merchant",
      Boolean(merchant),
      "The seller is registered in this market.",
      "The seller is not registered in this market.",
    ),
    rule(
      "MERCHANT_CAN_FULFILL",
      "Seller fulfillment",
      merchantCanFulfill,
      "Inventory, delivery capability, destination, and seller policy are valid.",
      "The seller cannot fulfill these exact terms under its inventory or private policy.",
    ),
    rule(
      "COALITION_QUANTITY_MATCH",
      "Committed quantity",
      offer.quantity === coalition.totalQuantity && offer.quantity === requestedQuantity,
      "The offer covers every committed unit exactly once.",
      "The offer quantity differs from the coalition's committed allocation.",
    ),
    rule(
      "PAYMENT_RAIL_LIMIT",
      "Payment rail amount",
      input.paymentRailCapCents === undefined || offer.totalCents <= input.paymentRailCapCents,
      input.paymentRailCapCents === undefined
        ? "No additional payment-rail cap was configured."
        : "The aggregate authorization fits the configured payment-rail cap.",
      "The aggregate authorization exceeds the configured payment-rail cap.",
    ),
  ];

  const allocations = allocateOfferAcrossIntents(offer, coalition, intents);
  const buyerResults = allocations.map((allocation): BuyerPolicyResult => {
    const intent = allocation.intent;
    const mandate = intent.privateMandate;
    const compatibility = product ? assessProductCompatibility(product, intent) : null;
    const checks: PolicyRuleResult[] = [
      rule(
        "MANDATE_ACTIVE",
        "Mandate active",
        nowTime <= toTime(mandate.validUntil, "mandate expiry") &&
          nowTime <= toTime(intent.expiresAt, "intent expiry") &&
          intent.status !== "withdrawn" &&
          intent.status !== "expired",
        "The buyer's private authority remains active.",
        "The buyer's private authority is expired or withdrawn.",
      ),
      rule(
        "PRODUCT_ALLOWED",
        "Product scope",
        mandate.allowedProductSkus.includes(offer.productSku),
        "The SKU is inside the buyer's private product scope.",
        "The SKU is outside the buyer's private product scope.",
      ),
      rule(
        "PRODUCT_MATCH",
        "Requirement match",
        compatibility?.compatible ?? false,
        "The product satisfies every hard technical requirement.",
        "The product violates at least one hard technical requirement.",
      ),
      rule(
        "MERCHANT_ALLOWED",
        "Merchant scope",
        mandate.allowedMerchantIds.includes(offer.merchantId),
        "The seller is inside the buyer's private merchant scope.",
        "The seller is outside the buyer's private merchant scope.",
      ),
      rule(
        "MERCHANT_CATEGORY_ALLOWED",
        "Merchant category",
        Boolean(merchant && mandate.allowedMerchantCategoryCodes.includes(merchant.merchantCategoryCode)),
        "The seller category is permitted by the buyer mandate.",
        "The seller category is not permitted by the buyer mandate.",
      ),
      rule(
        "UNIT_PRICE_LIMIT",
        "Unit price ceiling",
        offer.unitPriceCents <= mandate.maxUnitPriceCents,
        "The negotiated unit price is within the buyer's private ceiling.",
        "The attempted unit price exceeds the buyer's private ceiling.",
      ),
      rule(
        "TOTAL_SPEND_LIMIT",
        "Total spend ceiling",
        allocation.totalCents <= mandate.maxTotalSpendCents,
        "This buyer's allocated total is within its private spend ceiling.",
        "This buyer's allocated total exceeds its private spend ceiling.",
      ),
      rule(
        "DELIVERY_DEADLINE",
        "Delivery deadline",
        offer.deliveryDate <= intent.demand.deliverBy,
        "Promised delivery meets the buyer's hard deadline.",
        "Promised delivery misses the buyer's hard deadline.",
      ),
      rule(
        "WARRANTY_MINIMUM",
        "Warranty minimum",
        offer.warrantyMonths >= intent.demand.minWarrantyMonths,
        "The warranty meets the buyer's minimum term.",
        "The warranty is shorter than the buyer requires.",
      ),
    ];
    return {
      intentId: intent.id,
      buyerDisplayName: intent.buyer.displayName,
      allocationQuantity: allocation.quantity,
      allocationTotalCents: allocation.totalCents,
      passed: checks.every((check) => check.passed),
      checks,
    };
  });

  const deniedReasons = [
    ...globalChecks.filter((check) => !check.passed).map((check) => check.detail),
    ...buyerResults.flatMap((buyer) =>
      buyer.checks
        .filter((check) => !check.passed)
        .map((check) => buyer.buyerDisplayName + ": " + check.detail),
    ),
  ];

  return {
    offerId: offer.id,
    evaluatedAt: now,
    passed:
      memberIntents.length === coalition.memberIntentIds.length &&
      globalChecks.every((check) => check.passed) &&
      buyerResults.every((buyer) => buyer.passed),
    totalCents: offer.totalCents,
    globalChecks,
    buyerResults,
    deniedReasons,
  };
};

const stableHash = (input: string): string => {
  return createHash("sha256").update(input, "utf8").digest("hex");
};

const canonicalOfferTerms = (offer: MerchantOffer): string =>
  [
    offer.id,
    offer.poolId,
    offer.merchantId,
    offer.productSku,
    offer.revision,
    offer.supersedesOfferId ?? "",
    offer.quantity,
    offer.currency,
    offer.unitPriceCents,
    offer.shippingCents,
    offer.totalCents,
    offer.deliveryDate,
    offer.warrantyMonths,
    offer.issuedAt,
    offer.validUntil,
  ].join("|");

/** Cryptographic integrity fingerprint; durable storage should additionally authenticate access to the agreement. */
export const fingerprintOfferTerms = (offer: MerchantOffer): string =>
  "offer-v1-" + stableHash(canonicalOfferTerms(offer));

export const createDealAgreement = (
  offer: MerchantOffer,
  policy: PolicyEvaluation,
  acceptedAt: IsoDateTime,
): DealAgreement => {
  if (offer.id !== policy.offerId || !policy.passed) {
    throw new MarketInvariantError(
      "POLICY_NOT_APPROVED",
      "A deal agreement can only bind the exact offer that passed deterministic policy",
    );
  }
  if (toTime(acceptedAt, "acceptance time") > toTime(offer.validUntil, "offer expiry")) {
    throw new MarketInvariantError("OFFER_EXPIRED", "An expired offer cannot become an agreement");
  }
  return {
    id: "agreement:" + offer.id,
    poolId: offer.poolId,
    offerId: offer.id,
    offerRevision: offer.revision,
    termsFingerprint: fingerprintOfferTerms(offer),
    acceptedAt,
    status: "accepted",
  };
};

export const createSettlementLedger = (): SettlementLedger => ({
  recordsByIdempotencyKey: {},
  authorizationKeyByAgreementId: {},
});

const withSettlementRecord = (
  ledger: SettlementLedger,
  record: SettlementRecord,
  markAuthorized: boolean,
): SettlementLedger => ({
  recordsByIdempotencyKey: {
    ...ledger.recordsByIdempotencyKey,
    [record.idempotencyKey]: record,
  },
  authorizationKeyByAgreementId: markAuthorized
    ? {
        ...ledger.authorizationKeyByAgreementId,
        [record.agreementId]: record.idempotencyKey,
      }
    : ledger.authorizationKeyByAgreementId,
});

const settlementRequestFingerprint = (request: SettlementRequest): string =>
  "settlement-v1-" +
  stableHash(
    [
      request.agreement.id,
      request.agreement.termsFingerprint,
      fingerprintOfferTerms(request.offer),
      request.coalition.id,
      request.expectedOfferId ?? "",
    ].join("|"),
  );

const recordDecision = (
  request: SettlementRequest,
  ledger: SettlementLedger,
  requestFingerprint: string,
  decision: SettlementDecision,
): ProcessSettlementResult => {
  const record: SettlementRecord = {
    idempotencyKey: request.idempotencyKey,
    requestFingerprint,
    agreementId: request.agreement.id,
    decision,
    createdAt: request.now,
  };
  return {
    decision,
    ledger: withSettlementRecord(ledger, record, decision.approved),
  };
};

export const processSettlement = (
  request: SettlementRequest,
  ledger: SettlementLedger,
): ProcessSettlementResult => {
  if (!request.idempotencyKey.trim()) {
    throw new MarketInvariantError("IDEMPOTENCY_KEY_REQUIRED", "Settlement requires a non-empty idempotency key");
  }
  const requestFingerprint = settlementRequestFingerprint(request);
  const priorRecord = ledger.recordsByIdempotencyKey[request.idempotencyKey];
  if (priorRecord) {
    if (priorRecord.requestFingerprint === requestFingerprint) {
      return {
        ledger,
        decision: {
          ...priorRecord.decision,
          replayed: true,
          message: "Idempotent replay returned the original authorization decision; no new payment was created.",
        },
      };
    }
    return {
      ledger,
      decision: {
        approved: false,
        code: "IDEMPOTENCY_CONFLICT",
        message: "This idempotency key was already used for different settlement terms.",
        replayed: false,
      },
    };
  }

  const priorAuthorizationKey = ledger.authorizationKeyByAgreementId[request.agreement.id];
  if (priorAuthorizationKey) {
    return recordDecision(request, ledger, requestFingerprint, {
      approved: false,
      code: "ALREADY_AUTHORIZED",
      message: "This agreement already produced a payment authorization under another idempotency key.",
      replayed: false,
    });
  }

  const agreementMatches =
    request.agreement.poolId === request.offer.poolId &&
    request.agreement.offerId === request.offer.id &&
    request.agreement.offerRevision === request.offer.revision &&
    request.agreement.termsFingerprint === fingerprintOfferTerms(request.offer);
  if (!agreementMatches) {
    return recordDecision(request, ledger, requestFingerprint, {
      approved: false,
      code: "TERMS_TAMPERED",
      message: "Blocked: payment terms differ from the offer the coalition accepted.",
      replayed: false,
    });
  }

  const policy = evaluateOfferPolicies(request);
  if (!policy.passed) {
    const stale = policy.globalChecks.some(
      (check) => check.code === "OFFER_NOT_EXPIRED" && !check.passed,
    );
    return recordDecision(request, ledger, requestFingerprint, {
      approved: false,
      code: stale ? "STALE_OFFER" : "POLICY_REJECTED",
      message: stale
        ? "Blocked: the accepted offer expired before payment authorization."
        : "Blocked: one or more deterministic financial policies rejected the payment.",
      replayed: false,
      policy,
    });
  }

  const merchant = request.merchants.find((candidate) => candidate.id === request.offer.merchantId);
  if (!merchant) {
    throw new MarketInvariantError("MERCHANT_NOT_FOUND", "Approved policy did not preserve its merchant");
  }
  const allocations = allocateOfferAcrossIntents(request.offer, request.coalition, request.intents);
  const authorization: PaymentAuthorizationRequest = {
    authorizationId: "auth:" + stableHash(request.agreement.id + "|" + request.idempotencyKey),
    agreementId: request.agreement.id,
    poolId: request.coalition.id,
    merchantId: merchant.id,
    merchantCategoryCode: merchant.merchantCategoryCode,
    productSku: request.offer.productSku,
    currency: request.offer.currency,
    totalAmountCents: request.offer.totalCents,
    expiresAt: request.offer.validUntil,
    charges: allocations.map((allocation) => ({
      intentId: allocation.intent.id,
      buyerId: allocation.intent.buyer.id,
      mandateId: allocation.intent.privateMandate.mandateId,
      quantity: allocation.quantity,
      amountCents: allocation.totalCents,
    })),
  };
  const decision: SettlementDecision = {
    approved: true,
    code: "READY_FOR_PAYMENT_RAIL",
    message: "Policies passed. The bounded authorization is ready for the configured payment rail.",
    replayed: false,
    policy,
    authorization,
  };
  return recordDecision(request, ledger, requestFingerprint, decision);
};

export interface CalculateOutcomeInput {
  readonly product: CatalogProduct;
  readonly coalition: BuyingCoalition;
  readonly intents: readonly BuyingIntent[];
  readonly winningOffer: MerchantOffer;
  readonly merchantCount: number;
  readonly paymentRailCapCents: number;
}

export const calculateOutcomeMetrics = (input: CalculateOutcomeInput): OutcomeMetrics => {
  const allocations = allocateOfferAcrossIntents(input.winningOffer, input.coalition, input.intents);
  const baselineTotalCents = input.product.baselineUnitPriceCents * input.coalition.totalQuantity;
  const pooledTotalCents = input.winningOffer.totalCents;
  const totalSavingsCents = baselineTotalCents - pooledTotalCents;
  const buyers = allocations.map((allocation): BuyerOutcome => {
    const buyerBaseline = allocation.quantity * input.product.baselineUnitPriceCents;
    return {
      intentId: allocation.intent.id,
      buyerDisplayName: allocation.intent.buyer.displayName,
      quantity: allocation.quantity,
      baselineTotalCents: buyerBaseline,
      poolTotalCents: allocation.totalCents,
      savingsCents: buyerBaseline - allocation.totalCents,
    };
  });
  return {
    buyerCount: buyers.length,
    merchantCount: input.merchantCount,
    totalQuantity: input.coalition.totalQuantity,
    baselineUnitPriceCents: input.product.baselineUnitPriceCents,
    pooledUnitPriceCents: input.winningOffer.unitPriceCents,
    baselineTotalCents,
    pooledTotalCents,
    totalSavingsCents,
    discountBasisPoints:
      baselineTotalCents === 0 ? 0 : Math.round((totalSavingsCents / baselineTotalCents) * 10_000),
    underPaymentRailCap: pooledTotalCents <= input.paymentRailCapCents,
    paymentRailHeadroomCents: Math.max(0, input.paymentRailCapCents - pooledTotalCents),
    buyers,
  };
};

export const HERO_CLOCK_STARTED_AT: IsoDateTime = "2026-08-08T17:00:00.000Z";
export const RAIN_SANDBOX_ROLLING_CAP_CENTS = 500_000;
export const HERO_PAYMENT_RAIL_CAP_CENTS = RAIN_SANDBOX_ROLLING_CAP_CENTS;

export const HERO_PRODUCT: CatalogProduct = {
  sku: "DISPLAY-27-4K-IPS-USBC",
  categoryKey: "display",
  displayName: "27-inch 4K development monitor",
  shortName: "27-inch 4K monitor",
  baselineUnitPriceCents: 47_900,
  currency: "USD",
  specs: {
    formFactor: "flat-panel",
    diagonalInches: 27,
    resolution: { widthPixels: 3840, heightPixels: 2160, label: "4K UHD" },
    panelTechnology: "ips",
    ports: ["usb-c", "displayport", "hdmi"],
    usbPowerDeliveryWatts: 90,
    vesaMount: true,
  },
};

export const ULTRAWIDE_PRODUCT: CatalogProduct = {
  sku: "DISPLAY-34-UWQHD-OLED",
  categoryKey: "display",
  displayName: "34-inch ultrawide OLED monitor",
  shortName: "34-inch ultrawide",
  baselineUnitPriceCents: 89_900,
  currency: "USD",
  specs: {
    formFactor: "ultrawide",
    diagonalInches: 34,
    resolution: { widthPixels: 3440, heightPixels: 1440, label: "UWQHD" },
    panelTechnology: "oled",
    ports: ["usb-c", "displayport", "hdmi"],
    usbPowerDeliveryWatts: 65,
    vesaMount: true,
  },
};

export const HERO_PRODUCTS: readonly CatalogProduct[] = [HERO_PRODUCT, ULTRAWIDE_PRODUCT];

const HERO_MERCHANT_IDS = ["merchant-keystone", "merchant-northstar", "merchant-signal"] as const;
const HERO_MERCHANT_CATEGORY = "5732";

export const HERO_INTENTS: readonly BuyingIntent[] = [
  {
    id: "intent-harbor",
    buyer: {
      id: "buyer-harbor",
      displayName: "Harbor Labs",
      agentName: "Harbor purchasing agent",
      initials: "HL",
    },
    demand: {
      description: "3 color-accurate 4K screens with one-cable laptop charging",
      requirement: {
        categoryKey: "display",
        productLabel: "27-inch 4K USB-C monitor",
        formFactor: "flat-panel",
        minDiagonalInches: 27,
        maxDiagonalInches: 28,
        minResolution: { widthPixels: 3840, heightPixels: 2160, label: "4K" },
        allowedPanelTechnologies: ["ips"],
        requiredPorts: ["usb-c"],
        minUsbPowerDeliveryWatts: 65,
      },
      quantity: 3,
      destinationCountry: "US",
      destinationRegion: "New York",
      deliverBy: "2026-08-18",
      minWarrantyMonths: 24,
    },
    privateMandate: {
      mandateId: "mandate-harbor-01",
      targetUnitPriceCents: 40_500,
      maxUnitPriceCents: 43_200,
      maxTotalSpendCents: 129_600,
      allowedProductSkus: [HERO_PRODUCT.sku],
      allowedMerchantIds: HERO_MERCHANT_IDS,
      allowedMerchantCategoryCodes: [HERO_MERCHANT_CATEGORY],
      validUntil: "2026-08-31T23:59:59.000Z",
    },
    createdAt: "2026-08-08T16:42:00.000Z",
    expiresAt: "2026-08-18T23:59:59.000Z",
    status: "open",
  },
  {
    id: "intent-patchwork",
    buyer: {
      id: "buyer-patchwork",
      displayName: "Patchwork AI",
      agentName: "Patchwork purchasing agent",
      initials: "PA",
    },
    demand: {
      description: "4 VESA-mountable 27-inch 4K displays for a new engineering pod",
      requirement: {
        categoryKey: "display",
        productLabel: "27-inch 4K IPS engineering display",
        formFactor: "flat-panel",
        minDiagonalInches: 26.5,
        maxDiagonalInches: 27.5,
        minResolution: { widthPixels: 3840, heightPixels: 2160, label: "4K" },
        allowedPanelTechnologies: ["ips", "oled"],
        requiredPorts: ["displayport"],
        requireVesaMount: true,
      },
      quantity: 4,
      destinationCountry: "US",
      destinationRegion: "Massachusetts",
      deliverBy: "2026-08-16",
      minWarrantyMonths: 12,
    },
    privateMandate: {
      mandateId: "mandate-patchwork-01",
      targetUnitPriceCents: 39_900,
      maxUnitPriceCents: 42_000,
      maxTotalSpendCents: 168_000,
      allowedProductSkus: [HERO_PRODUCT.sku],
      allowedMerchantIds: HERO_MERCHANT_IDS,
      allowedMerchantCategoryCodes: [HERO_MERCHANT_CATEGORY],
      validUntil: "2026-08-31T23:59:59.000Z",
    },
    createdAt: "2026-08-08T16:47:00.000Z",
    expiresAt: "2026-08-16T23:59:59.000Z",
    status: "open",
  },
  {
    id: "intent-kernel",
    buyer: {
      id: "buyer-kernel",
      displayName: "Kernel Works",
      agentName: "Kernel purchasing agent",
      initials: "KW",
    },
    demand: {
      description: "5 compact 4K development monitors with HDMI support",
      requirement: {
        categoryKey: "display",
        productLabel: "4K development monitor, 27-inch maximum",
        formFactor: "flat-panel",
        minDiagonalInches: 26,
        maxDiagonalInches: 27,
        minResolution: { widthPixels: 3840, heightPixels: 2160, label: "4K" },
        allowedPanelTechnologies: ["ips"],
        requiredPorts: ["hdmi"],
      },
      quantity: 5,
      destinationCountry: "US",
      destinationRegion: "New Jersey",
      deliverBy: "2026-08-20",
      minWarrantyMonths: 24,
    },
    privateMandate: {
      mandateId: "mandate-kernel-01",
      targetUnitPriceCents: 39_500,
      maxUnitPriceCents: 40_500,
      maxTotalSpendCents: 202_500,
      allowedProductSkus: [HERO_PRODUCT.sku],
      allowedMerchantIds: HERO_MERCHANT_IDS,
      allowedMerchantCategoryCodes: [HERO_MERCHANT_CATEGORY],
      validUntil: "2026-08-31T23:59:59.000Z",
    },
    createdAt: "2026-08-08T16:51:00.000Z",
    expiresAt: "2026-08-20T23:59:59.000Z",
    status: "open",
  },
];

export const HERO_INCOMPATIBLE_INTENT: BuyingIntent = {
  id: "intent-studio-arc",
  buyer: {
    id: "buyer-studio-arc",
    displayName: "Studio Arc",
    agentName: "Studio Arc purchasing agent",
    initials: "SA",
  },
  demand: {
    description: "2 immersive 34-inch ultrawide OLED displays for video editing",
    requirement: {
      categoryKey: "display",
      productLabel: "34-inch ultrawide OLED monitor",
      formFactor: "ultrawide",
      minDiagonalInches: 34,
      minResolution: { widthPixels: 3440, heightPixels: 1440, label: "UWQHD" },
      allowedPanelTechnologies: ["oled"],
      requiredPorts: ["displayport"],
    },
    quantity: 2,
    destinationCountry: "US",
    destinationRegion: "New York",
    deliverBy: "2026-08-19",
    minWarrantyMonths: 12,
  },
  privateMandate: {
    mandateId: "mandate-studio-arc-01",
    targetUnitPriceCents: 79_900,
    maxUnitPriceCents: 89_900,
    maxTotalSpendCents: 179_800,
    allowedProductSkus: [ULTRAWIDE_PRODUCT.sku],
    allowedMerchantIds: HERO_MERCHANT_IDS,
    allowedMerchantCategoryCodes: [HERO_MERCHANT_CATEGORY],
    validUntil: "2026-08-31T23:59:59.000Z",
  },
  createdAt: "2026-08-08T16:55:00.000Z",
  expiresAt: "2026-08-19T23:59:59.000Z",
  status: "open",
};

export const HERO_MERCHANTS: readonly Merchant[] = [
  {
    id: "merchant-keystone",
    displayName: "Keystone Office",
    description: "Fast regional fulfillment with conventional warranty terms.",
    simulated: true,
    merchantCategoryCode: HERO_MERCHANT_CATEGORY,
    deliveryDays: 3,
    warrantyMonths: 24,
    supportedCountries: ["US"],
    inventory: [
      {
        productSku: HERO_PRODUCT.sku,
        availableQuantity: 40,
        pricing: {
          listUnitPriceCents: 47_900,
          floorUnitPriceCents: 39_500,
          quantityTiers: [
            { minQuantity: 1, unitPriceCents: 47_900 },
            { minQuantity: 4, unitPriceCents: 45_100 },
            { minQuantity: 8, unitPriceCents: 42_500 },
            { minQuantity: 12, unitPriceCents: 40_500 },
          ],
          counterResponsePremiumCents: 1_200,
        },
      },
    ],
  },
  {
    id: "merchant-northstar",
    displayName: "Northstar Systems",
    description: "National hardware distributor optimized for dependable delivery.",
    simulated: true,
    merchantCategoryCode: HERO_MERCHANT_CATEGORY,
    deliveryDays: 5,
    warrantyMonths: 24,
    supportedCountries: ["US"],
    inventory: [
      {
        productSku: HERO_PRODUCT.sku,
        availableQuantity: 80,
        pricing: {
          listUnitPriceCents: 47_900,
          floorUnitPriceCents: 39_700,
          quantityTiers: [
            { minQuantity: 1, unitPriceCents: 47_900 },
            { minQuantity: 4, unitPriceCents: 45_500 },
            { minQuantity: 8, unitPriceCents: 43_100 },
            { minQuantity: 12, unitPriceCents: 40_700 },
          ],
          counterResponsePremiumCents: 1_400,
        },
      },
    ],
  },
  {
    id: "merchant-signal",
    displayName: "Signal Supply Co.",
    description: "Volume-focused electronics merchant willing to trade price for committed demand.",
    simulated: true,
    merchantCategoryCode: HERO_MERCHANT_CATEGORY,
    deliveryDays: 7,
    warrantyMonths: 36,
    supportedCountries: ["US"],
    inventory: [
      {
        productSku: HERO_PRODUCT.sku,
        availableQuantity: 60,
        pricing: {
          listUnitPriceCents: 47_900,
          floorUnitPriceCents: 38_900,
          quantityTiers: [
            { minQuantity: 1, unitPriceCents: 47_900 },
            { minQuantity: 4, unitPriceCents: 44_900 },
            { minQuantity: 8, unitPriceCents: 41_900 },
            { minQuantity: 12, unitPriceCents: 40_100 },
          ],
          counterResponsePremiumCents: 0,
        },
      },
    ],
  },
];

const mustHaveCoalition = (discovery: CoalitionDiscovery): BuyingCoalition => {
  if (!discovery.coalition) {
    throw new MarketInvariantError("HERO_POOL_NOT_FORMED", "The deterministic hero scenario failed to form a pool");
  }
  return discovery.coalition;
};

export const buildHeroDemo = (): HeroDemo => {
  const discovery = discoverCoalition(
    [...HERO_INTENTS, HERO_INCOMPATIBLE_INTENT],
    HERO_PRODUCTS,
    {
      poolId: "pool-dev-displays-001",
      now: HERO_CLOCK_STARTED_AT,
      minimumBuyers: 2,
    },
  );
  const coalition = mustHaveCoalition(discovery);
  const fundedCoalition = transitionPoolState(
    coalition,
    "committed",
    addSeconds(HERO_CLOCK_STARTED_AT, 30),
    "All member MSRP reservations frozen before seller discovery; commitment ready to anchor",
  );
  const marketOpen = transitionPoolState(
    fundedCoalition,
    "market_open",
    atMinute(HERO_CLOCK_STARTED_AT, 1),
    "Three seller agents invited to compete",
  );
  const negotiating = transitionPoolState(
    marketOpen,
    "negotiating",
    atMinute(HERO_CLOCK_STARTED_AT, 2),
    "Initial offers received",
  );
  const negotiation = runNegotiation({
    coalition: negotiating,
    product: HERO_PRODUCT,
    merchants: HERO_MERCHANTS,
    startedAt: atMinute(HERO_CLOCK_STARTED_AT, 1),
  });
  const policyReview = transitionPoolState(
    negotiating,
    "policy_review",
    atMinute(HERO_CLOCK_STARTED_AT, 11),
    "Winning offer selected for deterministic mandate checks",
  );
  const policy = evaluateOfferPolicies({
    offer: negotiation.winningOffer,
    coalition: policyReview,
    intents: HERO_INTENTS,
    products: HERO_PRODUCTS,
    merchants: HERO_MERCHANTS,
    now: atMinute(HERO_CLOCK_STARTED_AT, 12),
    expectedOfferId: negotiation.winningOffer.id,
    paymentRailCapCents: HERO_PAYMENT_RAIL_CAP_CENTS,
  });
  const agreement = createDealAgreement(
    negotiation.winningOffer,
    policy,
    atMinute(HERO_CLOCK_STARTED_AT, 12),
  );
  const settlementRequest: SettlementRequest = {
    idempotencyKey: "pool-dev-displays-001:settlement:v1",
    agreement,
    offer: negotiation.winningOffer,
    coalition: policyReview,
    intents: HERO_INTENTS,
    products: HERO_PRODUCTS,
    merchants: HERO_MERCHANTS,
    now: atMinute(HERO_CLOCK_STARTED_AT, 13),
    expectedOfferId: negotiation.winningOffer.id,
    paymentRailCapCents: HERO_PAYMENT_RAIL_CAP_CENTS,
  };
  const firstAuthorization = processSettlement(settlementRequest, createSettlementLedger());
  const replay = processSettlement(settlementRequest, firstAuthorization.ledger);

  const authorized = transitionPoolState(
    policyReview,
    "authorized",
    atMinute(HERO_CLOCK_STARTED_AT, 13),
    "Every buyer mandate passed; bounded payment instructions generated",
  );
  const settling = transitionPoolState(
    authorized,
    "settling",
    atMinute(HERO_CLOCK_STARTED_AT, 14),
    "Payment rail dispatch started",
  );
  const settled = transitionPoolState(
    settling,
    "settled",
    atMinute(HERO_CLOCK_STARTED_AT, 15),
    "All buyer allocations settled exactly once",
  );
  const lifecycle = transitionPoolState(
    settled,
    "dissolved",
    atMinute(HERO_CLOCK_STARTED_AT, 16),
    "The temporary coalition completed its purpose",
  );

  const overBudgetOffer: MerchantOffer = {
    ...negotiation.winningOffer,
    id: offerId(coalition.id, negotiation.winningOffer.merchantId, 3),
    revision: 3,
    supersedesOfferId: negotiation.winningOffer.id,
    unitPriceCents: 42_900,
    totalCents: 42_900 * coalition.totalQuantity,
    issuedAt: atMinute(HERO_CLOCK_STARTED_AT, 13),
    validUntil: atMinute(HERO_CLOCK_STARTED_AT, 25),
    status: "active",
  };
  const overBudgetPolicy = evaluateOfferPolicies({
    offer: overBudgetOffer,
    coalition: policyReview,
    intents: HERO_INTENTS,
    products: HERO_PRODUCTS,
    merchants: HERO_MERCHANTS,
    now: atMinute(HERO_CLOCK_STARTED_AT, 14),
    expectedOfferId: overBudgetOffer.id,
    paymentRailCapCents: HERO_PAYMENT_RAIL_CAP_CENTS,
  });

  const tamperedOffer: MerchantOffer = {
    ...negotiation.winningOffer,
    unitPriceCents: 69_000,
    totalCents: 69_000 * coalition.totalQuantity,
  };
  const tamperedDecision = processSettlement(
    {
      ...settlementRequest,
      idempotencyKey: "pool-dev-displays-001:tampered-attempt",
      offer: tamperedOffer,
    },
    createSettlementLedger(),
  ).decision;
  const staleDecision = processSettlement(
    {
      ...settlementRequest,
      idempotencyKey: "pool-dev-displays-001:stale-attempt",
      now: atMinute(HERO_CLOCK_STARTED_AT, 30),
    },
    createSettlementLedger(),
  ).decision;

  return {
    clockStartedAt: HERO_CLOCK_STARTED_AT,
    product: HERO_PRODUCT,
    intents: HERO_INTENTS,
    publicIntents: HERO_INTENTS.map(toPublicIntent),
    incompatibleIntent: HERO_INCOMPATIBLE_INTENT,
    publicIncompatibleIntent: toPublicIntent(HERO_INCOMPATIBLE_INTENT),
    discovery,
    coalition,
    fundedCoalition,
    lifecycle,
    merchants: HERO_MERCHANTS.map(toPublicMerchant),
    negotiation,
    policy,
    agreement,
    outcome: calculateOutcomeMetrics({
      product: HERO_PRODUCT,
      coalition,
      intents: HERO_INTENTS,
      winningOffer: negotiation.winningOffer,
      merchantCount: HERO_MERCHANTS.length,
      paymentRailCapCents: HERO_PAYMENT_RAIL_CAP_CENTS,
    }),
    authorization: firstAuthorization.decision,
    idempotentReplay: replay.decision,
    safety: {
      overBudgetOffer,
      overBudgetPolicy,
      tamperedOffer,
      tamperedDecision,
      staleDecision,
    },
  };
};

/** A fresh, fully deterministic replay snapshot for the UI and API routes. */
export const HERO_DEMO: HeroDemo = buildHeroDemo();
