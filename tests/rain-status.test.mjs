import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { NextRequest } from "next/server.js";

// Node's built-in type stripping intentionally rejects TypeScript parameter
// properties, which the Rain client uses. Transpile route dependencies in this
// test process so the actual Route Handler can be exercised without a server.
const typeScriptLoader = `
  import { readFile } from "node:fs/promises";
  import { createRequire } from "node:module";
  const require = createRequire(process.cwd() + "/rain-status-test-loader.mjs");
  const ts = require("typescript");
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export%20{}", shortCircuit: true };
    }
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      const input = await readFile(new URL(url), "utf8");
      const source = ts.transpileModule(input, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
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

const { GET } = await import("../app/api/rain/status/route.ts");
const { GET: GET_BALANCE } = await import("../app/api/rain/balance/route.ts");

const trackedEnvironment = [
  "NODE_ENV",
  "RAIN_API_BASE_URL",
  "RAIN_API_KEY",
  "RAIN_TEAM_ID",
  "RAIN_USER_ID",
  "RAIN_CONTRACT_ID",
  "RAIN_LIVE_EXECUTION_ENABLED",
  "POOL_DEMO_ACCESS_TOKEN",
  "MONAD_LIVE_REQUIRED",
  "MONAD_TESTNET_RPC_URL",
  "MONAD_REGISTRY_ADDRESS",
  "MONAD_COMMITMENT_ID",
  "MONAD_PRIVATE_KEY",
];
const originalEnvironment = new Map(
  trackedEnvironment.map((name) => [name, process.env[name]]),
);
const originalFetch = globalThis.fetch;

function clearStatusEnvironment() {
  for (const name of trackedEnvironment) delete process.env[name];
}

function configureRain() {
  process.env.RAIN_API_BASE_URL = "https://sandbox.example";
  process.env.RAIN_API_KEY = "test-api-key";
  process.env.RAIN_TEAM_ID = "test-team-id";
  process.env.RAIN_USER_ID = "test-user-id";
  process.env.RAIN_CONTRACT_ID = "test-contract-id";
}

test.beforeEach(() => {
  clearStatusEnvironment();
  process.env.NODE_ENV = "development";
  globalThis.fetch = originalFetch;
});

test.after(() => {
  clearStatusEnvironment();
  for (const [name, value] of originalEnvironment) {
    if (value !== undefined) process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
});

test("an unconfigured Rain integration is a successful status observation", async () => {
  const response = await GET(
    new NextRequest("http://localhost:3000/api/rain/status"),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.readiness, "unconfigured");
  assert.equal(body.configured, false);
  assert.equal(body.connected, false);
  assert.equal(body.liveExecutionEnabled, false);
});

test("partial Monad configuration is observed as blocked without weakening the gate", async () => {
  configureRain();
  process.env.MONAD_PRIVATE_KEY = `0x${"01".repeat(32)}`;

  const response = await GET(
    new NextRequest("http://localhost:3000/api/rain/status"),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.readiness, "blocked");
  assert.equal(body.integrationMode, "blocked");
  assert.equal(body.code, "PARTIAL_MONAD_CONFIGURATION");
  assert.equal(body.configured, true);
  assert.equal(body.connected, false);
  assert.equal(body.liveExecutionEnabled, false);
  assert.equal(body.monadReady, false);
});

test("an invalid demo-access configuration is reported as blocked with HTTP 200", async () => {
  configureRain();
  process.env.POOL_DEMO_ACCESS_TOKEN = "too-short";

  const response = await GET(
    new NextRequest("http://localhost:3000/api/rain/status"),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.readiness, "blocked");
  assert.equal(body.code, "DEMO_ACCESS_CONFIGURATION_INVALID");
  assert.equal(body.accessRequired, true);
  assert.equal(body.accessUnlocked, false);
  assert.equal(body.liveExecutionEnabled, false);
});

test("a Rain provider failure is a degraded observation rather than a handler failure", async () => {
  configureRain();
  globalThis.fetch = async () =>
    Response.json(
      { message: "Sandbox authentication was rejected" },
      { status: 401 },
    );

  const response = await GET(
    new NextRequest("http://localhost:3000/api/rain/status"),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.readiness, "degraded");
  assert.equal(body.configured, true);
  assert.equal(body.connected, false);
  assert.equal(body.message, "Sandbox authentication was rejected");
});

test("production credentials never trigger a public Rain status or balance read", async () => {
  configureRain();
  process.env.NODE_ENV = "production";
  delete process.env.POOL_DEMO_ACCESS_TOKEN;
  delete process.env.RAIN_LIVE_EXECUTION_ENABLED;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("provider contact must remain locked");
  };

  const statusResponse = await GET(
    new NextRequest("https://pool.example/api/rain/status"),
  );
  const statusBody = await statusResponse.json();
  const balanceResponse = await GET_BALANCE(
    new NextRequest("https://pool.example/api/rain/balance"),
  );
  const balanceBody = await balanceResponse.json();

  assert.equal(providerCalls, 0);
  assert.equal(statusResponse.status, 200);
  assert.equal(statusBody.readiness, "blocked");
  assert.equal(statusBody.code, "RAIN_PROVIDER_ACCESS_LOCKED");
  assert.equal(balanceBody.source, "local");
  assert.match(balanceBody.reason, /locked/i);
});

test("authorized development provider observations are rate bounded", async () => {
  configureRain();
  globalThis.fetch = async () => Response.json([]);
  const headers = { "x-real-ip": "203.0.113.177" };

  for (let index = 0; index < 12; index += 1) {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/rain/status", { headers }),
    );
    assert.equal(response.status, 200);
  }
  const limited = await GET(
    new NextRequest("http://localhost:3000/api/rain/status", { headers }),
  );
  const body = await limited.json();
  assert.equal(limited.status, 429);
  assert.equal(body.code, "RATE_LIMITED");
  assert.equal(limited.headers.get("retry-after"), "60");
});
