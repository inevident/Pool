import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  toBytes,
  zeroHash,
  type Hex,
} from "viem";

import { HERO_FUNDING } from "../funding/index.ts";
import { HERO_DEMO, type MerchantOffer } from "../market/index.ts";

const TERMS_DOMAIN = keccak256(toBytes("POOL_TERMS_V1"));
const FUNDING_LEAF_DOMAIN = keccak256(toBytes("POOL_FUNDING_LEAF_V1"));
const OFFER_DOMAIN = keccak256(toBytes("POOL_SEALED_OFFER_V1"));
const RAIN_SETTLEMENT_DOMAIN = keccak256(toBytes("POOL_RAIN_SETTLEMENT_V1"));

const hashText = (value: string): Hex =>
  keccak256(toBytes(value.normalize("NFKC")));

const asUnixSeconds = (value: string, label: string): bigint => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new MonadCommitmentError("INVALID_TIMESTAMP", `${label} must be a valid ISO timestamp.`);
  }
  return BigInt(Math.floor(milliseconds / 1_000));
};

const requireCents = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MonadCommitmentError("INVALID_AMOUNT", `${label} must be positive integer cents.`);
  }
};

export class MonadCommitmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MonadCommitmentError";
    this.code = code;
  }
}

export interface PreparedCoalitionCommitment {
  readonly poolId: string;
  readonly poolIdHash: Hex;
  readonly productSku: string;
  readonly termsHash: Hex;
  readonly fundingRoot: Hex;
  readonly unitCount: number;
  readonly reservedCents: bigint;
  readonly bidClosesAt: bigint;
  /** Present only for a live proof reconstructed from finalized Monad state. */
  readonly finalizedCommittedAt: string | null;
  readonly latestFundingFreezeAt: string;
  readonly firstOfferIssuedAt: string;
  readonly preBidFundingGatePassed: true;
  readonly offerHashes: readonly Hex[];
  readonly winningOfferHash: Hex;
}

export interface HeroCoalitionCommitmentOptions {
  readonly bidClosesAt?: string;
  /**
   * Finalized onchain timestamp for the coalition commitment. When supplied,
   * the seller timeline is deterministically shifted to begin one second later.
   * Omitting it intentionally preserves the fixed local evidence replay.
   */
  readonly finalizedCommittedAt?: bigint;
}

interface FundingLeafInput {
  readonly poolId: string;
  readonly intentId: string;
  readonly buyerId: string;
  readonly productSku: string;
  readonly quantity: number;
  readonly msrpUnitCents: number;
  readonly reservedCents: number;
  readonly frozenAt: string;
}

export function hashFundingLeaf(input: FundingLeafInput): Hex {
  requireCents(input.quantity, "Reservation quantity");
  requireCents(input.msrpUnitCents, "Reservation MSRP");
  requireCents(input.reservedCents, "Reservation amount");

  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint64" },
      ],
      [
        FUNDING_LEAF_DOMAIN,
        hashText(input.poolId),
        hashText(input.intentId),
        hashText(input.buyerId),
        hashText(input.productSku),
        input.quantity,
        BigInt(input.msrpUnitCents),
        BigInt(input.reservedCents),
        asUnixSeconds(input.frozenAt, "Reservation freeze time"),
      ],
    ),
  );
}

/**
 * Builds a deterministic, sorted Merkle root. Odd leaves are promoted unchanged,
 * and each pair is sorted so proofs cannot depend on private buyer ordering.
 */
export function buildFundingRoot(leaves: readonly Hex[]): Hex {
  if (leaves.length === 0) {
    throw new MonadCommitmentError("EMPTY_FUNDING_SET", "A commitment needs at least one funding proof.");
  }

  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1];
      if (!right) {
        next.push(left);
        continue;
      }
      const [first, second] = left < right ? [left, right] : [right, left];
      next.push(keccak256(concatHex([first, second])));
    }
    level = next;
  }
  return level[0];
}

