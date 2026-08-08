import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  isHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  buildHeroCoalitionCommitment,
  type PreparedCoalitionCommitment,
} from "./commitment.ts";
import {
  MONAD_TESTNET,
  POOL_COMMITMENT_REGISTRY_ABI,
  monadExplorerTransactionUrl,
  type MonadFinalizedTransaction,
} from "./registry.ts";

const DEFAULT_FINALITY_TIMEOUT_MS = 30_000;
const FINALITY_POLL_MS = 400;

export class MonadRegistryError extends Error {
  readonly code: string;
  readonly transactionHash?: Hex;

  constructor(code: string, message: string, transactionHash?: Hex) {
    super(message);
    this.name = "MonadRegistryError";
    this.code = code;
    this.transactionHash = transactionHash;
  }
}

const getRpcUrl = () => {
  const value = process.env.MONAD_TESTNET_RPC_URL?.trim() ||
    MONAD_TESTNET.rpcUrls.default.http[0];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MonadRegistryError("INVALID_RPC_URL", "MONAD_TESTNET_RPC_URL is invalid.");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new MonadRegistryError(
      "INSECURE_RPC_URL",
      "Monad RPC must use HTTPS unless it is a local development endpoint.",
    );
  }
  return url.toString();
};

export function getMonadRegistryAddress(): Address | undefined {
  const value = process.env.MONAD_REGISTRY_ADDRESS?.trim();
  if (!value) return undefined;
  if (!isAddress(value) || value.toLowerCase() === zeroAddress) {
    throw new MonadRegistryError(
      "INVALID_REGISTRY_ADDRESS",
      "MONAD_REGISTRY_ADDRESS must be a valid, non-zero EVM address.",
    );
  }
  return getAddress(value);
}

export function isMonadLiveRequired() {
  return (
    (process.env.NODE_ENV === "production" &&
      process.env.RAIN_LIVE_EXECUTION_ENABLED === "true") ||
    process.env.MONAD_LIVE_REQUIRED?.trim() === "true"
  );
}

export function getMonadWriteConfiguration() {
  const registryValue = process.env.MONAD_REGISTRY_ADDRESS?.trim() ?? "";
  const privateKey = process.env.MONAD_PRIVATE_KEY?.trim() ?? "";
  const commitmentValue = process.env.MONAD_COMMITMENT_ID?.trim() ?? "";
  const requirementValue = process.env.MONAD_LIVE_REQUIRED?.trim() ?? "";
  const registryPresent = registryValue.length > 0;
  const operatorPresent = privateKey.length > 0;
  const commitmentPresent = commitmentValue.length > 0;
  const issues: Array<{ code: string; message: string }> = [];

  if (
    requirementValue.length > 0 &&
    requirementValue !== "true" &&
    requirementValue !== "false"
  ) {
    issues.push({
      code: "INVALID_MONAD_REQUIRED_FLAG",
      message: "MONAD_LIVE_REQUIRED must be exactly true or false when set.",
    });
  }

  let registryConfigured = false;
  try {
    registryConfigured = Boolean(getMonadRegistryAddress());
  } catch (error) {
    issues.push({
      code:
        error instanceof MonadRegistryError
          ? error.code
          : "INVALID_REGISTRY_ADDRESS",
      message:
        error instanceof MonadRegistryError
          ? error.message
          : "MONAD_REGISTRY_ADDRESS is invalid.",
    });
  }

  let operatorConfigured = false;
  if (operatorPresent) {
    try {
      if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("format");
      privateKeyToAccount(privateKey as Hex);
      operatorConfigured = true;
    } catch {
      issues.push({
        code: "INVALID_OPERATOR_PRIVATE_KEY",
        message: "MONAD_PRIVATE_KEY must be a valid 32-byte EVM private key.",
      });
    }
  }

  if (registryPresent !== operatorPresent) {
    issues.push({
      code: "PARTIAL_MONAD_CONFIGURATION",
      message:
        "MONAD_REGISTRY_ADDRESS and MONAD_PRIVATE_KEY must be configured together.",
    });
  }

  try {
    getRpcUrl();
  } catch (error) {
    issues.push({
      code: error instanceof MonadRegistryError ? error.code : "INVALID_RPC_URL",
      message:
        error instanceof MonadRegistryError
          ? error.message
          : "MONAD_TESTNET_RPC_URL is invalid.",
    });
  }

  if (commitmentPresent) {
    try {
      getConfiguredCommitmentId();
    } catch (error) {
      issues.push({
        code:
          error instanceof MonadRegistryError
            ? error.code
            : "INVALID_COMMITMENT_ID",
        message:
          error instanceof MonadRegistryError
            ? error.message
            : "MONAD_COMMITMENT_ID is invalid.",
      });
    }
  }

  if (commitmentPresent && (!registryPresent || !operatorPresent)) {
    issues.push({
      code: "ORPHANED_COMMITMENT_ID",
      message:
        "MONAD_COMMITMENT_ID cannot be used without the registry address and operator key.",
    });
  }

  const required = isMonadLiveRequired();
  const ready =
    issues.length === 0 && registryConfigured && operatorConfigured;
  const state = ready
    ? ("ready" as const)
    : !registryPresent && !operatorPresent && !commitmentPresent && issues.length === 0
      ? ("not-configured" as const)
      : issues.some((issue) => issue.code === "PARTIAL_MONAD_CONFIGURATION") &&
          issues.every((issue) => issue.code === "PARTIAL_MONAD_CONFIGURATION")
        ? ("partial" as const)
        : ("invalid" as const);

  return {
    ready,
    required,
    state,
    rainOnlyAllowed: !required && state === "not-configured",
    registryConfigured,
    operatorConfigured,
    issues,
    network: "Monad Testnet" as const,
    chainId: MONAD_TESTNET.id,
  };
}

