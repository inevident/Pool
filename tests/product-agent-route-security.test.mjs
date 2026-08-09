import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { NextRequest } from "next/server.js";
import {
  createDemoSession,
  DEMO_ACCESS_COOKIE,
} from "../lib/security/demo-access.ts";

const nextServerLoader = `
  import { readFile } from "node:fs/promises";
  import { createRequire } from "node:module";
  const require = createRequire(process.cwd() + "/product-agent-route-test-loader.mjs");
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
  `data:text/javascript,${encodeURIComponent(nextServerLoader)}`,
  import.meta.url,
);

const { POST } = await import("../app/api/agent/product-intent/route.ts");

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  POOL_DEMO_ACCESS_TOKEN: process.env.POOL_DEMO_ACCESS_TOKEN,
};
const originalFetch = globalThis.fetch;
const intent =
  "I want 2 Sony XM6 headphones under $400 each and can wait 30 days.";
let requestSequence = 20;

function productIntentRequest({
  headers = {},
  body = JSON.stringify({ intent }),
  ip,
} = {}) {
  return new NextRequest("https://pool.example/api/agent/product-intent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pool-agent-action": "interpret-product-intent",
      "x-real-ip": ip ?? `203.0.113.${requestSequence++}`,
      origin: "https://pool.example",
      ...headers,
    },
    body,
  });
}

test.beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.OPENAI_API_KEY = "sk-test-product-agent-route";
  delete process.env.POOL_DEMO_ACCESS_TOKEN;
  globalThis.fetch = originalFetch;
});

test.after(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
});

test("public production requests always use the deterministic runtime", async () => {
  let modelCalls = 0;
  globalThis.fetch = async () => {
    modelCalls += 1;
    throw new Error("The public route must not call the model.");
  };

  const response = await POST(productIntentRequest());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "deterministic_fallback");
  assert.equal(body.decision.financialAuthorization, "not_requested");
  assert.equal(body.decision.interpretationMovedCents, 0);
  assert.equal(modelCalls, 0);
});

test("one valid protected demo session unlocks one bounded model call", async () => {
  process.env.POOL_DEMO_ACCESS_TOKEN =
    "product-agent-route-access-secret-for-tests";
  const session = createDemoSession();
  assert.ok(session);
  let modelCalls = 0;
  globalThis.fetch = async () => {
    modelCalls += 1;
    return Response.json({
      id: "resp_product_route_security",
      model: "gpt-5.6",
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "extract_catalog_purchase_mandate",
          arguments: JSON.stringify({
            productId: "product-sony-wh1000xm6",
            productLabel: "Sony XM6 headphones",
            quantity: 2,
            maxUnitPriceCents: 40_000,
            patienceDays: 30,
            clarification: null,
          }),
        },
      ],
    });
  };

  const response = await POST(
    productIntentRequest({
      headers: { cookie: `${DEMO_ACCESS_COOKIE}=${session.value}` },
    }),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "openai_responses");
  assert.equal(body.modelResponseId, "resp_product_route_security");
  assert.equal(modelCalls, 1);
});

test("same-origin action and JSON content type are mandatory", async () => {
  const crossOrigin = await POST(
    productIntentRequest({ headers: { origin: "https://attacker.example" } }),
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "ORIGIN_REJECTED");

  const wrongAction = await POST(
    productIntentRequest({
      headers: { "x-pool-agent-action": "reserve-product" },
    }),
  );
  assert.equal(wrongAction.status, 403);
  assert.equal((await wrongAction.json()).code, "INVALID_ACTION_HEADER");

  const wrongContentType = await POST(
    productIntentRequest({ headers: { "content-type": "text/plain" } }),
  );
  assert.equal(wrongContentType.status, 415);
  assert.equal(
    (await wrongContentType.json()).code,
    "UNSUPPORTED_MEDIA_TYPE",
  );
});

test("request bodies are streamed through a 1024-byte limit", async () => {
  const response = await POST(
    productIntentRequest({
      body: JSON.stringify({ intent: `Sony ${"x".repeat(1_100)}` }),
    }),
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "PAYLOAD_TOO_LARGE");
});

test("strict request shape rejects missing constraints payload fields and extras", async () => {
  const response = await POST(
    productIntentRequest({
      body: JSON.stringify({ intent, authorize: true }),
    }),
  );
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_PRODUCT_INTENT");
});

test("isolate-local throttling returns 429 after eight product interpretations", async () => {
  const ip = "198.51.100.44";
  for (let index = 0; index < 8; index += 1) {
    const response = await POST(productIntentRequest({ ip }));
    assert.equal(response.status, 200);
  }
  const limited = await POST(productIntentRequest({ ip }));
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, "RATE_LIMITED");
});
