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
  readonly latestFundingFreezeAt: string;
  readonly firstOfferIssuedAt: string;
  readonly preBidFundingGatePassed: true;
  readonly offerHashes: readonly Hex[];
  readonly winningOfferHash: Hex;
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

export function buildHeroCoalitionCommitment(input?: {
  readonly bidClosesAt?: string;
}): PreparedCoalitionCommitment {
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
  const allOffers = [
    ...HERO_DEMO.negotiation.initialOffers,
    ...HERO_DEMO.negotiation.finalOffers,
  ];
  const firstOfferIssuedAt = allOffers.map((offer) => offer.issuedAt).sort()[0];
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

  const bidClosesAt = input?.bidClosesAt ?? "2026-08-08T17:11:00.000Z";
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
    HERO_DEMO.negotiation.winningOffer,
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
    latestFundingFreezeAt,
    firstOfferIssuedAt,
    preBidFundingGatePassed: true,
    offerHashes,
    winningOfferHash,
  };
}

export const HERO_MONAD_COMMITMENT = buildHeroCoalitionCommitment();