export function getMonadRainGate(
  configuration = getMonadWriteConfiguration(),
) {
  const misconfigured =
    configuration.state === "partial" || configuration.state === "invalid";
  if (misconfigured || (configuration.required && !configuration.ready)) {
    return {
      allowed: false as const,
      mode: "blocked" as const,
      code:
        configuration.issues[0]?.code ?? "MONAD_CONFIGURATION_REQUIRED",
      message:
        configuration.issues[0]?.message ??
        "Monad Testnet configuration is required before Rain execution.",
    };
  }
  if (configuration.ready) {
    return {
      allowed: true as const,
      mode: "rain-plus-monad" as const,
      code: null,
      message: null,
    };
  }
  return {
    allowed: true as const,
    mode: "rain-only-development" as const,
    code: null,
    message:
      "Development-only Rain integration; Monad proof is local and no on-chain claim is made.",
  };
}

const requireRegistryAddress = () => {
  const address = getMonadRegistryAddress();
  if (!address) {
    throw new MonadRegistryError(
      "REGISTRY_NOT_CONFIGURED",
      "Deploy PoolCommitmentRegistry on Monad Testnet and set MONAD_REGISTRY_ADDRESS.",
    );
  }
  return address;
};

const getOperatorAccount = () => {
  const value = process.env.MONAD_PRIVATE_KEY?.trim();
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new MonadRegistryError(
      "OPERATOR_NOT_CONFIGURED",
      "A valid testnet-only MONAD_PRIVATE_KEY is required for registry writes.",
    );
  }
  try {
    return privateKeyToAccount(value as Hex);
  } catch {
    throw new MonadRegistryError(
      "INVALID_OPERATOR_PRIVATE_KEY",
      "MONAD_PRIVATE_KEY must be a valid 32-byte EVM private key.",
    );
  }
};

export function createMonadPublicClient() {
  return createPublicClient({
    chain: MONAD_TESTNET,
    transport: http(getRpcUrl(), {
      timeout: 10_000,
      retryCount: 2,
      retryDelay: 300,
    }),
  });
}

