import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";
import { getAddress, keccak256, toBytes, zeroHash } from "viem";

describe("PoolCommitmentRegistry", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [operator, outsider] = await viem.getWalletClients();

  const poolIdHash = keccak256(toBytes("pool-dev-displays-001"));
  const termsHash = keccak256(toBytes("display|27|4k|ips|usb-c|12"));
  const fundingRoot = keccak256(toBytes("three-frozen-msrp-reservations"));
  const winningOfferHash = keccak256(toBytes("signal-supply|rev-2|38900"));
  const rainSettlementHash = keccak256(toBytes("rain:txn-1|txn-2|txn-3"));

  async function fixture() {
    const registry = await viem.deployContract("PoolCommitmentRegistry", [
      operator.account.address,
    ]);
    const block = await publicClient.getBlock();
    const bidClosesAt = block.timestamp + BigInt(3_600);
    const args = [
      poolIdHash,
      termsHash,
      fundingRoot,
      12,
      BigInt(574_800),
      bidClosesAt,
    ] as const;
    const commitmentId = await registry.read.computeCommitmentId(args);

    return { registry, args, commitmentId };
  }

  it("anchors funded terms before allowing a sealed merchant offer", async () => {
    const { registry, args, commitmentId } = await fixture();

    await viem.assertions.emitWithArgs(
      registry.write.commitCoalition(args),
      registry,
      "CoalitionCommitted",
      [
        commitmentId,
        poolIdHash,
        termsHash,
        fundingRoot,
        12,
        BigInt(574_800),
        anyValue,
        args[5],
      ],
    );

    assert.equal(
      await registry.read.isOfferRegistered([commitmentId, winningOfferHash]),
      false,
    );

    await viem.assertions.emitWithArgs(
      registry.write.registerMerchantOffer([commitmentId, winningOfferHash]),
      registry,
      "MerchantOfferRegistered",
      [commitmentId, winningOfferHash, anyValue],
    );

    assert.equal(
      await registry.read.isOfferRegistered([commitmentId, winningOfferHash]),
      true,
    );
  });

  it("binds settlement to a registered offer and releases only the savings", async () => {
    const { registry, args, commitmentId } = await fixture();
    await registry.write.commitCoalition(args);
    await registry.write.registerMerchantOffer([commitmentId, winningOfferHash]);

    await assert.rejects(
      registry.write.attestRainSettlement([
        commitmentId,
        winningOfferHash,
        rainSettlementHash,
        BigInt(574_801),
      ]),
      /CaptureExceedsReservation/,
    );

    await viem.assertions.emitWithArgs(
      registry.write.attestRainSettlement([
        commitmentId,
        winningOfferHash,
        rainSettlementHash,
        BigInt(466_800),
      ]),
      registry,
      "RainSettlementAttested",
      [
        commitmentId,
        winningOfferHash,
        rainSettlementHash,
        BigInt(466_800),
        BigInt(108_000),
        anyValue,
      ],
    );

    const commitment = await registry.read.getCommitment([commitmentId]);
    assert.equal(commitment.acceptedOfferHash, winningOfferHash);
    assert.equal(commitment.rainSettlementHash, rainSettlementHash);
    assert.equal(commitment.capturedCents, BigInt(466_800));
    assert.ok(commitment.settledAt > BigInt(0));

    await assert.rejects(
      registry.write.attestRainSettlement([
        commitmentId,
        winningOfferHash,
        rainSettlementHash,
        BigInt(466_800),
      ]),
      /CommitmentAlreadySettled/,
    );
  });

  it("fails closed for unauthorised, missing, duplicate, and unregistered writes", async () => {
    const { registry, args, commitmentId } = await fixture();

    await assert.rejects(
      outsider.writeContract({
        address: registry.address,
        abi: registry.abi,
        functionName: "commitCoalition",
        args,
      }),
      /Unauthorized/,
    );

    await registry.write.commitCoalition(args);
    await assert.rejects(registry.write.commitCoalition(args), /CommitmentAlreadyExists/);
    await assert.rejects(
      registry.write.registerMerchantOffer([commitmentId, zeroHash]),
      /InvalidOfferHash/,
    );
    await assert.rejects(
      registry.write.attestRainSettlement([
        commitmentId,
        winningOfferHash,
        rainSettlementHash,
        BigInt(466_800),
      ]),
      /OfferNotRegistered/,
    );
  });

  it("will not accept a seller offer after the committed bid window closes", async () => {
    const { registry, args, commitmentId } = await fixture();
    await registry.write.commitCoalition(args);
    const testClient = await viem.getTestClient();
    await testClient.increaseTime({ seconds: 3_601 });
    await testClient.mine({ blocks: 1 });

    await assert.rejects(
      registry.write.registerMerchantOffer([commitmentId, winningOfferHash]),
      /BidWindowClosed/,
    );
  });

  it("supports explicit two-step operator rotation", async () => {
    const { registry } = await fixture();
    await registry.write.nominateOperator([outsider.account.address]);

    await outsider.writeContract({
      address: registry.address,
      abi: registry.abi,
      functionName: "acceptOperator",
    });

    assert.equal(await registry.read.operator(), getAddress(outsider.account.address));
    assert.equal(await registry.read.pendingOperator(),
      "0x0000000000000000000000000000000000000000");
  });
});
