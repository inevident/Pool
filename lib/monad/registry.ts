import { defineChain, type Address, type Hex } from "viem";

/** Current official Monad Testnet values (reset from genesis 2025-12-16). */
export const MONAD_TESTNET = defineChain({
  id: 10_143,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.monad.xyz"],
      webSocket: ["wss://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "MonadVision",
      url: "https://testnet.monadvision.com",
    },
    monadscan: {
      name: "Monadscan",
      url: "https://testnet.monadscan.com",
    },
  },
  testnet: true,
});

export const MONAD_TESTNET_RESET_AT = "2025-12-16";

export const POOL_COMMITMENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "computeCommitmentId",
    stateMutability: "view",
    inputs: [
      { name: "poolIdHash", type: "bytes32" },
      { name: "termsHash", type: "bytes32" },
      { name: "fundingRoot", type: "bytes32" },
      { name: "unitCount", type: "uint32" },
      { name: "reservedCents", type: "uint128" },
      { name: "bidClosesAt", type: "uint64" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "commitCoalition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolIdHash", type: "bytes32" },
      { name: "termsHash", type: "bytes32" },
      { name: "fundingRoot", type: "bytes32" },
      { name: "unitCount", type: "uint32" },
      { name: "reservedCents", type: "uint128" },
      { name: "bidClosesAt", type: "uint64" },
    ],
    outputs: [{ name: "commitmentId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "registerMerchantOffer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitmentId", type: "bytes32" },
      { name: "offerHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attestRainSettlement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitmentId", type: "bytes32" },
      { name: "acceptedOfferHash", type: "bytes32" },
      { name: "rainSettlementHash", type: "bytes32" },
      { name: "capturedCents", type: "uint128" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getCommitment",
    stateMutability: "view",
    inputs: [{ name: "commitmentId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "poolIdHash", type: "bytes32" },
          { name: "termsHash", type: "bytes32" },
          { name: "fundingRoot", type: "bytes32" },
          { name: "acceptedOfferHash", type: "bytes32" },
          { name: "rainSettlementHash", type: "bytes32" },
          { name: "reservedCents", type: "uint128" },
          { name: "capturedCents", type: "uint128" },
          { name: "committedAt", type: "uint64" },
          { name: "bidClosesAt", type: "uint64" },
          { name: "settledAt", type: "uint64" },
          { name: "unitCount", type: "uint32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isOfferRegistered",
    stateMutability: "view",
    inputs: [
      { name: "commitmentId", type: "bytes32" },
      { name: "offerHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface MonadFinalizedTransaction {
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly status: "success";
  readonly confirmation: "finalized";
  readonly explorerUrl: string;
}

export const monadExplorerAddressUrl = (address: Address) =>
  `${MONAD_TESTNET.blockExplorers.default.url}/address/${address}`;

export const monadExplorerTransactionUrl = (hash: Hex) =>
  `${MONAD_TESTNET.blockExplorers.default.url}/tx/${hash}`;