export function hashSealedMerchantOffer(
  termsHash: Hex,
  offer: MerchantOffer,
): Hex {
  requireCents(offer.quantity, "Offer quantity");
  requireCents(offer.unitPriceCents, "Offer unit price");
  requireCents(offer.totalCents, "Offer total");
  if (!Number.isSafeInteger(offer.shippingCents) || offer.shippingCents < 0) {
    throw new MonadCommitmentError("INVALID_AMOUNT", "Offer shipping must be non-negative integer cents.");
  }

  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint64" },
        { type: "uint64" },
      ],
      [
        OFFER_DOMAIN,
        termsHash,
        hashText(offer.id),
        hashText(offer.merchantId),
        hashText(offer.productSku),
        offer.revision,
        offer.supersedesOfferId ? hashText(offer.supersedesOfferId) : zeroHash,
        offer.quantity,
        BigInt(offer.unitPriceCents),
        BigInt(offer.shippingCents),
        BigInt(offer.totalCents),
        hashText(`${offer.currency}|${offer.deliveryDate}`),
        offer.warrantyMonths,
        asUnixSeconds(offer.issuedAt, "Offer issue time"),
        asUnixSeconds(offer.validUntil, "Offer expiry"),
      ],
    ),
  );
}

export function hashRainSettlement(input: {
  readonly commitmentId: Hex;
  readonly acceptedOfferHash: Hex;
  readonly rainTransactionIds: readonly string[];
}): Hex {
  if (input.rainTransactionIds.length === 0) {
    throw new MonadCommitmentError(
      "EMPTY_RAIN_SETTLEMENT",
      "Settlement attestation requires at least one Rain transaction identifier.",
    );
  }
  const transactionSetHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32[]" }],
      [input.rainTransactionIds.map(hashText).sort() as Hex[]],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
      [
        RAIN_SETTLEMENT_DOMAIN,
        input.commitmentId,
        input.acceptedOfferHash,
        transactionSetHash,
      ],
    ),
  );
}

const isoFromUnixSeconds = (seconds: bigint, label: string) => {
  const milliseconds = Number(seconds) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new MonadCommitmentError(
      "INVALID_TIMESTAMP",
      `${label} is outside the supported JavaScript timestamp range.`,
    );
  }
  return new Date(milliseconds).toISOString();
};

const shiftDateByMilliseconds = (value: string, milliseconds: number) => {
  const shifted = new Date(Date.parse(`${value}T00:00:00.000Z`) + milliseconds);
  if (!Number.isFinite(shifted.getTime())) {
    throw new MonadCommitmentError(
      "INVALID_TIMESTAMP",
      "Offer delivery date could not be shifted onto the finalized timeline.",
    );
  }
  return shifted.toISOString().slice(0, 10);
};

/**
 * Re-times the deterministic hero auction without changing its economics or
 * relative sequencing. The first offer is issued one second after the
 * finalized coalition timestamp; later offers retain their fixture offsets.
 */
