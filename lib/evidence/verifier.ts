import publishedEvidenceArtifact from "../../public/evidence/rain-monad-testnet-2026-08-09.json" with { type: "json" };

import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";

import { hashRainSettlement } from "../monad/commitment.ts";
import {
  MONAD_TESTNET,
  POOL_COMMITMENT_REGISTRY_ABI,
} from "../monad/registry.ts";

export const PUBLISHED_EVIDENCE_PUBLIC_PATH =
  "/evidence/rain-monad-testnet-2026-08-09.json";

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const hex32Schema = z.string().regex(HASH_PATTERN);
const addressSchema = z.string().regex(ADDRESS_PATTERN);
const transactionSchema = z.object({
  hash: hex32Schema,
  blockNumber: z.number().int().positive(),
  explorerUrl: z.string().url(),
});

// The deployment record predates the shared transaction shape and keys its
// hash as `transactionHash`; the published artifact is the source of truth.
const deploymentTransactionSchema = z.object({
  transactionHash: hex32Schema,
  blockNumber: z.number().int().positive(),
  explorerUrl: z.string().url(),
});

const publishedEvidenceSchema = z.object({
  schemaVersion: z.number().int().positive(),
  recordedAt: z.string().datetime(),
  scenarioVersion: z.string().min(1),
  sourceBranch: z.string().min(1),
  sourceCommit: z.string().min(1),
  realMoneyMoved: z.literal(false),
  evidenceMode: z.string().min(1),
  fundingBoundary: z.object({
    ledger: z.string().min(1),
    simulated: z.literal(true),
    reservedCents: z.number().int().positive(),
    capturedCents: z.number().int().positive(),
    releasedCents: z.number().int().nonnegative(),
  }),
  rain: z.object({
    provider: z.literal("Rain"),
    environment: z.literal("sandbox"),
    payments: z
      .array(
        z.object({
          buyerId: z.string().min(1),
          amountInCents: z.number().int().positive(),
          transactionId: z.string().min(1).max(256),
          status: z.literal("settled"),
        }),
      )
      .min(1),
  }),
  monad: z.object({
    network: z.literal("Monad Testnet"),
    chainId: z.number().int().positive(),
    confirmation: z.literal("finalized"),
    testnetTransactionClaimed: z.literal(true),
    operatorAddress: addressSchema,
    registryAddress: addressSchema,
    deployment: deploymentTransactionSchema,
    commitment: z.object({
      id: hex32Schema,
      termsHash: hex32Schema,
      fundingRoot: hex32Schema,
      unitCount: z.number().int().positive(),
      reservedCents: z.number().int().positive(),
      committedAt: z.string().datetime(),
      bidClosesAt: z.string().datetime(),
      transaction: transactionSchema,
    }),
    offerRegistrations: z.array(transactionSchema).min(1),
    settlementAttestation: z.object({
      acceptedOfferHash: hex32Schema,
      rainSettlementHash: hex32Schema,
      rainTransactionCount: z.number().int().positive(),
      capturedCents: z.number().int().positive(),
      settledAt: z.string().datetime(),
      transaction: transactionSchema,
    }),
  }),
});

export type PublishedEvidence = z.infer<typeof publishedEvidenceSchema>;

export type EvidenceVerificationStatus =
  | "verified"
  | "mismatch"
  | "degraded";
export type EvidenceCheckStatus = "pass" | "fail" | "unavailable";
export type EvidenceCheckValue = string | number | boolean | null;

export interface EvidenceVerificationCheck {
  readonly id: string;
  readonly label: string;
  readonly status: EvidenceCheckStatus;
  readonly expected: EvidenceCheckValue;
  readonly actual: EvidenceCheckValue;
  readonly detail: string;
}

export interface EvidenceVerificationError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ObservedCommitment {
  readonly poolIdHash: Hex;
  readonly termsHash: Hex;
  readonly fundingRoot: Hex;
  readonly acceptedOfferHash: Hex;
  readonly rainSettlementHash: Hex;
  readonly reservedCents: bigint;
  readonly capturedCents: bigint;
  readonly committedAt: bigint;
  readonly bidClosesAt: bigint;
  readonly settledAt: bigint;
  readonly unitCount: number;
}

