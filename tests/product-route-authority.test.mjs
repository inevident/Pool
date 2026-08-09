import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

import { NextRequest } from "next/server.js";
import { createCanonicalProductWorkspace } from "../lib/product/index.ts";

const typeScriptLoader = `
  import { readFile } from "node:fs/promises";
  import { createRequire } from "node:module";
  const require = createRequire(process.cwd() + "/product-route-authority-loader.mjs");
  const ts = require("typescript");
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export%20{}", shortCircuit: true };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      const input = await readFile(new URL(url), "utf8");
      const source = ts.transpileModule(input, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      return { format: "module", shortCircuit: true, source };
    }
    return nextLoad(url, context);
  }
`;
register(
  `data:text/javascript,${encodeURIComponent(typeScriptLoader)}`,
  import.meta.url,
);

const { POST: COMMIT } = await import("../app/api/pool/commit/route.ts");
const { POST: SETTLE } = await import("../app/api/pool/settle/route.ts");
const { POST: EXECUTE_HERO } = await import("../app/api/rain/execute/route.ts");

const trackedEnvironment = [
  "NODE_ENV",
  "POOL_DEMO_ACCESS_TOKEN",
  "RAIN_LIVE_EXECUTION_ENABLED",
  "RAIN_API_BASE_URL",
  "RAIN_API_KEY",
  "RAIN_TEAM_ID",
  "RAIN_USER_ID",
  "RAIN_CONTRACT_ID",
  "MONAD_LIVE_REQUIRED",
  "MONAD_TESTNET_RPC_URL",
  "MONAD_REGISTRY_ADDRESS",
  "MONAD_PRIVATE_KEY",
  "MONAD_COMMITMENT_ID",
];
const originalEnvironment = new Map(
  trackedEnvironment.map((name) => [name, process.env[name]]),
);
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const nowMs = Date.parse("2026-08-22T16:15:00.000Z");

const catalog = createCanonicalProductWorkspace();
const pool = catalog.pools["pool-sony-xm6-august"];
const product = catalog.products[pool.productId];
const membership = {
  id: "browser-membership-authority-test",
  poolId: pool.id,
  intentId: "browser-intent-authority-test",
  buyerId: catalog.owner.id,
  quantity: 1,
  reservedCents: product.msrpUnitCents,
  status: "active",
  joinedAt: "2026-08-10T16:00:00.000Z",
};
const intent = {
  id: membership.intentId,
  buyerId: membership.buyerId,
  productId: product.id,
  quantity: membership.quantity,
  targetUnitPriceCents: pool.estimatedUnitPriceCents,
  createdAt: "2026-08-10T15:00:00.000Z",
  expiresAt: "2026-09-08T16:00:00.000Z",
  status: "joined",
};
function clearEnvironment() {
  for (const name of trackedEnvironment) delete process.env[name];
}

function configureRain() {
  process.env.RAIN_API_BASE_URL = "https://rain.example";
  process.env.RAIN_API_KEY = "rain-test-key";
  process.env.RAIN_TEAM_ID = "rain-test-team";
  process.env.RAIN_USER_ID = "rain-test-user";
  process.env.RAIN_CONTRACT_ID = "rain-test-contract";
}

function configureMonad() {
  process.env.MONAD_TESTNET_RPC_URL = "https://rpc.example";
  process.env.MONAD_REGISTRY_ADDRESS =
    "0x1111111111111111111111111111111111111111";
  process.env.MONAD_PRIVATE_KEY = `0x${"01".repeat(32)}`;
}

function settlementRequest({ cookie, ip = "203.0.113.210" } = {}) {
  return new NextRequest("https://pool.example/api/pool/settle", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pool-demo-action": "settle-pool-order",
      "x-real-ip": ip,
      origin: "https://pool.example",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      poolId: pool.id,
      membership,
      intent,
      confirmation: "settle-pool-order",
    }),
  });
}

function commitRequest({ cookie, ip = "203.0.113.211" } = {}) {
  return new NextRequest("https://pool.example/api/pool/commit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pool-demo-action": "commit-funded-demand",
      "x-real-ip": ip,
      origin: "https://pool.example",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      poolId: pool.id,
      membership,
      confirmation: "commit-funded-demand",
    }),
  });
}

test.beforeEach(() => {
  clearEnvironment();
  Date.now = () => nowMs;
  globalThis.fetch = originalFetch;
});

test.after(() => {
  clearEnvironment();
  for (const [name, value] of originalEnvironment) {
    if (value !== undefined) process.env[name] = value;
  }
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
});

