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
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPECTED_CHAIN_ID = 10_143;

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

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

if (balance === 0n) {
  fail(
    `Operator has no testnet gas.\n  Fund ${account.address} at https://faucet.monad.xyz then re-run.`,
  );
}

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
  console.log("\nDeploying PoolCommitmentRegistry to Monad Testnet…");
  const output = execFileSync(
    process.execPath,
    [
      "./node_modules/hardhat/dist/src/cli.js",
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
      ? current.replace(/^MONAD_REGISTRY_ADDRESS=.*$/m, `MONAD_REGISTRY_ADDRESS=${registry}`)
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
console.log(matches ? "\n✔ Monad is ready. Set MONAD_LIVE_REQUIRED=true to enforce the gate." : "");

if (!matches) {
  fail("The finalized registry operator does not match the configured signer.");
}

console.log(`explorer: https://testnet.monadexplorer.com/address/${registry}\n`);
