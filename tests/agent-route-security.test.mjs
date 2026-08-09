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
  const require = createRequire(process.cwd() + "/agent-route-test-loader.mjs");
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
const { POST } = await import("../app/api/agent/run/route.ts");

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  POOL_DEMO_ACCESS_TOKEN: process.env.POOL_DEMO_ACCESS_TOKEN,
};
const originalFetch = globalThis.fetch;
const intent =
  "I can wait for a group buy. I need 2 27-inch 4K USB-C monitors under $420 each within 10 days.";
let requestSequence = 10;

function request(headers = {}) {
  return new NextRequest("https://pool.example/api/agent/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pool-agent-action": "interpret-buyer-intent",
      "x-real-ip": `203.0.113.${requestSequence++}`,
      origin: "https://pool.example",
      ...headers,
    },
    body: JSON.stringify({ intent }),
  });
}

test.beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.OPENAI_API_KEY = "sk-test-route-boundary";
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

test("public production intent parsing never spends the OpenAI key", async () => {
  let modelCalls = 0;
  globalThis.fetch = async () => {
    modelCalls += 1;
    throw new Error("model must stay locked");
  };
  const response = await POST(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "deterministic_fallback");
  assert.equal(modelCalls, 0);
});

test("a valid HttpOnly demo session unlocks one bounded model call", async () => {
  process.env.POOL_DEMO_ACCESS_TOKEN = "agent-route-access-secret-for-tests";
  const session = createDemoSession();
  assert.ok(session);
  let modelCalls = 0;
  globalThis.fetch = async () => {
    modelCalls += 1;
    return Response.json({
      id: "resp_route_security",
      model: "gpt-5.6",
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "submit_purchase_intent",
          arguments: JSON.stringify({
            productKind: "usb_c_monitor",
            productLabel: "27-inch 4K USB-C monitors",
            quantity: 2,
            maxUnitPriceCents: 42_000,
            deadlineDays: 10,
            requiredFeatures: ["4k", "usb-c"],
            timing: "flexible",
            clarification: null,
          }),
        },
      ],
    });
  };
  const response = await POST(
    request({ cookie: `${DEMO_ACCESS_COOKIE}=${session.value}` }),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "openai_responses");
  assert.equal(modelCalls, 1);
});