export interface DecodedRegistryEvent {
  readonly name: string;
  readonly address: Address;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface EvidenceTransactionReceipt {
  readonly status: "success" | "reverted";
  readonly blockNumber: bigint;
  readonly contractAddress: Address | null;
  readonly events: readonly DecodedRegistryEvent[];
}

/**
 * Deliberately read-only capability surface. A verifier implementation cannot
 * accept a signer, wallet client, private key, or send-transaction method.
 */
export interface MonadEvidenceReader {
  getChainId(): Promise<number>;
  getFinalizedBlockNumber(): Promise<bigint>;
  getFinalizedCode(address: Address): Promise<Hex | undefined>;
  readOperator(address: Address): Promise<Address>;
  readCommitment(
    address: Address,
    commitmentId: Hex,
  ): Promise<ObservedCommitment>;
  computeCommitmentId(
    address: Address,
    commitment: ObservedCommitment,
  ): Promise<Hex>;
  isOfferRegistered(
    address: Address,
    commitmentId: Hex,
    offerHash: Hex,
  ): Promise<boolean>;
  getTransactionReceipt(hash: Hex): Promise<EvidenceTransactionReceipt>;
}

export interface EvidenceVerificationReport {
  readonly schemaVersion: 1;
  readonly status: EvidenceVerificationStatus;
  readonly verified: boolean;
  readonly checkedAt: string;
  readonly evidence: {
    readonly path: string;
    readonly schemaVersion: number | null;
    readonly recordedAt: string | null;
    readonly sourceBranch: string | null;
    readonly sourceCommit: string | null;
    readonly evidenceMode: string | null;
  };
  readonly provenance: {
    readonly network: "Monad Testnet";
    readonly expectedChainId: number;
    readonly rpcUrlKind: "public-monad-testnet";
    readonly registryAddress: string | null;
    readonly commitmentId: string | null;
    readonly deploymentTransactionHash: string | null;
    readonly commitmentTransactionHash: string | null;
    readonly attestationTransactionHash: string | null;
  };
  readonly scope: {
    readonly readOnly: true;
    readonly externalWrites: false;
    readonly financialAuthorization: "not_requested";
    readonly rainContacted: false;
    readonly monadWrites: false;
  };
  readonly checks: readonly EvidenceVerificationCheck[];
  readonly chain: {
    readonly expectedChainId: number;
    readonly observedChainId: number | null;
    readonly finalizedBlockNumber: string | null;
  };
  readonly registry: {
    readonly address: string | null;
    readonly expectedOperator: string | null;
    readonly observedOperator: string | null;
    readonly bytecodePresent: boolean | null;
  };
  readonly commitment: {
    readonly id: string | null;
    readonly observed: null | {
      readonly poolIdHash: string;
      readonly termsHash: string;
      readonly fundingRoot: string;
      readonly acceptedOfferHash: string;
      readonly rainSettlementHash: string;
      readonly reservedCents: string;
      readonly capturedCents: string;
      readonly committedAt: string;
      readonly bidClosesAt: string;
      readonly settledAt: string;
      readonly unitCount: number;
    };
  };
  readonly settlement: {
    readonly rainTransactionIds: readonly string[];
    readonly publishedRainSettlementHash: string | null;
    readonly recomputedRainSettlementHash: string | null;
    readonly acceptedOfferHash: string | null;
  };
  readonly errors: readonly EvidenceVerificationError[];
}

const registryEventAbi = parseAbi([
  "event OperatorTransferred(address indexed previousOperator,address indexed nextOperator)",
  "event CoalitionCommitted(bytes32 indexed commitmentId,bytes32 indexed poolIdHash,bytes32 termsHash,bytes32 fundingRoot,uint32 unitCount,uint128 reservedCents,uint64 committedAt,uint64 bidClosesAt)",
  "event MerchantOfferRegistered(bytes32 indexed commitmentId,bytes32 indexed offerHash,uint64 registeredAt)",
  "event RainSettlementAttested(bytes32 indexed commitmentId,bytes32 indexed acceptedOfferHash,bytes32 indexed rainSettlementHash,uint128 capturedCents,uint128 releasedCents,uint64 settledAt)",
]);

const sameHex = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

const sameAddress = (left: string, right: string) =>
  isAddress(left) &&
  isAddress(right) &&
  getAddress(left) === getAddress(right);

const isoFromSeconds = (seconds: bigint) =>
  new Date(Number(seconds) * 1_000).toISOString();

const valueAsString = (value: unknown) =>
  typeof value === "bigint" ? value.toString() : String(value ?? "");

const eventNamed = (
  receipt: EvidenceTransactionReceipt,
  registryAddress: Address,
  eventName: string,
) =>
  receipt.events.find(
    (event) =>
      event.name === eventName && sameAddress(event.address, registryAddress),
  );

const addCheck = (
  checks: EvidenceVerificationCheck[],
  input: Omit<EvidenceVerificationCheck, "status"> & { readonly passed: boolean },
) => {
  checks.push({
    id: input.id,
    label: input.label,
    status: input.passed ? "pass" : "fail",
    expected: input.expected,
    actual: input.actual,
    detail: input.detail,
  });
};

const getStatus = (
  checks: readonly EvidenceVerificationCheck[],
  errors: readonly EvidenceVerificationError[],
): EvidenceVerificationStatus => {
  if (checks.some((check) => check.status === "fail")) return "mismatch";
  if (
    errors.length > 0 ||
    checks.some((check) => check.status === "unavailable")
  ) {
    return "degraded";
  }
  return "verified";
};

const getNetworkErrorCode = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,64}$/.test(error.code)
  ) {
    return error.code;
  }
  return "MONAD_FINALIZED_READ_UNAVAILABLE";
};