test("public production requests cause zero Monad or Rain contacts", async () => {
  process.env.NODE_ENV = "production";
  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  configureRain();
  configureMonad();
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error("no external contact is authorized");
  };

  const settleResponse = await SETTLE(settlementRequest());
  const settleBody = await settleResponse.json();
  const commitResponse = await COMMIT(commitRequest());
  const commitBody = await commitResponse.json();

  assert.equal(externalCalls, 0);
  assert.equal(settleBody.status, "modeled_quote");
  assert.equal(settleBody.evidence, "rehearsal");
  assert.equal(settleBody.authority, "product_rehearsal_only");
  assert.equal(settleBody.aggregateOrderPlaced, false);
  assert.equal(settleBody.reservationState, "release_available");
  assert.equal(settleBody.releaseReason, "rehearsal_complete");
  assert.equal(settleBody.modeledAllocationCents, 37_765);
  assert.equal(settleBody.modeledSavingsCents, 7_234);
  assert.equal("capturedCents" in settleBody, false);
  assert.equal("releasedCents" in settleBody, false);
  assert.equal(
    settleBody.code,
    "aggregate_provider_allocations_unavailable",
  );
  assert.equal(commitBody.status, "rehearsal_only");
});

test("even authenticated live-configured product requests remain zero-write rehearsals", async () => {
  process.env.NODE_ENV = "production";
  process.env.POOL_DEMO_ACCESS_TOKEN =
    "product-route-authority-secret-for-tests";
  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  configureRain();
  configureMonad();
  const cookie = "pool_demo_access=irrelevant-product-route-cookie";
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error("pure rehearsal must not contact providers");
  };

  const commitResponse = await COMMIT(
    commitRequest({ cookie, ip: "203.0.113.212" }),
  );
  const settleResponse = await SETTLE(
    settlementRequest({ cookie, ip: "203.0.113.213" }),
  );
  const commitBody = await commitResponse.json();
  const settleBody = await settleResponse.json();

  assert.equal(externalCalls, 0);
  assert.equal(commitBody.status, "rehearsal_only");
  assert.equal(settleBody.status, "modeled_quote");
  assert.equal(settleBody.evidence, "rehearsal");
  assert.equal(settleBody.authority, "product_rehearsal_only");
  assert.equal(settleBody.aggregateOrderPlaced, false);
});

test("production post-close product requests safely release without provider contact", async () => {
  process.env.NODE_ENV = "production";
  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  configureRain();
  configureMonad();
  Date.now = () => Date.parse("2026-08-22T17:00:00.000Z");
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error("closed product rehearsal must not contact providers");
  };

  const commitResponse = await COMMIT(
    commitRequest({ ip: "203.0.113.214" }),
  );
  const settleResponse = await SETTLE(
    settlementRequest({ ip: "203.0.113.215" }),
  );
  const commitBody = await commitResponse.json();
  const settleBody = await settleResponse.json();

  assert.equal(externalCalls, 0);
  for (const body of [commitBody, settleBody]) {
    assert.equal(body.status, "execution_window_missed");
    assert.equal(body.reservationState, "release_available");
    assert.equal(body.releaseReason, "execution_window_missed");
    assert.equal(body.providerOperationState, "impossible_by_design");
    assert.equal(body.resolutionBasis, "product_rehearsal_only");
  }
});

test("an off-policy probe authorization stays locked when reversal fails", async () => {
  process.env.NODE_ENV = "development";
  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  configureRain();
  let cardIndex = 0;
  const reversalKeys = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path === "/simulate/collateral/fund") return Response.json({});
    if (path.endsWith("/cards/scoped")) {
      cardIndex += 1;
      return Response.json({
        id: `40000000-0000-4000-8000-${String(cardIndex).padStart(12, "0")}`,
        last4: String(cardIndex).padStart(4, "0"),
        expirationMonth: "08",
        expirationYear: "2028",
        status: "active",
      });
    }
    if (path === "/simulate/transactions/authorize") {
      return Response.json({
        transactionId: "50000000-0000-4000-8000-000000000001",
        status: "authorized",
      });
    }
    if (path.endsWith("/reverse")) {
      const key = new Headers(init.headers).get("idempotency-key");
      reversalKeys.push(key);
      return Response.json({ message: "reversal unavailable" }, { status: 502 });
    }
    throw new Error(`Unexpected hero provider path ${path}`);
  };

  const response = await EXECUTE_HERO(
    new NextRequest("http://localhost:3000/api/rain/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pool-demo-action": "execute-sandbox",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        scenarioVersion: "monitor-pool-v1",
        confirmation: "execute-rain-sandbox",
      }),
    }),
  );
  const body = await response.json();

  assert.equal(body.status, "failed");
  assert.equal(body.funding.state, "reconciliation_required");
  assert.ok(body.progress.reversalFailures >= 1);
  assert.ok(reversalKeys.length >= 1);
  assert.ok(reversalKeys.every((key) => key.length <= 64));
  assert.equal(new Set(reversalKeys).size, 1, "retries use one stable key");
});

