import assert from "node:assert/strict";
import test from "node:test";

import { keccak256, toBytes } from "viem";

import { evaluateMerchantBidRuntime } from "../lib/agent/merchant-runtime.ts";
import { buildHeroCoalitionCommitment } from "../lib/monad/commitment.ts";
import { HERO_DEMO } from "../lib/market/index.ts";

const request = {
  merchantId: "merchant-signal",
  unitPriceCents: 38_900,
  deliveryDays: 7,
  warrantyMonths: 36,
  rfpVersion: HERO_DEMO.fundedCoalition.version,
};

const commitmentId = keccak256(toBytes("merchant-runtime-commitment"));

const fakeTransaction = {
  hash: keccak256(toBytes("merchant-offer-transaction")),
  blockNumber: BigInt(4242),
  status: "success",
  confirmation: "finalized",
  explorerUrl: "https://testnet.monadvision.com/tx/merchant-offer-transaction",
};

function configuredAdapter(calls, options = {}) {
  const commitment = buildHeroCoalitionCommitment({
    bidClosesAt: options.bidClosesAt ?? "2026-08-10T00:00:00.000Z",
  });
  return {
    getConfiguration() {
      return {
        ready: true,
        state: "ready",
        rainOnlyAllowed: false,
        registryConfigured: true,
        operatorConfigured: true,
        required: true,
        issues: [],
        network: "Monad Testnet",
        chainId: 10_143,
      };
    },
    async requireFinalizedMarket() {
      calls.push("verify-finalized-funding-root");
      return {
        runKey: "pool-monad-monitor-v1-2026-08-08",
        commitment,
        commitmentId,
        commitmentTransaction: null,
        offerTransactions: [],
        preparedAt: options.preparedAt ?? "2026-08-08T18:29:59.000Z",
      };
    },
    async registerOffer(input) {
      calls.push("register-finalized-offer");
      assert.equal(input.commitmentId, commitmentId);
      assert.match(input.offerHash, /^0x[0-9a-f]{64}$/);
      return {
        commitmentId,
        replayed: options.replayed ?? false,
        transaction: options.replayed ? null : fakeTransaction,
      };
    },
  };
}

test("a passing live bid verifies finalized demand first and returns finalized offer evidence", async () => {
  const calls = [];
  const result = await evaluateMerchantBidRuntime(request, {
    chainWriteAuthorized: true,
    now: new Date("2026-08-08T18:30:00.987Z"),
    adapter: configuredAdapter(calls),
  });

  assert.deepEqual(calls, [
    "verify-finalized-funding-root",
    "register-finalized-offer",
  ]);
  assert.equal(result.status, "leading");
  assert.equal(result.mode, "monad_gated_policy");
  assert.equal(result.bid.issuedAt, "2026-08-08T18:30:00.000Z");
  assert.ok(Date.parse(result.bid.issuedAt) > Date.parse(result.monad.committedAt));
  assert.equal(result.monad.status, "offer_registered");
  assert.equal(result.monad.confirmation, "finalized");
  assert.equal(result.monad.replayed, false);
  assert.equal(result.monad.chainWriteAttempted, true);
  assert.equal(result.monad.transaction.hash, fakeTransaction.hash);
  assert.equal(result.monad.transaction.blockNumber, "4242");
  assert.equal(result.financialAuthorization, "not_requested");

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("maxUnitPriceCents"), false);
  assert.equal(serialized.includes("targetUnitPriceCents"), false);
  assert.equal(serialized.includes("Harbor Labs"), false);
  assert.equal(serialized.includes("Patchwork AI"), false);
  assert.equal(serialized.includes("Kernel Works"), false);
});

test("a finalized offer replay is reported honestly without claiming a new transaction", async () => {
  const calls = [];
  const result = await evaluateMerchantBidRuntime(request, {
    chainWriteAuthorized: true,
    now: new Date("2026-08-08T18:30:00.000Z"),
    adapter: configuredAdapter(calls, { replayed: true }),
  });

  assert.equal(result.monad.status, "offer_registered");
  assert.equal(result.monad.replayed, true);
  assert.equal(result.monad.chainWriteAttempted, false);
  assert.equal(result.monad.confirmation, "finalized-state");
  assert.equal(result.monad.transaction, null);
  assert.match(result.message, /already finalized/i);
});