export function parsePublishedEvidence(input: unknown): PublishedEvidence {
  return publishedEvidenceSchema.parse(input);
}

/**
 * The artifact is imported, not read from disk. The route runs in worker-style
 * runtimes where `node:fs` and `process.cwd()` are unavailable, and a bundled
 * import fails at build time rather than degrading a published claim at request
 * time. `app/evidence/page.tsx` imports the same file the same way.
 */
export async function loadPublishedEvidence(): Promise<PublishedEvidence> {
  return parsePublishedEvidence(publishedEvidenceArtifact);
}

/**
 * Creates a reader backed only by Monad's documented public Testnet endpoint.
 * Environment RPC overrides are intentionally ignored so this public route
 * never depends on a credential-bearing provider URL.
 */
export function createPublicMonadEvidenceReader(): MonadEvidenceReader {
  const client = createPublicClient({
    chain: MONAD_TESTNET,
    transport: http(MONAD_TESTNET.rpcUrls.default.http[0], {
      timeout: 10_000,
      retryCount: 1,
      retryDelay: 300,
    }),
  });

  return {
    getChainId: () => client.getChainId(),
    async getFinalizedBlockNumber() {
      const block = await client.getBlock({ blockTag: "finalized" });
      if (block.number === null) {
        throw new Error("FINALIZED_BLOCK_UNAVAILABLE");
      }
      return block.number;
    },
    getFinalizedCode: (address) =>
      client.getCode({ address, blockTag: "finalized" }),
    readOperator: (address) =>
      client.readContract({
        address,
        abi: POOL_COMMITMENT_REGISTRY_ABI,
        functionName: "operator",
        blockTag: "finalized",
      }),
    readCommitment: (address, commitmentId) =>
      client.readContract({
        address,
        abi: POOL_COMMITMENT_REGISTRY_ABI,
        functionName: "getCommitment",
        args: [commitmentId],
        blockTag: "finalized",
      }),
    computeCommitmentId: (address, commitment) =>
      client.readContract({
        address,
        abi: POOL_COMMITMENT_REGISTRY_ABI,
        functionName: "computeCommitmentId",
        args: [
          commitment.poolIdHash,
          commitment.termsHash,
          commitment.fundingRoot,
          commitment.unitCount,
          commitment.reservedCents,
          commitment.bidClosesAt,
        ],
        blockTag: "finalized",
      }),
    isOfferRegistered: (address, commitmentId, offerHash) =>
      client.readContract({
        address,
        abi: POOL_COMMITMENT_REGISTRY_ABI,
        functionName: "isOfferRegistered",
        args: [commitmentId, offerHash],
        blockTag: "finalized",
      }),
    async getTransactionReceipt(hash) {
      const receipt = await client.getTransactionReceipt({ hash });
      const parsedEvents = parseEventLogs({
        abi: registryEventAbi,
        logs: receipt.logs,
        strict: true,
      });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        contractAddress: receipt.contractAddress ?? null,
        events: parsedEvents.map((event) => ({
          name: event.eventName,
          address: event.address,
          args: event.args as Readonly<Record<string, unknown>>,
        })),
      };
    },
  };
}