const createMonadOperatorClient = () => {
  const account = getOperatorAccount();
  return {
    account,
    walletClient: createWalletClient({
      account,
      chain: MONAD_TESTNET,
      transport: http(getRpcUrl(), {
        timeout: 10_000,
        retryCount: 0,
      }),
    }),
  };
};

export function assertMonadOperatorMatchesRegistry(
  configuredOperator: Address,
  registryOperator: Address,
) {
  if (getAddress(configuredOperator) !== getAddress(registryOperator)) {
    throw new MonadRegistryError(
      "OPERATOR_MISMATCH",
      "MONAD_PRIVATE_KEY does not control the configured registry operator account.",
    );
  }
}

async function verifyOperatorAgainstRegistry(
  publicClient: PublicClient,
  registryAddress: Address,
) {
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

  const registryOperator = await publicClient.readContract({
    address: registryAddress,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "operator",
    blockTag: "finalized",
  });
  const configuredOperator = getOperatorAccount().address;
  assertMonadOperatorMatchesRegistry(configuredOperator, registryOperator);
  return { configuredOperator, registryOperator };
}

/**
 * Proves that the configured signer can mutate the finalized registry before
 * any external payment side effect is allowed.
 */
export async function verifyMonadOperatorReadiness() {
  const configuration = getMonadWriteConfiguration();
  if (!configuration.ready) {
    const issue = configuration.issues[0];
    throw new MonadRegistryError(
      issue?.code ?? "MONAD_NOT_CONFIGURED",
      issue?.message ?? "Monad Testnet writes are not configured.",
    );
  }
  const registryAddress = requireRegistryAddress();
  const publicClient = createMonadPublicClient();
  const operator = await verifyOperatorAgainstRegistry(
    publicClient,
    registryAddress,
  );
  return {
    registryAddress,
    ...operator,
    confirmation: "finalized-state" as const,
  };
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * A receipt is only local execution on Monad. Irreversible off-chain actions
 * wait until the receipt block is covered by the RPC's `finalized` block tag.
 */
export async function waitForMonadFinality(
  publicClient: PublicClient,
  hash: Hex,
  timeoutMs = DEFAULT_FINALITY_TIMEOUT_MS,
): Promise<MonadFinalizedTransaction> {
  const startedAt = Date.now();
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: timeoutMs,
    pollingInterval: FINALITY_POLL_MS,
  });
  if (receipt.status !== "success") {
    throw new MonadRegistryError(
      "TRANSACTION_REVERTED",
      "The Monad transaction was included but reverted.",
      hash,
    );
  }

  while (Date.now() - startedAt < timeoutMs) {
    const finalizedBlock = await publicClient.getBlock({ blockTag: "finalized" });
    if (finalizedBlock.number >= receipt.blockNumber) {
      return {
        hash,
        blockNumber: receipt.blockNumber,
        status: "success",
        confirmation: "finalized",
        explorerUrl: monadExplorerTransactionUrl(hash),
      };
    }
    await sleep(FINALITY_POLL_MS);
  }

  throw new MonadRegistryError(
    "FINALITY_TIMEOUT",
    "The Monad transaction executed, but finality was not observed before the timeout.",
    hash,
  );
}

const executeWrite = async (
  functionName: "commitCoalition" | "registerMerchantOffer" | "attestRainSettlement",
  args: readonly unknown[],
) => {
  const address = requireRegistryAddress();
  const publicClient = createMonadPublicClient();
  await verifyOperatorAgainstRegistry(publicClient, address);
  const { account, walletClient } = createMonadOperatorClient();
  const simulation = await publicClient.simulateContract({
    account,
    address,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName,
    args: args as never,
  });
  const hash = await walletClient.writeContract(simulation.request);
  return waitForMonadFinality(publicClient, hash);
};

export interface MonadWriteResult {
  readonly replayed: boolean;
  readonly commitmentId: Hex;
  readonly transaction: MonadFinalizedTransaction | null;
}