test("a rejected bid reads the finalized funding gate but never writes an offer", async () => {
  const calls = [];
  const result = await evaluateMerchantBidRuntime(
    { ...request, unitPriceCents: 38_800 },
    {
      chainWriteAuthorized: true,
      now: new Date("2026-08-08T18:30:00.000Z"),
      adapter: configuredAdapter(calls),
    },
  );

  assert.deepEqual(calls, ["verify-finalized-funding-root"]);
  assert.equal(result.status, "rejected");
  assert.equal(result.monad.status, "policy_rejected");
  assert.equal(result.monad.chainWriteAttempted, false);
  assert.equal(result.monad.offerHash, null);
  assert.equal(result.financialAuthorization, "not_requested");
});

test("chain writes fail before any finalized read when protected access is absent", async () => {
  const calls = [];
  await assert.rejects(
    evaluateMerchantBidRuntime(request, {
      chainWriteAuthorized: false,
      now: new Date("2026-08-08T18:30:00.000Z"),
      adapter: configuredAdapter(calls),
    }),
    (error) =>
      error?.code === "MONAD_BID_ACCESS_REQUIRED" && error?.status === 401,
  );
  assert.deepEqual(calls, []);
});

test("partial or explicitly required Monad configuration fails closed", async () => {
  const adapter = {
    getConfiguration() {
      return {
        ready: false,
        state: "partial",
        rainOnlyAllowed: false,
        registryConfigured: true,
        operatorConfigured: false,
        required: true,
        issues: [
          {
            code: "PARTIAL_MONAD_CONFIGURATION",
            message: "Monad configuration is partial.",
          },
        ],
        network: "Monad Testnet",
        chainId: 10_143,
      };
    },
    async requireFinalizedMarket() {
      assert.fail("incomplete configuration must fail before RPC access");
    },
    async registerOffer() {
      assert.fail("incomplete configuration must never write");
    },
  };

  await assert.rejects(
    evaluateMerchantBidRuntime(request, {
      chainWriteAuthorized: true,
      adapter,
    }),
    (error) => error?.code === "MONAD_CONFIGURATION_INCOMPLETE",
  );
});

test("malformed Monad configuration cannot silently become a local bid", async () => {
  const adapter = {
    getConfiguration() {
      return {
        ready: false,
        state: "invalid",
        rainOnlyAllowed: false,
        registryConfigured: false,
        operatorConfigured: false,
        required: false,
        issues: [
          {
            code: "INVALID_RPC_URL",
            message: "The configured RPC URL is invalid.",
          },
        ],
        network: "Monad Testnet",
        chainId: 10_143,
      };
    },
    async requireFinalizedMarket() {
      assert.fail("malformed configuration must fail before RPC access");
    },
    async registerOffer() {
      assert.fail("malformed configuration must never write");
    },
  };

  await assert.rejects(
    evaluateMerchantBidRuntime(request, {
      chainWriteAuthorized: true,
      adapter,
    }),
    (error) => error?.code === "MONAD_CONFIGURATION_INCOMPLETE",
  );
});

test("an unconfigured environment stays a clearly labeled no-write fallback", async () => {
  const adapter = {
    getConfiguration() {
      return {
        ready: false,
        state: "not-configured",
        rainOnlyAllowed: true,
        registryConfigured: false,
        operatorConfigured: false,
        required: false,
        issues: [],
        network: "Monad Testnet",
        chainId: 10_143,
      };
    },
    async requireFinalizedMarket() {
      assert.fail("local fallback must not contact Monad");
    },
    async registerOffer() {
      assert.fail("local fallback must not write to Monad");
    },
  };

  const result = await evaluateMerchantBidRuntime(request, {
    chainWriteAuthorized: false,
    adapter,
  });
  assert.equal(result.status, "leading");
  assert.equal(result.mode, "deterministic_policy_local");
  assert.equal(result.monad.status, "not_configured");
  assert.equal(result.monad.chainWriteAttempted, false);
  assert.equal(result.monad.transaction, null);
  assert.match(result.message, /no on-chain offer was claimed/i);
});

test("the runtime refuses to evaluate after the finalized bid close", async () => {
  const calls = [];
  await assert.rejects(
    evaluateMerchantBidRuntime(request, {
      chainWriteAuthorized: true,
      now: new Date("2026-08-10T00:00:00.000Z"),
      adapter: configuredAdapter(calls),
    }),
    (error) => error?.code === "BIDDING_WINDOW_CLOSED" && error?.status === 409,
  );
  assert.deepEqual(calls, ["verify-finalized-funding-root"]);
});