export function createUnavailableEvidenceVerification(
  code: string,
  message: string,
  retryable: boolean,
): EvidenceVerificationReport {
  return {
    schemaVersion: 1,
    status: "degraded",
    verified: false,
    checkedAt: new Date().toISOString(),
    evidence: {
      path: PUBLISHED_EVIDENCE_PUBLIC_PATH,
      schemaVersion: null,
      recordedAt: null,
      sourceBranch: null,
      sourceCommit: null,
      evidenceMode: null,
    },
    provenance: {
      network: "Monad Testnet",
      expectedChainId: MONAD_TESTNET.id,
      rpcUrlKind: "public-monad-testnet",
      registryAddress: null,
      commitmentId: null,
      deploymentTransactionHash: null,
      commitmentTransactionHash: null,
      attestationTransactionHash: null,
    },
    scope: {
      readOnly: true,
      externalWrites: false,
      financialAuthorization: "not_requested",
      rainContacted: false,
      monadWrites: false,
    },
    checks: [
      {
        id: "verification_availability",
        label: "Verification availability",
        status: "unavailable",
        expected: true,
        actual: null,
        detail: message,
      },
    ],
    chain: {
      expectedChainId: MONAD_TESTNET.id,
      observedChainId: null,
      finalizedBlockNumber: null,
    },
    registry: {
      address: null,
      expectedOperator: null,
      observedOperator: null,
      bytecodePresent: null,
    },
    commitment: { id: null, observed: null },
    settlement: {
      rainTransactionIds: [],
      publishedRainSettlementHash: null,
      recomputedRainSettlementHash: null,
      acceptedOfferHash: null,
    },
    errors: [{ code, message, retryable }],
  };
}

