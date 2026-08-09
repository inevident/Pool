import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

import { clearConsumerMarket } from "../lib/market/consumer.ts";
import { hashRainSettlement } from "../lib/monad/commitment.ts";
import {
  buildProductPoolCommitment,
  hashConsumerOffer,
  productReservationSet,
} from "../lib/monad/product-commitment.ts";
import { createSeededProductWorkspace } from "../lib/product/index.ts";

/**
 * Executes the real product settlement lifecycle against a live EVM chain using
 * the exact values the API routes produce.
 *
 * The unit tests prove the hashes are deterministic; this proves the contract
 * actually accepts them — argument widths, the bid-window bound, and the
 * commit → register → attest ordering guards — before anything is spent on a
 * public network.
 */
describe("Product pool lifecycle on-chain", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [operator] = await viem.getWalletClients();

  const catalog = createSeededProductWorkspace();
  const pool = catalog.pools["pool-sony-xm6-august"];
  const product = catalog.products[pool.productId];
  const BUYER_QUANTITY = 1;

  async function prepare() {
    const registry = await viem.deployContract("PoolCommitmentRegistry", [
      operator.account.address,
    ]);
    const block = await publicClient.getBlock();

    // Mirror the route: freeze now, close bidding an hour later, using chain
    // time so the contract's (now, now + 30 days] window is respected.
    const frozenAt = new Date(Number(block.timestamp) * 1_000).toISOString();
    const bidClosesAt = new Date(
      (Number(block.timestamp) + 3_600) * 1_000,
    ).toISOString();

    const commitment = buildProductPoolCommitment({
      pool,
      product,
      reservations: productReservationSet({
        pool,
        product,
        buyerId: catalog.owner.id,
        buyerIntentId: `${pool.id}-live-intent`,
        buyerQuantity: BUYER_QUANTITY,
      }),
      frozenAt,
      bidClosesAt,
    });

    const args = [
      commitment.poolIdHash,
      commitment.termsHash,
      commitment.fundingRoot,
      commitment.unitCount,
      commitment.reservedCents,
      commitment.bidClosesAt,
    ] as const;

    return { registry, commitment, args };
  }

  it("accepts a real product coalition and orders commit, offer, and attestation", async () => {
    const { registry, commitment, args } = await prepare();

    const commitmentId = await registry.read.computeCommitmentId(args);
    await registry.write.commitCoalition(args);

    const stored = await registry.read.getCommitment([commitmentId]);
    assert.equal(stored.poolIdHash, commitment.poolIdHash);
    assert.equal(stored.fundingRoot, commitment.fundingRoot);
    assert.equal(stored.unitCount, commitment.unitCount);
    assert.equal(stored.reservedCents, commitment.reservedCents);
    assert.ok(stored.committedAt > BigInt(0));

    // Offers are only constructed after the commitment exists.
    const clearing = clearConsumerMarket({
      productId: product.id,
      aggregateUnits: commitment.unitCount,
      targetUnitPriceCents: pool.estimatedUnitPriceCents,
    });
    assert.equal(clearing.code, "cleared");
    const winner = clearing.winner!;
    const capturedCents = winner.unitPriceCents * BUYER_QUANTITY;

    const offerHash = hashConsumerOffer({
      termsHash: commitment.termsHash,
      offer: winner,
      quantity: BUYER_QUANTITY,
      totalCents: capturedCents,
      issuedAt: new Date(
        (Number(stored.committedAt) + 1) * 1_000,
      ).toISOString(),
    });

    await registry.write.registerMerchantOffer([commitmentId, offerHash]);
    assert.equal(
      await registry.read.isOfferRegistered([commitmentId, offerHash]),
      true,
    );

    // Rain settles, then its transaction set is bound to the winning offer.
    const rainSettlementHash = hashRainSettlement({
      commitmentId,
      acceptedOfferHash: offerHash,
      rainTransactionIds: ["1246e29b-2459-4b13-a4a4-935f83d16841"],
    });
    await registry.write.attestRainSettlement([
      commitmentId,
      offerHash,
      rainSettlementHash,
      BigInt(capturedCents),
    ]);

    const settled = await registry.read.getCommitment([commitmentId]);
    assert.equal(settled.acceptedOfferHash, offerHash);
    assert.equal(settled.rainSettlementHash, rainSettlementHash);
    assert.equal(settled.capturedCents, BigInt(capturedCents));
    assert.ok(settled.settledAt > BigInt(0));
    // The capture must never exceed what the coalition reserved.
    assert.ok(settled.capturedCents < settled.reservedCents);
  });

  it("refuses to attest an offer that was never registered", async () => {
    const { registry, commitment, args } = await prepare();
    const commitmentId = await registry.read.computeCommitmentId(args);
    await registry.write.commitCoalition(args);

    const unregistered = hashConsumerOffer({
      termsHash: commitment.termsHash,
      offer: {
        merchantId: "merchant-northstar",
        merchantName: "Northstar Direct",
        unitPriceCents: 1,
        deliveryDays: 9,
        warrantyMonths: 30,
        atFloor: false,
        meetsTarget: true,
      },
      quantity: BUYER_QUANTITY,
      totalCents: 1,
      issuedAt: new Date().toISOString(),
    });

    await assert.rejects(() =>
      registry.write.attestRainSettlement([
        commitmentId,
        unregistered,
        hashRainSettlement({
          commitmentId,
          acceptedOfferHash: unregistered,
          rainTransactionIds: ["1246e29b-2459-4b13-a4a4-935f83d16841"],
        }),
        BigInt(1),
      ]),
    );
  });
});