test("network-ambiguous probe and buyer authorizations both force reconciliation", async () => {
  process.env.NODE_ENV = "development";
  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  configureRain();
  const NativeDate = globalThis.Date;
  let fakeNow = NativeDate.parse("2026-08-11T12:00:00.000Z");
  class FakeDate extends NativeDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fakeNow]));
    }
    static now() {
      return fakeNow;
    }
  }
  globalThis.Date = FakeDate;

  let mode = "probe";
  let cardIndex = 0;
  let authorizationCall = 0;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/simulate/collateral/fund") return Response.json({});
    if (path.endsWith("/cards/scoped")) {
      cardIndex += 1;
      return Response.json({
        id: `60000000-0000-4000-8000-${String(cardIndex).padStart(12, "0")}`,
        last4: String(cardIndex).padStart(4, "0"),
        expirationMonth: "08",
        expirationYear: "2028",
        status: "active",
      });
    }
    if (path === "/simulate/transactions/authorize") {
      authorizationCall += 1;
      if (mode === "real" && authorizationCall === 1) {
        return Response.json({
          transactionId: "70000000-0000-4000-8000-000000000001",
          status: "declined",
          declinedReason: "scoped_card_mcc_not_allowed",
        });
      }
      throw new Error(`${mode} authorization response lost`);
    }
    throw new Error(`Unexpected ambiguous-provider path ${path}`);
  };

  const execute = () =>
    EXECUTE_HERO(
      new NextRequest("http://localhost:3000/api/rain/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pool-demo-action": "execute-sandbox",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          scenarioVersion: "monitor-pool-v1",
          confirmation: "execute-rain-sandbox",
        }),
      }),
    );

  try {
    const probeResponse = await execute();
    const probeBody = await probeResponse.json();
    assert.equal(probeBody.funding.state, "reconciliation_required");
    assert.equal(probeBody.progress.authorizationAmbiguous, true);
    assert.equal(probeBody.progress.authorizations, 0);

    fakeNow += 9_000;
    mode = "real";
    cardIndex = 0;
    authorizationCall = 0;
    const realResponse = await execute();
    const realBody = await realResponse.json();
    assert.equal(realBody.funding.state, "reconciliation_required");
    assert.equal(realBody.progress.authorizationAmbiguous, true);
    assert.equal(realBody.progress.authorizations, 0);
  } finally {
    globalThis.Date = NativeDate;
  }
});

test("a generic probe decline cannot substantiate the MCC guardrail", async () => {
  process.env.NODE_ENV = "development";
  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  configureRain();
  const NativeDate = globalThis.Date;
  const fakeNow = NativeDate.parse("2030-08-11T12:00:00.000Z");
  class FakeDate extends NativeDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fakeNow]));
    }
    static now() {
      return fakeNow;
    }
  }
  globalThis.Date = FakeDate;

  let cardIndex = 0;
  let authorizationCalls = 0;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/simulate/collateral/fund") return Response.json({});
    if (path.endsWith("/cards/scoped")) {
      cardIndex += 1;
      return Response.json({
        id: `80000000-0000-4000-8000-${String(cardIndex).padStart(12, "0")}`,
        last4: String(cardIndex).padStart(4, "0"),
        expirationMonth: "08",
        expirationYear: "2030",
        status: "active",
      });
    }
    if (path === "/simulate/transactions/authorize") {
      authorizationCalls += 1;
      return Response.json({
        transactionId: "90000000-0000-4000-8000-000000000001",
        status: "declined",
        declinedReason: "insufficient_balance",
      });
    }
    throw new Error(`Unexpected generic-decline provider path ${path}`);
  };

  try {
    const response = await EXECUTE_HERO(
      new NextRequest("http://localhost:3000/api/rain/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pool-demo-action": "execute-sandbox",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          scenarioVersion: "monitor-pool-v1",
          confirmation: "execute-rain-sandbox",
        }),
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.status, "failed");
    assert.equal(body.code, "guardrail_decline_unverified");
    assert.equal(body.progress.authorizations, 0);
    assert.equal(body.progress.settlements, 0);
    assert.equal(authorizationCalls, 1, "legitimate charges must not begin");
  } finally {
    globalThis.Date = NativeDate;
  }
});

test("product routes contain no Monad or Rain execution contact", async () => {
  const [commitSource, settleSource] = await Promise.all([
    readFile(new URL("../app/api/pool/commit/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pool/settle/route.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [commitSource, settleSource]) {
    assert.match(source, /aggregate_provider_allocations_unavailable/);
    assert.doesNotMatch(source, /registerMerchantOfferOnMonad/);
    assert.doesNotMatch(source, /commitCoalitionOnMonad/);
    assert.doesNotMatch(source, /authorizeCard/);
    assert.doesNotMatch(source, /settleAuthorization/);
  }
});
