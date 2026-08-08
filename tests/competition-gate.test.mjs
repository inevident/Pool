import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import {
  assertMonadOperatorMatchesRegistry,
  getMonadRainGate,
  getMonadWriteConfiguration,
  MonadRegistryError,
} from "../lib/monad/server.ts";

const trackedEnvironment = [
  "NODE_ENV",
  "MONAD_LIVE_REQUIRED",
  "MONAD_TESTNET_RPC_URL",
  "MONAD_REGISTRY_ADDRESS",
  "MONAD_COMMITMENT_ID",
  "MONAD_PRIVATE_KEY",
  "POOL_DEMO_ACCESS_TOKEN",
  "RAIN_LIVE_EXECUTION_ENABLED",
  "RAIN_API_KEY",
  "RAIN_TEAM_ID",
  "RAIN_USER_ID",
  "RAIN_CONTRACT_ID",
];
const originalEnvironment = new Map(
  trackedEnvironment.map((name) => [name, process.env[name]]),
);

function clearGateEnvironment() {
  for (const name of trackedEnvironment) delete process.env[name];
}

test.beforeEach(clearGateEnvironment);
test.afterEach(() => {
  clearGateEnvironment();
  for (const [name, value] of originalEnvironment) {
    if (value !== undefined) process.env[name] = value;
  }
});

test("Monad may be absent in development and a no-secret production rehearsal", () => {
  process.env.NODE_ENV = "development";
  const local = getMonadWriteConfiguration();
  assert.equal(local.state, "not-configured");
  assert.equal(local.required, false);
  assert.equal(local.rainOnlyAllowed, true);
  assert.deepEqual(getMonadRainGate(local), {
    allowed: true,
    mode: "rain-only-development",
    code: null,
    message:
      "Development-only Rain integration; Monad proof is local and no on-chain claim is made.",
  });

  process.env.NODE_ENV = "production";
  const rehearsal = getMonadWriteConfiguration();
  assert.equal(rehearsal.required, false);
  assert.equal(rehearsal.rainOnlyAllowed, true);
  assert.equal(getMonadRainGate(rehearsal).allowed, true);

  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  const productionLive = getMonadWriteConfiguration();
  assert.equal(productionLive.state, "not-configured");
  assert.equal(productionLive.required, true);
  assert.equal(productionLive.ready, false);
  assert.equal(productionLive.rainOnlyAllowed, false);
  assert.equal(getMonadRainGate(productionLive).allowed, false);
  assert.equal(
    getMonadRainGate(productionLive).code,
    "MONAD_CONFIGURATION_REQUIRED",
  );
});

test("MONAD_LIVE_REQUIRED applies the production gate to local rehearsals", () => {
  process.env.NODE_ENV = "development";
  process.env.MONAD_LIVE_REQUIRED = "true";
  const configuration = getMonadWriteConfiguration();
  assert.equal(configuration.required, true);
  assert.equal(configuration.ready, false);
  assert.equal(configuration.rainOnlyAllowed, false);
});

test("partial and malformed Monad values never become Rain-only mode", () => {
  process.env.NODE_ENV = "development";
  process.env.MONAD_REGISTRY_ADDRESS =
    "0x1111111111111111111111111111111111111111";
  let configuration = getMonadWriteConfiguration();
  assert.equal(configuration.state, "partial");
  assert.equal(configuration.rainOnlyAllowed, false);
  assert.ok(
    configuration.issues.some(
      (issue) => issue.code === "PARTIAL_MONAD_CONFIGURATION",
    ),
  );

  process.env.MONAD_PRIVATE_KEY = "not-a-private-key";
  process.env.MONAD_TESTNET_RPC_URL = "http://rpc.example";
  configuration = getMonadWriteConfiguration();
  assert.equal(configuration.state, "invalid");
  assert.equal(configuration.ready, false);
  assert.ok(
    configuration.issues.some(
      (issue) => issue.code === "INVALID_OPERATOR_PRIVATE_KEY",
    ),
  );
  assert.ok(
    configuration.issues.some((issue) => issue.code === "INSECURE_RPC_URL"),
  );
});

test("a syntactically complete Testnet configuration is ready for on-chain verification", () => {
  process.env.MONAD_REGISTRY_ADDRESS =
    "0x1111111111111111111111111111111111111111";
  process.env.MONAD_PRIVATE_KEY = `0x${"01".repeat(32)}`;
  process.env.MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz";
  const configuration = getMonadWriteConfiguration();
  assert.equal(configuration.state, "ready");
  assert.equal(configuration.ready, true);
  assert.deepEqual(configuration.issues, []);
});

test("a signer that does not control registry.operator is rejected", () => {
  assert.throws(
    () =>
      assertMonadOperatorMatchesRegistry(
        getAddress("0x1111111111111111111111111111111111111111"),
        getAddress("0x2222222222222222222222222222222222222222"),
      ),
    (error) =>
      error instanceof MonadRegistryError && error.code === "OPERATOR_MISMATCH",
  );
});