export async function verifyPublishedEvidence(
  artifact: PublishedEvidence,
  reader: MonadEvidenceReader = createPublicMonadEvidenceReader(),
): Promise<EvidenceVerificationReport> {
  const checkedAt = new Date().toISOString();
  const checks: EvidenceVerificationCheck[] = [];
  const errors: EvidenceVerificationError[] = [];
  const registryAddress = getAddress(artifact.monad.registryAddress);
  const operatorAddress = getAddress(artifact.monad.operatorAddress);
  const commitmentId = artifact.monad.commitment.id as Hex;
  const acceptedOfferHash =
    artifact.monad.settlementAttestation.acceptedOfferHash as Hex;
  const rainTransactionIds = artifact.rain.payments.map(
    (payment) => payment.transactionId,
  );
  const recomputedRainSettlementHash = hashRainSettlement({
    commitmentId,
    acceptedOfferHash,
    rainTransactionIds,
  });
  const publishedRainSettlementHash =
    artifact.monad.settlementAttestation.rainSettlementHash as Hex;

  addCheck(checks, {
    id: "safety_boundary",
    label: "Published safety boundary",
    passed:
      artifact.realMoneyMoved === false &&
      artifact.fundingBoundary.simulated === true,
    expected: "simulated ledger; realMoneyMoved=false",
    actual: `simulated=${artifact.fundingBoundary.simulated}; realMoneyMoved=${artifact.realMoneyMoved}`,
    detail:
      "The evidence artifact explicitly excludes real-money custody and movement.",
  });
  addCheck(checks, {
    id: "rain_settlement_digest",
    label: "Rain transaction-set digest",
    passed: sameHex(
      recomputedRainSettlementHash,
      publishedRainSettlementHash,
    ),
    expected: publishedRainSettlementHash,
    actual: recomputedRainSettlementHash,
    detail:
      "The digest was recomputed locally from the three published Rain sandbox transaction IDs, commitment ID, and accepted-offer hash; Rain was not contacted.",
  });

  const paymentTotal = artifact.rain.payments.reduce(
    (total, payment) => total + payment.amountInCents,
    0,
  );
  const reconciles =
    paymentTotal === artifact.fundingBoundary.capturedCents &&
    artifact.fundingBoundary.capturedCents ===
      artifact.monad.settlementAttestation.capturedCents &&
    artifact.fundingBoundary.capturedCents +
      artifact.fundingBoundary.releasedCents ===
      artifact.fundingBoundary.reservedCents &&
    rainTransactionIds.length ===
      artifact.monad.settlementAttestation.rainTransactionCount;
  addCheck(checks, {
    id: "ledger_reconciliation",
    label: "Published ledger reconciliation",
    passed: reconciles,
    expected: `${artifact.fundingBoundary.reservedCents}=${artifact.fundingBoundary.capturedCents}+${artifact.fundingBoundary.releasedCents}; ${artifact.monad.settlementAttestation.rainTransactionCount} Rain IDs`,
    actual: `${artifact.fundingBoundary.reservedCents}=${paymentTotal}+${artifact.fundingBoundary.releasedCents}; ${rainTransactionIds.length} Rain IDs`,
    detail:
      "Published sandbox payment amounts reconcile exactly to captured and released simulated cents.",
  });

  let observedChainId: number | null = null;
  let finalizedBlockNumber: bigint | null = null;
  let bytecodePresent: boolean | null = null;
  let observedOperator: Address | null = null;
  let observedCommitment: ObservedCommitment | null = null;

  try {
    observedChainId = await reader.getChainId();
    addCheck(checks, {
      id: "monad_chain_id",
      label: "Monad Testnet chain",
      passed:
        observedChainId === MONAD_TESTNET.id &&
        artifact.monad.chainId === MONAD_TESTNET.id,
      expected: MONAD_TESTNET.id,
      actual: observedChainId,
      detail: "The public RPC reported the expected Monad Testnet chain ID.",
    });

    finalizedBlockNumber = await reader.getFinalizedBlockNumber();
    const allPublishedBlocks = [
      artifact.monad.deployment.blockNumber,
      artifact.monad.commitment.transaction.blockNumber,
      ...artifact.monad.offerRegistrations.map(
        (registration) => registration.blockNumber,
      ),
      artifact.monad.settlementAttestation.transaction.blockNumber,
    ];
    const latestPublishedBlock = Math.max(...allPublishedBlocks);
    addCheck(checks, {
      id: "finalized_head",
      label: "Published transactions finalized",
      passed: finalizedBlockNumber >= BigInt(latestPublishedBlock),
      expected: `>=${latestPublishedBlock}`,
      actual: finalizedBlockNumber.toString(),
      detail:
        "The public finalized head is at or beyond every transaction named by the artifact.",
    });

    const code = await reader.getFinalizedCode(registryAddress);
    bytecodePresent = Boolean(code && code !== "0x");
    addCheck(checks, {
      id: "registry_bytecode",
      label: "Finalized registry bytecode",
      passed: bytecodePresent,
      expected: true,
      actual: bytecodePresent,
      detail:
        "Finalized contract bytecode is present at the published registry address.",
    });

    observedOperator = await reader.readOperator(registryAddress);
    addCheck(checks, {
      id: "registry_operator",
      label: "Registry operator",
      passed: sameAddress(observedOperator, operatorAddress),
      expected: operatorAddress,
      actual: observedOperator,
      detail:
        "The registry's finalized operator matches the sanitized evidence artifact.",
    });

    const deploymentReceipt = await reader.getTransactionReceipt(
      artifact.monad.deployment.transactionHash as Hex,
    );
    const operatorEvent = eventNamed(
      deploymentReceipt,
      registryAddress,
      "OperatorTransferred",
    );
    const deploymentMatches =
      deploymentReceipt.status === "success" &&
      deploymentReceipt.blockNumber ===
        BigInt(artifact.monad.deployment.blockNumber) &&
      deploymentReceipt.contractAddress !== null &&
      sameAddress(deploymentReceipt.contractAddress, registryAddress) &&
      operatorEvent !== undefined &&
      sameAddress(
        valueAsString(operatorEvent.args.nextOperator),
        operatorAddress,
      );
    addCheck(checks, {
      id: "deployment_receipt",
      label: "Registry deployment receipt",
      passed: deploymentMatches,
      expected: `${registryAddress}@${artifact.monad.deployment.blockNumber}; operator=${operatorAddress}`,
      actual: `${deploymentReceipt.contractAddress ?? "none"}@${deploymentReceipt.blockNumber}; operator=${valueAsString(operatorEvent?.args.nextOperator) || "missing"}`,
      detail:
        "The named successful deployment receipt created this registry and emitted the published initial operator.",
    });

    observedCommitment = await reader.readCommitment(
      registryAddress,
      commitmentId,
    );
    const computedCommitmentId = await reader.computeCommitmentId(
      registryAddress,
      observedCommitment,
    );
    addCheck(checks, {
      id: "commitment_id",
      label: "Commitment identifier",
      passed: sameHex(computedCommitmentId, commitmentId),
      expected: commitmentId,
      actual: computedCommitmentId,
      detail:
        "The registry recomputed the published chain- and deployment-specific commitment ID from finalized state.",
    });

    const commitmentStateMatches =
      sameHex(
        observedCommitment.termsHash,
        artifact.monad.commitment.termsHash,
      ) &&
      sameHex(
        observedCommitment.fundingRoot,
        artifact.monad.commitment.fundingRoot,
      ) &&
      observedCommitment.unitCount === artifact.monad.commitment.unitCount &&
      observedCommitment.reservedCents ===
        BigInt(artifact.monad.commitment.reservedCents) &&
      observedCommitment.capturedCents ===
        BigInt(artifact.monad.settlementAttestation.capturedCents) &&
      isoFromSeconds(observedCommitment.committedAt) ===
        artifact.monad.commitment.committedAt &&
      isoFromSeconds(observedCommitment.bidClosesAt) ===
        artifact.monad.commitment.bidClosesAt &&
      isoFromSeconds(observedCommitment.settledAt) ===
        artifact.monad.settlementAttestation.settledAt;
    addCheck(checks, {
      id: "commitment_state",
      label: "Finalized coalition state",
      passed: commitmentStateMatches,
      expected: `${artifact.monad.commitment.unitCount} units; ${artifact.monad.commitment.reservedCents} reserved; ${artifact.monad.settlementAttestation.capturedCents} captured`,
      actual: `${observedCommitment.unitCount} units; ${observedCommitment.reservedCents} reserved; ${observedCommitment.capturedCents} captured`,
      detail:
        "Terms, funding root, units, amounts, and timestamps match the published finalized commitment.",
    });

    const commitmentReceipt = await reader.getTransactionReceipt(
      artifact.monad.commitment.transaction.hash as Hex,
    );
    const commitmentEvent = eventNamed(
      commitmentReceipt,
      registryAddress,
      "CoalitionCommitted",
    );
    const commitmentReceiptMatches =
      commitmentReceipt.status === "success" &&
      commitmentReceipt.blockNumber ===
        BigInt(artifact.monad.commitment.transaction.blockNumber) &&
      commitmentEvent !== undefined &&
      sameHex(valueAsString(commitmentEvent.args.commitmentId), commitmentId) &&
      sameHex(
        valueAsString(commitmentEvent.args.poolIdHash),
        observedCommitment.poolIdHash,
      ) &&
      sameHex(
        valueAsString(commitmentEvent.args.termsHash),
        artifact.monad.commitment.termsHash,
      ) &&
      sameHex(
        valueAsString(commitmentEvent.args.fundingRoot),
        artifact.monad.commitment.fundingRoot,
      ) &&
      valueAsString(commitmentEvent.args.unitCount) ===
        String(artifact.monad.commitment.unitCount) &&
      valueAsString(commitmentEvent.args.reservedCents) ===
        String(artifact.monad.commitment.reservedCents);
    addCheck(checks, {
      id: "commitment_receipt",
      label: "Coalition commitment receipt",
      passed: commitmentReceiptMatches,
      expected: `${commitmentId}@${artifact.monad.commitment.transaction.blockNumber}`,
      actual: `${valueAsString(commitmentEvent?.args.commitmentId) || "missing"}@${commitmentReceipt.blockNumber}`,
      detail:
        "The named successful transaction emitted the exact finalized coalition commitment.",
    });

    const offerReceipts = await Promise.all(
      artifact.monad.offerRegistrations.map(async (registration) => ({
        registration,
        receipt: await reader.getTransactionReceipt(registration.hash as Hex),
      })),
    );
    const offerEvents = offerReceipts.map(({ receipt }) =>
      eventNamed(receipt, registryAddress, "MerchantOfferRegistered"),
    );
    const offerHashes = offerEvents
      .map((event) => valueAsString(event?.args.offerHash))
      .filter((value): value is Hex => HASH_PATTERN.test(value));
    const offerReceiptMatches = offerReceipts.every(
      ({ registration, receipt }, index) =>
        receipt.status === "success" &&
        receipt.blockNumber === BigInt(registration.blockNumber) &&
        offerEvents[index] !== undefined &&
        sameHex(
          valueAsString(offerEvents[index]?.args.commitmentId),
          commitmentId,
        ),
    );
    const uniqueOfferHashes = new Set(
      offerHashes.map((offerHash) => offerHash.toLowerCase()),
    );
    const registrationStates = await Promise.all(
      offerHashes.map((offerHash) =>
        reader.isOfferRegistered(registryAddress, commitmentId, offerHash),
      ),
    );
    const offersMatch =
      offerReceiptMatches &&
      offerHashes.length === artifact.monad.offerRegistrations.length &&
      uniqueOfferHashes.size === artifact.monad.offerRegistrations.length &&
      registrationStates.every(Boolean) &&
      offerHashes.some((offerHash) => sameHex(offerHash, acceptedOfferHash));
    addCheck(checks, {
      id: "offer_registrations",
      label: "Merchant offer registrations",
      passed: offersMatch,
      expected: `${artifact.monad.offerRegistrations.length} unique finalized offers including the accepted offer`,
      actual: `${uniqueOfferHashes.size} unique decoded offers; ${registrationStates.filter(Boolean).length} registered; accepted=${offerHashes.some((offerHash) => sameHex(offerHash, acceptedOfferHash))}`,
      detail:
        "Each named transaction emitted one commitment-bound offer hash, and every decoded hash is still registered in finalized state.",
    });

    const attestationReceipt = await reader.getTransactionReceipt(
      artifact.monad.settlementAttestation.transaction.hash as Hex,
    );
    const attestationEvent = eventNamed(
      attestationReceipt,
      registryAddress,
      "RainSettlementAttested",
    );
    const expectedReleasedCents =
      artifact.fundingBoundary.reservedCents -
      artifact.fundingBoundary.capturedCents;
    const attestationReceiptMatches =
      attestationReceipt.status === "success" &&
      attestationReceipt.blockNumber ===
        BigInt(artifact.monad.settlementAttestation.transaction.blockNumber) &&
      attestationEvent !== undefined &&
      sameHex(
        valueAsString(attestationEvent.args.commitmentId),
        commitmentId,
      ) &&
      sameHex(
        valueAsString(attestationEvent.args.acceptedOfferHash),
        acceptedOfferHash,
      ) &&
      sameHex(
        valueAsString(attestationEvent.args.rainSettlementHash),
        publishedRainSettlementHash,
      ) &&
      valueAsString(attestationEvent.args.capturedCents) ===
        String(artifact.monad.settlementAttestation.capturedCents) &&
      valueAsString(attestationEvent.args.releasedCents) ===
        String(expectedReleasedCents) &&
      isoFromSeconds(BigInt(valueAsString(attestationEvent.args.settledAt))) ===
        artifact.monad.settlementAttestation.settledAt;
    addCheck(checks, {
      id: "settlement_attestation_receipt",
      label: "Rain settlement attestation receipt",
      passed: attestationReceiptMatches,
      expected: `${publishedRainSettlementHash}@${artifact.monad.settlementAttestation.transaction.blockNumber}`,
      actual: `${valueAsString(attestationEvent?.args.rainSettlementHash) || "missing"}@${attestationReceipt.blockNumber}`,
      detail:
        "The named successful transaction emitted the exact accepted offer, Rain digest, captured amount, release amount, and settlement time.",
    });

    const attestationStateMatches =
      sameHex(observedCommitment.acceptedOfferHash, acceptedOfferHash) &&
      sameHex(
        observedCommitment.rainSettlementHash,
        publishedRainSettlementHash,
      );
    addCheck(checks, {
      id: "settlement_attestation_state",
      label: "Finalized settlement state",
      passed: attestationStateMatches,
      expected: `${acceptedOfferHash}|${publishedRainSettlementHash}`,
      actual: `${observedCommitment.acceptedOfferHash}|${observedCommitment.rainSettlementHash}`,
      detail:
        "Finalized registry state still binds the accepted offer to the recomputed Rain transaction-set digest.",
    });

    const commitmentBlock = artifact.monad.commitment.transaction.blockNumber;
    const offerBlocks = artifact.monad.offerRegistrations.map(
      (registration) => registration.blockNumber,
    );
    const attestationBlock =
      artifact.monad.settlementAttestation.transaction.blockNumber;
    const orderingMatches =
      offerBlocks.every((block) => block > commitmentBlock) &&
      attestationBlock > Math.max(...offerBlocks) &&
      observedCommitment.committedAt < observedCommitment.settledAt;
    addCheck(checks, {
      id: "causal_ordering",
      label: "Commit → offers → attestation ordering",
      passed: orderingMatches,
      expected: "commitment block < six offer blocks < attestation block",
      actual: `${commitmentBlock}<${offerBlocks.join(",")}<${attestationBlock}`,
      detail:
        "The published finalized chronology places the coalition commitment before every offer registration and the attestation after them.",
    });
  } catch (error) {
    const code = getNetworkErrorCode(error);
    const message =
      "Monad Testnet finalized state could not be read completely. No onchain or payment write was attempted; retry the read-only verification.";
    errors.push({ code, message, retryable: true });
    checks.push({
      id: "monad_finalized_read",
      label: "Monad finalized-state read",
      status: "unavailable",
      expected: true,
      actual: null,
      detail: message,
    });
  }

  const status = getStatus(checks, errors);
  return {
    schemaVersion: 1,
    status,
    verified: status === "verified",
    checkedAt,
    evidence: {
      path: PUBLISHED_EVIDENCE_PUBLIC_PATH,
      schemaVersion: artifact.schemaVersion,
      recordedAt: artifact.recordedAt,
      sourceBranch: artifact.sourceBranch,
      sourceCommit: artifact.sourceCommit,
      evidenceMode: artifact.evidenceMode,
    },
    provenance: {
      network: "Monad Testnet",
      expectedChainId: MONAD_TESTNET.id,
      rpcUrlKind: "public-monad-testnet",
      registryAddress,
      commitmentId,
      deploymentTransactionHash: artifact.monad.deployment.transactionHash,
      commitmentTransactionHash: artifact.monad.commitment.transaction.hash,
      attestationTransactionHash:
        artifact.monad.settlementAttestation.transaction.hash,
    },
    scope: {
      readOnly: true,
      externalWrites: false,
      financialAuthorization: "not_requested",
      rainContacted: false,
      monadWrites: false,
    },
    checks,
    chain: {
      expectedChainId: MONAD_TESTNET.id,
      observedChainId,
      finalizedBlockNumber: finalizedBlockNumber?.toString() ?? null,
    },
    registry: {
      address: registryAddress,
      expectedOperator: operatorAddress,
      observedOperator,
      bytecodePresent,
    },
    commitment: {
      id: commitmentId,
      observed: observedCommitment
        ? {
            poolIdHash: observedCommitment.poolIdHash,
            termsHash: observedCommitment.termsHash,
            fundingRoot: observedCommitment.fundingRoot,
            acceptedOfferHash: observedCommitment.acceptedOfferHash,
            rainSettlementHash: observedCommitment.rainSettlementHash,
            reservedCents: observedCommitment.reservedCents.toString(),
            capturedCents: observedCommitment.capturedCents.toString(),
            committedAt: isoFromSeconds(observedCommitment.committedAt),
            bidClosesAt: isoFromSeconds(observedCommitment.bidClosesAt),
            settledAt: isoFromSeconds(observedCommitment.settledAt),
            unitCount: observedCommitment.unitCount,
          }
        : null,
    },
    settlement: {
      rainTransactionIds,
      publishedRainSettlementHash,
      recomputedRainSettlementHash,
      acceptedOfferHash,
    },
    errors,
  };
}

export async function verifyBundledEvidence() {
  return verifyPublishedEvidence(await loadPublishedEvidence());
}