export interface MonadCommitResult extends MonadWriteResult {
  /** Finalized block timestamp recorded by PoolCommitmentRegistry. */
  readonly committedAt: bigint;
}

export interface VerifiedMonadPreparation {
  readonly commitmentId: Hex;
  /** Canonical live offer hashes reconstructed from finalized committedAt. */
  readonly commitment: PreparedCoalitionCommitment;
  readonly committedAt: bigint;
  readonly settledAt: bigint;
  readonly acceptedOfferHash: Hex;
  readonly rainSettlementHash: Hex;
  readonly capturedCents: bigint;
}

const sameHex = (left: Hex, right: Hex) =>
  left.toLowerCase() === right.toLowerCase();

const sameHexList = (left: readonly Hex[], right: readonly Hex[]) =>
  left.length === right.length &&
  left.every((value, index) => sameHex(value, right[index]));

const isMissingCommitment = (error: unknown) => {
  if (!(error instanceof BaseError)) return false;
  const reverted = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  );
  return (
    reverted instanceof ContractFunctionRevertedError &&
    reverted.data?.errorName === "CommitmentNotFound"
  );
};

/**
 * Reconstructs the expected preparation and verifies it against finalized chain
 * state. This is intentionally independent of process memory so a Rain request
 * remains safe after a serverless cold start or isolate change.
 */
export async function verifyFinalizedCoalitionPreparationOnMonad(
  commitment: PreparedCoalitionCommitment,
): Promise<VerifiedMonadPreparation> {
  const address = requireRegistryAddress();
  const publicClient = createMonadPublicClient();
  await verifyOperatorAgainstRegistry(publicClient, address);

  const commitmentArgs = [
    commitment.poolIdHash,
    commitment.termsHash,
    commitment.fundingRoot,
    commitment.unitCount,
    commitment.reservedCents,
    commitment.bidClosesAt,
  ] as const;
  const commitmentId = await publicClient.readContract({
    address,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "computeCommitmentId",
    args: commitmentArgs,
    blockTag: "finalized",
  });
  const configuredCommitmentId = getConfiguredCommitmentId();
  if (
    configuredCommitmentId &&
    !sameHex(configuredCommitmentId, commitmentId)
  ) {
    throw new MonadRegistryError(
      "CONFIGURED_COMMITMENT_MISMATCH",
      "MONAD_COMMITMENT_ID does not match today's server-derived funding-root commitment.",
    );
  }

  let finalized;
  try {
    finalized = await publicClient.readContract({
      address,
      abi: POOL_COMMITMENT_REGISTRY_ABI,
      functionName: "getCommitment",
      args: [commitmentId],
      blockTag: "finalized",
    });
  } catch (error) {
    if (isMissingCommitment(error)) {
      throw new MonadRegistryError(
        "MONAD_PREPARATION_REQUIRED",
        "Today's funding-root commitment has not been finalized on Monad.",
      );
    }
    throw error;
  }

  const exactCommitment =
    sameHex(finalized.poolIdHash, commitment.poolIdHash) &&
    sameHex(finalized.termsHash, commitment.termsHash) &&
    sameHex(finalized.fundingRoot, commitment.fundingRoot) &&
    finalized.unitCount === commitment.unitCount &&
    finalized.reservedCents === commitment.reservedCents &&
    finalized.bidClosesAt === commitment.bidClosesAt &&
    finalized.committedAt > BigInt(0) &&
    finalized.committedAt < finalized.bidClosesAt;
  if (!exactCommitment) {
    throw new MonadRegistryError(
      "MONAD_PREPARATION_CONFLICT",
      "Finalized Monad state does not exactly match today's funding-root commitment.",
    );
  }

  // Offer timestamps are not trusted from process memory. The finalized
  // coalition timestamp is the sole clock input used to reconstruct them.
  const reconstructedCommitment = buildHeroCoalitionCommitment({
    bidClosesAt: new Date(Number(finalized.bidClosesAt) * 1_000).toISOString(),
    finalizedCommittedAt: finalized.committedAt,
  });
  const reconstructedCoreMatches =
    sameHex(reconstructedCommitment.poolIdHash, commitment.poolIdHash) &&
    sameHex(reconstructedCommitment.termsHash, commitment.termsHash) &&
    sameHex(reconstructedCommitment.fundingRoot, commitment.fundingRoot) &&
    reconstructedCommitment.unitCount === commitment.unitCount &&
    reconstructedCommitment.reservedCents === commitment.reservedCents &&
    reconstructedCommitment.bidClosesAt === commitment.bidClosesAt;
  const suppliedLiveTimelineMatches =
    commitment.finalizedCommittedAt === null ||
    (commitment.finalizedCommittedAt ===
      reconstructedCommitment.finalizedCommittedAt &&
      commitment.firstOfferIssuedAt ===
        reconstructedCommitment.firstOfferIssuedAt &&
      sameHexList(
        commitment.offerHashes,
        reconstructedCommitment.offerHashes,
      ) &&
      sameHex(
        commitment.winningOfferHash,
        reconstructedCommitment.winningOfferHash,
      ));
  if (!reconstructedCoreMatches || !suppliedLiveTimelineMatches) {
    throw new MonadRegistryError(
      "MONAD_OFFER_RECONSTRUCTION_CONFLICT",
      "Live offer commitments do not match the finalized coalition timestamp.",
    );
  }

  const offerRegistrations = await Promise.all(
    reconstructedCommitment.offerHashes.map((offerHash) =>
      publicClient.readContract({
        address,
        abi: POOL_COMMITMENT_REGISTRY_ABI,
        functionName: "isOfferRegistered",
        args: [commitmentId, offerHash],
        blockTag: "finalized",
      }),
    ),
  );
  if (offerRegistrations.some((registered) => !registered)) {
    throw new MonadRegistryError(
      "MONAD_OFFERS_NOT_FINALIZED",
      "Every offer commitment must be finalized against today's coalition before Rain can settle.",
    );
  }

  return {
    commitmentId,
    commitment: reconstructedCommitment,
    committedAt: finalized.committedAt,
    settledAt: finalized.settledAt,
    acceptedOfferHash: finalized.acceptedOfferHash,
    rainSettlementHash: finalized.rainSettlementHash,
    capturedCents: finalized.capturedCents,
  };
}