export function buildHeroOffersAfterFinalizedCommitment(
  finalizedCommittedAt: bigint,
): {
  readonly allOffers: readonly MerchantOffer[];
  readonly winningOffer: MerchantOffer;
  readonly firstOfferIssuedAt: string;
} {
  if (finalizedCommittedAt <= BigInt(0)) {
    throw new MonadCommitmentError(
      "INVALID_COMMITMENT_TIME",
      "Finalized commitment time must be a positive Unix timestamp.",
    );
  }

  const fixtureOffers = [
    ...HERO_DEMO.negotiation.initialOffers,
    ...HERO_DEMO.negotiation.finalOffers,
  ];
  const fixtureFirstMilliseconds = Math.min(
    ...fixtureOffers.map((offer) => Date.parse(offer.issuedAt)),
  );
  const runtimeFirstMilliseconds = Number(finalizedCommittedAt + BigInt(1)) * 1_000;
  if (
    !Number.isSafeInteger(runtimeFirstMilliseconds) ||
    !Number.isFinite(fixtureFirstMilliseconds)
  ) {
    throw new MonadCommitmentError(
      "INVALID_TIMESTAMP",
      "The finalized offer timeline is outside the supported timestamp range.",
    );
  }
  const timelineShiftMilliseconds =
    runtimeFirstMilliseconds - fixtureFirstMilliseconds;
  const fixtureFirstDate = new Date(fixtureFirstMilliseconds)
    .toISOString()
    .slice(0, 10);
  const runtimeFirstDate = new Date(runtimeFirstMilliseconds)
    .toISOString()
    .slice(0, 10);
  const deliveryDateShiftMilliseconds =
    Date.parse(`${runtimeFirstDate}T00:00:00.000Z`) -
    Date.parse(`${fixtureFirstDate}T00:00:00.000Z`);

  const retime = (offer: MerchantOffer): MerchantOffer => {
    const issuedAtMilliseconds =
      Date.parse(offer.issuedAt) + timelineShiftMilliseconds;
    const validUntilMilliseconds =
      Date.parse(offer.validUntil) + timelineShiftMilliseconds;
    if (
      !Number.isFinite(issuedAtMilliseconds) ||
      !Number.isFinite(validUntilMilliseconds)
    ) {
      throw new MonadCommitmentError(
        "INVALID_TIMESTAMP",
        "The seller offer timeline contains an invalid timestamp.",
      );
    }
    return {
      ...offer,
      deliveryDate: shiftDateByMilliseconds(
        offer.deliveryDate,
        deliveryDateShiftMilliseconds,
      ),
      issuedAt: new Date(issuedAtMilliseconds).toISOString(),
      validUntil: new Date(validUntilMilliseconds).toISOString(),
    };
  };

  const allOffers = fixtureOffers.map(retime);
  const winningOffer = allOffers.find(
    (offer) => offer.id === HERO_DEMO.negotiation.winningOffer.id,
  );
  if (!winningOffer) {
    throw new MonadCommitmentError(
      "WINNING_OFFER_MISSING",
      "The winning offer could not be reconstructed on the finalized timeline.",
    );
  }

  return {
    allOffers,
    winningOffer,
    firstOfferIssuedAt: isoFromUnixSeconds(
      finalizedCommittedAt + BigInt(1),
      "First live offer time",
    ),
  };
}

