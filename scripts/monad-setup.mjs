#!/usr/bin/env node
/**
 * One-command Monad Testnet bring-up.
 *
 * Checks the operator key is funded, deploys the registry if needed, writes the
 * address back into the ignored .env.local, and verifies finalized chain state
 * matches the configured signer. Prints readiness only — never a secret value.
 *
 *   node --env-file-if-exists=.env.local scripts/monad-setup.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  encodeDeployData,
  formatEther,
  formatGwei,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPECTED_CHAIN_ID = 10_143;
const HARDHAT_CLI = "./node_modules/hardhat/dist/src/cli.js";
const REGISTRY_ARTIFACT =
  "artifacts/contracts/PoolCommitmentRegistry.sol/PoolCommitmentRegistry.json";
const DEFAULT_PRIORITY_FEE = 1_000_000_000n;
const FUNDING_CUSHION_BPS = 1_000n;
const BPS_DENOMINATOR = 10_000n;

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

export function deploymentFundingRequirement({
  gasEstimate,
  baseFeePerGas,
  maxPriorityFeePerGas,
}) {
  if (gasEstimate <= 0n || baseFeePerGas <= 0n || maxPriorityFeePerGas < 0n) {
    throw new TypeError("Deployment gas and fee inputs must be positive.");
  }

  // Hardhat Ignition 3 estimates EIP-1559 deployments with this fee ceiling.
  // Monad's RPC checks the sender can cover gasLimit * maxFeePerGas before it
  // runs the estimate, even though the eventual effective fee can be lower.
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;
  const requiredWei = gasEstimate * maxFeePerGas;
  const recommendedWei =
    (requiredWei * (BPS_DENOMINATOR + FUNDING_CUSHION_BPS) +
      BPS_DENOMINATOR -
      1n) /
    BPS_DENOMINATOR;

  return {
    gasEstimate,
    maxFeePerGas,
    requiredWei,
    recommendedWei,
  };
}

export function deploymentFundingFailureMessage({
  address,
  balance,
  requirement,
}) {
  return [
    "Operator balance is too low to deploy PoolCommitmentRegistry at current Monad fees.",
    `  available : ${formatEther(balance)} MON`,
    `  required  : ${formatEther(requirement.requiredWei)} MON (${requirement.gasEstimate} gas at a ${formatGwei(requirement.maxFeePerGas)} gwei Ignition fee ceiling)`,
    `  fund to   : at least ${formatEther(requirement.recommendedWei)} MON (includes a 10% fee-bump cushion)`,
    `  address   : ${address}`,
    "  faucet    : https://faucet.monad.xyz",
    "Without this preflight, the RPC surfaces the shortfall as HHE10409: intrinsic gas greater than limit.",
  ].join("\n");
}

async function resolveIgnitionPriorityFee(client) {
  try {
    return BigInt(
      await client.request({
        method: "eth_maxPriorityFeePerGas",
      }),
    );
  } catch {
    return DEFAULT_PRIORITY_FEE;
  }
}

async function assertDeploymentIsFunded({ account, balance, client }) {
  execFileSync(
    process.execPath,
    [
      HARDHAT_CLI,
      "build",
      "--default-build-profile",
      "production",
      "--quiet",
      "--no-tests",
    ],
    { stdio: "inherit", env: process.env },
  );

  const artifact = JSON.parse(fs.readFileSync(REGISTRY_ARTIFACT, "utf8"));
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [account.address],
  });
  const [gasEstimate, latestBlock, maxPriorityFeePerGas] = await Promise.all([
    // Omitting fee fields is deliberate. A low-balance Monad account otherwise
    // fails before the RPC can return the contract's real gas requirement.
    client.estimateGas({ account: account.address, data }),
    client.getBlock({ blockTag: "latest" }),
    resolveIgnitionPriorityFee(client),
  ]);

  if (latestBlock.baseFeePerGas === null) {
    fail("Monad RPC did not return an EIP-1559 base fee for the latest block.");
  }

  const requirement = deploymentFundingRequirement({
    gasEstimate,
    baseFeePerGas: latestBlock.baseFeePerGas,
    maxPriorityFeePerGas,
  });

  if (balance < requirement.requiredWei) {
    fail(
      deploymentFundingFailureMessage({
        address: account.address,
        balance,
        requirement,
      }),
    );
  }

  console.log(
    `deploy   : ${gasEstimate} gas; ${formatEther(requirement.requiredWei)} MON max-fee reserve`,
  );
}

export async function main() {
  const privateKey = process.env.MONAD_PRIVATE_KEY?.trim();
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    fail("MONAD_PRIVATE_KEY is missing or malformed in .env.local.");
  }

  const account = privateKeyToAccount(privateKey);
  const client = createPublicClient({ transport: http(RPC) });

  const chainId = await client.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    fail(`RPC reports chain ${chainId}; expected Monad Testnet ${EXPECTED_CHAIN_ID}.`);
  }

  const balance = await client.getBalance({ address: account.address });
  console.log(`operator : ${account.address}`);
  console.log(`chain    : ${chainId} (Monad Testnet)`);
  console.log(`balance  : ${formatEther(balance)} MON`);

  let registry = process.env.MONAD_REGISTRY_ADDRESS?.trim() ?? "";

  if (registry) {
    const code = await client.getBytecode({ address: registry });
    if (!code || code === "0x") {
      console.log(`\nConfigured registry ${registry} has no bytecode; redeploying.`);
      registry = "";
    } else {
      console.log(`registry : ${registry} (already deployed)`);
    }
  }

  if (!registry) {
    await assertDeploymentIsFunded({ account, balance, client });
    console.log("\nDeploying PoolCommitmentRegistry to Monad Testnet…");
    const output = execFileSync(
      process.execPath,
      [
        HARDHAT_CLI,
        "ignition",
        "deploy",
        "ignition/modules/PoolCommitmentRegistry.ts",
        "--network",
        "monadTestnet",
      ],
      { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"], env: process.env },
    );
    console.log(output);

    const match = output.match(/0x[a-fA-F0-9]{40}/g)?.at(-1);
    if (!match) fail("Could not read a deployed address from the Ignition output.");
    registry = match;

    const envPath = ".env.local";
    const current = fs.readFileSync(envPath, "utf8");
    fs.writeFileSync(
      envPath,
      current.includes("MONAD_REGISTRY_ADDRESS=")
        ? current.replace(
            /^MONAD_REGISTRY_ADDRESS=.*$/m,
            `MONAD_REGISTRY_ADDRESS=${registry}`,
          )
        : `${current.replace(/\n*$/, "\n")}MONAD_REGISTRY_ADDRESS=${registry}\n`,
    );
    console.log(`\nWrote MONAD_REGISTRY_ADDRESS=${registry} to .env.local`);
  }

  // Finalized-state verification: bytecode present and operator matches the signer.
  const operator = await client.readContract({
    address: registry,
    abi: [
      {
        type: "function",
        name: "operator",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "address" }],
      },
    ],
    functionName: "operator",
    blockTag: "finalized",
  });

  const matches = operator.toLowerCase() === account.address.toLowerCase();
  console.log(`\nfinalized operator() : ${operator}`);
  console.log(`configured signer    : ${account.address}`);
  console.log(
    matches ? "\n✔ Monad is ready. Set MONAD_LIVE_REQUIRED=true to enforce the gate." : "",
  );

  if (!matches) {
    fail("The finalized registry operator does not match the configured signer.");
  }

  console.log(`explorer: https://testnet.monadexplorer.com/address/${registry}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