export async function commitCoalitionOnMonad(
  commitment: PreparedCoalitionCommitment,
): Promise<MonadCommitResult> {
  const address = requireRegistryAddress();
  const publicClient = createMonadPublicClient();
  const args = [
    commitment.poolIdHash,
    commitment.termsHash,
    commitment.fundingRoot,
    commitment.unitCount,
    commitment.reservedCents,
    commitment.bidClosesAt,
  ] as const;
  const commitmentId = await publicClient.readContract({
    address,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "computeCommitmentId",
    args,
  });
  const configuredCommitmentId = getConfiguredCommitmentId();
  if (
    configuredCommitmentId &&
    !sameHex(configuredCommitmentId, commitmentId)
  ) {
    throw new MonadRegistryError(
      "CONFIGURED_COMMITMENT_MISMATCH",
      "Refusing to write a commitment that differs from MONAD_COMMITMENT_ID.",
    );
  }

  try {
    const existing = await publicClient.readContract({
      address,
      abi: POOL_COMMITMENT_REGISTRY_ABI,
      functionName: "getCommitment",
      args: [commitmentId],
      blockTag: "finalized",
    });
    const identical =
      existing.poolIdHash === commitment.poolIdHash &&
      existing.termsHash === commitment.termsHash &&
      existing.fundingRoot === commitment.fundingRoot &&
      existing.unitCount === commitment.unitCount &&
      existing.reservedCents === commitment.reservedCents &&
      existing.bidClosesAt === commitment.bidClosesAt;
    if (!identical) {
      throw new MonadRegistryError(
        "COMMITMENT_CONFLICT",
        "The derived Monad commitment already exists with different terms.",
      );
    }
    return {
      commitmentId,
      committedAt: existing.committedAt,
      replayed: true,
      transaction: null,
    };
  } catch (error) {
    if (error instanceof MonadRegistryError) throw error;
    if (!isMissingCommitment(error)) throw error;
  }

  const transaction = await executeWrite("commitCoalition", args);
  const finalized = await publicClient.readContract({
    address,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "getCommitment",
    args: [commitmentId],
    blockTag: "finalized",
  });
  const exactFinalizedCommitment =
    sameHex(finalized.poolIdHash, commitment.poolIdHash) &&
    sameHex(finalized.termsHash, commitment.termsHash) &&
    sameHex(finalized.fundingRoot, commitment.fundingRoot) &&
    finalized.unitCount === commitment.unitCount &&
    finalized.reservedCents === commitment.reservedCents &&
    finalized.bidClosesAt === commitment.bidClosesAt &&
    finalized.committedAt > BigInt(0);
  if (!exactFinalizedCommitment) {
    throw new MonadRegistryError(
      "MONAD_COMMITMENT_FINALITY_CONFLICT",
      "The finalized coalition state differed from the transaction input.",
      transaction.hash,
    );
  }
  return {
    commitmentId,
    committedAt: finalized.committedAt,
    replayed: false,
    transaction,
  };
}