export function buildHeroCoalitionCommitment(
  input: HeroCoalitionCommitmentOptions = {},
): PreparedCoalitionCommitment {
  const frozenReservations = HERO_FUNDING.frozenReservations;
  if (
    frozenReservations.length === 0 ||
    frozenReservations.some((reservation) => reservation.state !== "frozen" || !reservation.frozenAt)
  ) {
    throw new MonadCommitmentError(
      "FUNDING_NOT_FROZEN",
      "Every coalition reservation must be frozen before the Monad commitment is built.",
    );
  }

  const latestFundingFreezeAt = frozenReservations
    .map((reservation) => reservation.frozenAt as string)
    .sort()
    .at(-1) as string;
  const fixtureOffers = [
    ...HERO_DEMO.negotiation.initialOffers,
    ...HERO_DEMO.negotiation.finalOffers,
  ];
  const finalizedTimeline =
    input.finalizedCommittedAt === undefined
      ? undefined
      : buildHeroOffersAfterFinalizedCommitment(input.finalizedCommittedAt);
  const allOffers = finalizedTimeline?.allOffers ?? fixtureOffers;
  const winningOffer =
    finalizedTimeline?.winningOffer ?? HERO_DEMO.negotiation.winningOffer;
  const firstOfferIssuedAt =
    finalizedTimeline?.firstOfferIssuedAt ??
    allOffers.map((offer) => offer.issuedAt).sort()[0];
  if (asUnixSeconds(latestFundingFreezeAt, "Funding freeze") >= asUnixSeconds(firstOfferIssuedAt, "First offer")) {
    throw new MonadCommitmentError(
      "PRE_BID_GATE_FAILED",
      "Coalition funding must be frozen before the first seller offer is issued.",
    );
  }

  const unitCount = frozenReservations.reduce(
    (total, reservation) => total + reservation.quantity,
    0,
  );
  const reservedCents = frozenReservations.reduce(
    (total, reservation) => total + reservation.reservedCents,
    0,
  );
  if (
    unitCount !== HERO_DEMO.coalition.totalQuantity ||
    reservedCents !== HERO_DEMO.outcome.baselineTotalCents
  ) {
    throw new MonadCommitmentError(
      "FUNDING_MARKET_MISMATCH",
      "The frozen funding set does not reconcile to the advertised coalition.",
    );
  }

  const bidClosesAt = input.bidClosesAt ?? "2026-08-08T17:11:00.000Z";
  if (
    input.finalizedCommittedAt !== undefined &&
    input.finalizedCommittedAt >= asUnixSeconds(firstOfferIssuedAt, "First offer")
  ) {
    throw new MonadCommitmentError(
      "POST_COMMIT_OFFER_GATE_FAILED",
      "Live seller offers must be issued after the finalized coalition commitment.",
    );
  }
  if (asUnixSeconds(firstOfferIssuedAt, "First offer") >= asUnixSeconds(bidClosesAt, "Bid close")) {
    throw new MonadCommitmentError(
      "OFFER_WINDOW_CLOSED",
      "The first seller offer must be issued before the bid window closes.",
    );
  }
  const requirement = HERO_DEMO.intents[0].demand.requirement;
  const termsHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint128" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint64" },
      ],
      [
        TERMS_DOMAIN,
        hashText(HERO_DEMO.coalition.id),
        hashText(HERO_DEMO.product.sku),
        hashText(HERO_DEMO.product.currency),
        unitCount,
        BigInt(reservedCents),
        hashText(
          [
            requirement.formFactor,
            requirement.minResolution.widthPixels,
            requirement.minResolution.heightPixels,
            [...(requirement.requiredPorts ?? [])].sort().join(","),
            requirement.minUsbPowerDeliveryWatts ?? 0,
            requirement.requireVesaMount ? 1 : 0,
          ].join("|"),
        ),
        hashText(HERO_DEMO.intents.map((intent) => intent.demand.deliverBy).sort()[0]),
        Math.max(...HERO_DEMO.intents.map((intent) => intent.demand.minWarrantyMonths)),
        asUnixSeconds(bidClosesAt, "Bid close"),
      ],
    ),
  );

  const fundingRoot = buildFundingRoot(
    frozenReservations.map((reservation) =>
      hashFundingLeaf({
        poolId: reservation.poolId,
        intentId: reservation.intentId,
        buyerId: reservation.buyerId,
        productSku: reservation.productSku,
        quantity: reservation.quantity,
        msrpUnitCents: reservation.msrpUnitCents,
        reservedCents: reservation.reservedCents,
        frozenAt: reservation.frozenAt as string,
      }),
    ),
  );
  const offerHashes = allOffers.map((offer) => hashSealedMerchantOffer(termsHash, offer));
  const winningOfferHash = hashSealedMerchantOffer(
    termsHash,
    winningOffer,
  );

  return {
    poolId: HERO_DEMO.coalition.id,
    poolIdHash: hashText(HERO_DEMO.coalition.id),
    productSku: HERO_DEMO.product.sku,
    termsHash,
    fundingRoot,
    unitCount,
    reservedCents: BigInt(reservedCents),
    bidClosesAt: asUnixSeconds(bidClosesAt, "Bid close"),
    finalizedCommittedAt:
      input.finalizedCommittedAt === undefined
        ? null
        : isoFromUnixSeconds(
            input.finalizedCommittedAt,
            "Finalized commitment time",
          ),
    latestFundingFreezeAt,
    firstOfferIssuedAt,
    preBidFundingGatePassed: true,
    offerHashes,
    winningOfferHash,
  };
}

/** Fixed, offline evidence replay. Live writes must use finalizedCommittedAt. */
export const HERO_MONAD_COMMITMENT = buildHeroCoalitionCommitment();
