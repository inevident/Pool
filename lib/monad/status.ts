import { zeroHash, type Hex } from "viem";

import { HERO_DEMO } from "../market/index.ts";
import { HERO_MONAD_COMMITMENT } from "./commitment.ts";
import {
  createMonadPublicClient,
  getConfiguredCommitmentId,
  getMonadRegistryAddress,
  MonadRegistryError,
} from "./server.ts";
import {
  MONAD_TESTNET,
  MONAD_TESTNET_RESET_AT,
  POOL_COMMITMENT_REGISTRY_ABI,
  monadExplorerAddressUrl,
} from "./registry.ts";
import { getRuntimeMonadPreparation } from "./runtime.ts";

const isoFromSeconds = (seconds: bigint) =>
  new Date(Number(seconds) * 1_000).toISOString();

const baseStatus = () => ({
  network: {
    name: MONAD_TESTNET.name,
    chainId: MONAD_TESTNET.id,
    explorerUrl: MONAD_TESTNET.blockExplorers.default.url,
    testnet: true as const,
    resetFromGenesisAt: MONAD_TESTNET_RESET_AT,
  },
  purpose: {
    beforeBidding: "Anchor the frozen MSRP-backed coalition and public RFP terms.",
    duringBidding: "Register sealed offer hashes without publishing merchant prices.",
    afterRain: "Attest the exact Rain transaction set against the accepted offer.",
  },
  localProof: {
    poolId: HERO_MONAD_COMMITMENT.poolId,
    productSku: HERO_MONAD_COMMITMENT.productSku,
    termsHash: HERO_MONAD_COMMITMENT.termsHash,
    fundingRoot: HERO_MONAD_COMMITMENT.fundingRoot,
    winningOfferHash: HERO_MONAD_COMMITMENT.winningOfferHash,
    unitCount: HERO_MONAD_COMMITMENT.unitCount,
    reservedInCents: Number(HERO_MONAD_COMMITMENT.reservedCents),
    capturedInCents: HERO_DEMO.outcome.pooledTotalCents,
    releasedInCents: HERO_DEMO.outcome.totalSavingsCents,
    latestFundingFreezeAt: HERO_MONAD_COMMITMENT.latestFundingFreezeAt,
    firstOfferIssuedAt: HERO_MONAD_COMMITMENT.firstOfferIssuedAt,
    preBidFundingGatePassed: HERO_MONAD_COMMITMENT.preBidFundingGatePassed,
  },
});

export async function getMonadStatus() {
  const base = baseStatus();
  const registryAddress = getMonadRegistryAddress();
  if (!registryAddress) {
    return {
      ...base,
      mode: "local-proof" as const,
      state: "registry-not-deployed" as const,
      confirmation: "not-onchain" as const,
      registryAddress: null,
      registryExplorerUrl: null,
      commitmentId: null,
      message:
        "Contract and causal hashes are verified locally. Deploy to Monad Testnet to publish explorer proof.",
    };
  }

  const publicClient = createMonadPublicClient();
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_TESTNET.id) {
    throw new MonadRegistryError(
      "WRONG_CHAIN",
      `RPC reported chain ${chainId}; only Monad Testnet ${MONAD_TESTNET.id} is allowed.`,
    );
  }
  const bytecode = await publicClient.getCode({
    address: registryAddress,
    blockTag: "finalized",
  });
  if (!bytecode || bytecode === "0x") {
    throw new MonadRegistryError(
      "REGISTRY_CODE_MISSING",
      "No finalized contract bytecode exists at MONAD_REGISTRY_ADDRESS.",
    );
  }

  // Runtime state improves same-isolate presentation only. Financial routes
  // reconstruct today's proof from finalized chain state instead.
  const commitmentId =
    getConfiguredCommitmentId() ?? getRuntimeMonadPreparation()?.commitmentId;
  if (!commitmentId) {
    return {
      ...base,
      mode: "monad-testnet" as const,
      state: "registry-deployed" as const,
      confirmation: "finalized-state" as const,
      registryAddress,
      registryExplorerUrl: monadExplorerAddressUrl(registryAddress),
      commitmentId: null,
      message:
        "Registry bytecode is finalized on Monad Testnet; no demo commitment ID is configured yet.",
    };
  }

  const commitment = await publicClient.readContract({
    address: registryAddress,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "getCommitment",
    args: [commitmentId],
    blockTag: "finalized",
  });
  const runtimePreparation = getRuntimeMonadPreparation();
  const expected =
    runtimePreparation?.commitmentId === commitmentId
      ? runtimePreparation.commitment
      : undefined;
  const offerRegistered = expected
    ? await publicClient.readContract({
        address: registryAddress,
        abi: POOL_COMMITMENT_REGISTRY_ABI,
        functionName: "isOfferRegistered",
        args: [commitmentId, expected.winningOfferHash],
        blockTag: "finalized",
      })
    : null;
  const termsMatchPrepared = expected
    ? commitment.poolIdHash === expected.poolIdHash &&
      commitment.termsHash === expected.termsHash &&
      commitment.fundingRoot === expected.fundingRoot &&
      commitment.unitCount === expected.unitCount &&
      commitment.reservedCents === expected.reservedCents
    : null;
  const settled = commitment.settledAt > BigInt(0);

  return {
    ...base,
    mode: "monad-testnet" as const,
    state: settled
      ? ("rain-settlement-attested" as const)
      : offerRegistered === true
        ? ("offer-registered" as const)
        : ("coalition-committed" as const),
    confirmation: "finalized-state" as const,
    registryAddress,
    registryExplorerUrl: monadExplorerAddressUrl(registryAddress),
    commitmentId,
    termsMatchPrepared,
    offerRegistered,
    onchainProof: {
      termsHash: commitment.termsHash,
      fundingRoot: commitment.fundingRoot,
      acceptedOfferHash:
        commitment.acceptedOfferHash === zeroHash
          ? null
          : (commitment.acceptedOfferHash as Hex),
      rainSettlementHash:
        commitment.rainSettlementHash === zeroHash
          ? null
          : (commitment.rainSettlementHash as Hex),
      unitCount: commitment.unitCount,
      reservedInCents: Number(commitment.reservedCents),
      capturedInCents: Number(commitment.capturedCents),
      releasedInCents: Number(commitment.reservedCents - commitment.capturedCents),
      committedAt: isoFromSeconds(commitment.committedAt),
      bidClosesAt: isoFromSeconds(commitment.bidClosesAt),
      settledAt: settled ? isoFromSeconds(commitment.settledAt) : null,
    },
    message: settled
      ? "Finalized Monad state binds the funded coalition, winning sealed offer, and Rain settlement."
      : "Finalized Monad state proves the funded coalition existed before the registered offer.",
  };
}
