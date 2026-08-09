import { encodeAbiParameters, keccak256, toBytes, type Hex } from "viem";

import { buildFundingRoot, hashFundingLeaf, MonadCommitmentError } from "./commitment.ts";
import type { ConsumerOffer } from "../market/consumer.ts";
import { evaluateProductPoolFunding } from "../product/reducer.ts";
import type { ProductListing, ProductPool } from "../product/types.ts";

const PRODUCT_TERMS_DOMAIN = keccak256(toBytes("POOL_PRODUCT_TERMS_V1"));
const CONSUMER_OFFER_DOMAIN = keccak256(toBytes("POOL_CONSUMER_OFFER_V1"));

const hashText = (value: string): Hex =>
  keccak256(toBytes(value.normalize("NFKC")));

/** Exposed so a settlement can check a finalized commitment names this pool. */
export const hashProductPoolId = hashText;

const asUnixSeconds = (value: string, label: string): bigint => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new MonadCommitmentError(
      "INVALID_TIMESTAMP",
      `${label} must be a valid ISO timestamp.`,
    );
  }
  return BigInt(Math.floor(milliseconds / 1_000));
};

/**
 * One buyer's frozen reservation inside a product coalition.
 *
 * Seeded pool members are deterministic fixtures rather than human users. They
 * are still POOL ledger records, so they belong in the funding root — but the
 * product must never describe them as verified customers.
 */
export interface ProductReservationLeaf {
  readonly buyerId: string;
  readonly intentId: string;
  readonly quantity: number;
  readonly reservedCents: number;
}

/**
 * Expands a pool into the reservation set backing its funded-demand claim: the
 * seeded fixture members plus the real buyer's own commitment.
 *
 * Deterministic, so the same pool and quantity always rebuild the same root and
 * a verifier can reproduce it from public seed data plus the buyer's disclosure.
 */
export function productReservationSet(input: {
  readonly pool: ProductPool;
  readonly product: ProductListing;
  readonly buyerId: string;
  readonly buyerIntentId: string;
  readonly buyerQuantity: number;
}): readonly ProductReservationLeaf[] {
  if (!Number.isSafeInteger(input.buyerQuantity) || input.buyerQuantity <= 0) {
    throw new MonadCommitmentError(
      "INVALID_QUANTITY",
      "Buyer quantity must be a positive integer.",
    );
  }

  const seeded = Array.from({ length: input.pool.committedUnitCount }, (_, index) => ({
    buyerId: `${input.pool.id}-seed-buyer-${index + 1}`,
    intentId: `${input.pool.id}-seed-intent-${index + 1}`,
    quantity: 1,
    reservedCents: input.product.msrpUnitCents,
  }));

  return [
    ...seeded,
    {
      buyerId: input.buyerId,
      intentId: input.buyerIntentId,
      quantity: input.buyerQuantity,
      reservedCents: input.product.msrpUnitCents * input.buyerQuantity,
    },
  ];
}

export interface PreparedProductCommitment {
  readonly poolId: string;
  readonly poolIdHash: Hex;
  readonly productSku: string;
  readonly termsHash: Hex;
  readonly fundingRoot: Hex;
  readonly unitCount: number;
  readonly reservedCents: bigint;
  readonly bidClosesAt: bigint;
  readonly frozenAt: string;
}

/**
 * Builds the pre-bid commitment for a product pool.
 *
 * `termsHash` binds the public terms sellers will compete against; `fundingRoot`
 * is a Merkle root over the private reservation records. Neither reveals a buyer
 * ceiling or a merchant floor — the chain records that funded demand of this
 * exact shape existed, not what anyone was willing to pay.
 */
export function buildProductPoolCommitment(input: {
  readonly pool: ProductPool;
  readonly product: ProductListing;
  readonly reservations: readonly ProductReservationLeaf[];
  readonly frozenAt: string;
  readonly bidClosesAt: string;
}): PreparedProductCommitment {
  if (input.reservations.length === 0) {
    throw new MonadCommitmentError(
      "EMPTY_FUNDING_SET",
      "A product commitment needs at least one frozen reservation.",
    );
  }

  const unitCount = input.reservations.reduce(
    (total, entry) => total + entry.quantity,
    0,
  );
  const fundingStatus = evaluateProductPoolFunding({
    pool: input.pool,
    aggregateFundedUnitCount: unitCount,
  });
  if (!fundingStatus.hasMetMinimum) {
    throw new MonadCommitmentError(
      "MINIMUM_FUNDED_UNITS_NOT_MET",
      `The pool has ${unitCount} funded units; at least ${fundingStatus.minimumCommittedUnitCount} are required before demand can be committed.`,
    );
  }
  const reservedCents = input.reservations.reduce(
    (total, entry) => total + entry.reservedCents,
    0,
  );
  if (reservedCents !== input.product.msrpUnitCents * unitCount) {
    throw new MonadCommitmentError(
      "FUNDING_MARKET_MISMATCH",
      "The reservation set does not reconcile to full MSRP coverage.",
    );
  }

  const frozenSeconds = asUnixSeconds(input.frozenAt, "Funding freeze");
  const bidCloseSeconds = asUnixSeconds(input.bidClosesAt, "Bid close");
  if (bidCloseSeconds <= frozenSeconds) {
    throw new MonadCommitmentError(
      "OFFER_WINDOW_CLOSED",
      "The bid window must close after the funding freeze.",
    );
  }

  const termsHash = keccak256(
    encodeAbiParameters(
      [
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
        PRODUCT_TERMS_DOMAIN,
        hashText(input.pool.id),
        hashText(input.product.id),
        hashText(input.product.currency),
        unitCount,
        BigInt(reservedCents),
        BigInt(input.pool.estimatedUnitPriceCents),
        bidCloseSeconds,
      ],
    ),
  );

  const fundingRoot = buildFundingRoot(
    input.reservations.map((entry) =>
      hashFundingLeaf({
        poolId: input.pool.id,
        intentId: entry.intentId,
        buyerId: entry.buyerId,
        productSku: input.product.id,
        quantity: entry.quantity,
        msrpUnitCents: input.product.msrpUnitCents,
        reservedCents: entry.reservedCents,
        frozenAt: input.frozenAt,
      }),
    ),
  );

  return {
    poolId: input.pool.id,
    poolIdHash: hashText(input.pool.id),
    productSku: input.product.id,
    termsHash,
    fundingRoot,
    unitCount,
    reservedCents: BigInt(reservedCents),
    bidClosesAt: bidCloseSeconds,
    frozenAt: input.frozenAt,
  };
}

/**
 * Sealed hash of a consumer merchant offer.
 *
 * The offer's terms are bound to the commitment's `termsHash` and to the moment
 * it was issued, so an offer registered on-chain cannot later be swapped for
 * different economics, and an offer built before the commitment finalized cannot
 * masquerade as one built after it.
 */
export function hashConsumerOffer(input: {
  readonly termsHash: Hex;
  readonly offer: ConsumerOffer;
  readonly quantity: number;
  readonly totalCents: number;
  readonly issuedAt: string;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint32" },
        { type: "uint32" },
        { type: "uint64" },
      ],
      [
        CONSUMER_OFFER_DOMAIN,
        input.termsHash,
        hashText(input.offer.merchantId),
        input.quantity,
        BigInt(input.offer.unitPriceCents),
        BigInt(input.totalCents),
        input.offer.deliveryDays,
        input.offer.warrantyMonths,
        asUnixSeconds(input.issuedAt, "Offer issue time"),
      ],
    ),
  );
}