export async function registerMerchantOfferOnMonad(input: {
  readonly commitmentId: Hex;
  readonly offerHash: Hex;
}): Promise<MonadWriteResult> {
  const address = requireRegistryAddress();
  const publicClient = createMonadPublicClient();
  const exists = await publicClient.readContract({
    address,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "isOfferRegistered",
    args: [input.commitmentId, input.offerHash],
    blockTag: "finalized",
  });
  if (exists) {
    return { commitmentId: input.commitmentId, replayed: true, transaction: null };
  }
  const transaction = await executeWrite("registerMerchantOffer", [
    input.commitmentId,
    input.offerHash,
  ]);
  return { commitmentId: input.commitmentId, replayed: false, transaction };
}

export async function attestRainSettlementOnMonad(input: {
  readonly commitmentId: Hex;
  readonly acceptedOfferHash: Hex;
  readonly rainSettlementHash: Hex;
  readonly capturedCents: bigint;
}): Promise<MonadWriteResult> {
  const address = requireRegistryAddress();
  const publicClient = createMonadPublicClient();
  const existing = await publicClient.readContract({
    address,
    abi: POOL_COMMITMENT_REGISTRY_ABI,
    functionName: "getCommitment",
    args: [input.commitmentId],
    blockTag: "finalized",
  });
  if (existing.settledAt > BigInt(0)) {
    const identical =
      existing.acceptedOfferHash === input.acceptedOfferHash &&
      existing.rainSettlementHash === input.rainSettlementHash &&
      existing.capturedCents === input.capturedCents;
    if (!identical) {
      throw new MonadRegistryError(
        "SETTLEMENT_CONFLICT",
        "The commitment already carries a different Rain settlement attestation.",
      );
    }
    return { commitmentId: input.commitmentId, replayed: true, transaction: null };
  }
  if (input.rainSettlementHash === zeroHash) {
    throw new MonadRegistryError(
      "INVALID_SETTLEMENT_HASH",
      "Rain settlement digest cannot be zero.",
    );
  }

  const transaction = await executeWrite("attestRainSettlement", [
    input.commitmentId,
    input.acceptedOfferHash,
    input.rainSettlementHash,
    input.capturedCents,
  ]);
  return { commitmentId: input.commitmentId, replayed: false, transaction };
}

export function getConfiguredCommitmentId(): Hex | undefined {
  const value = process.env.MONAD_COMMITMENT_ID?.trim();
  if (!value) return undefined;
  if (!isHex(value, { strict: true }) || value.length !== 66) {
    throw new MonadRegistryError(
      "INVALID_COMMITMENT_ID",
      "MONAD_COMMITMENT_ID must be a 32-byte hex value.",
    );
  }
  return value;
}
