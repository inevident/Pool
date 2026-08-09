import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

import { NextRequest } from "next/server.js";

const typeScriptLoader = `
  import { readFile } from "node:fs/promises";
  import { createRequire } from "node:module";
  const require = createRequire(process.cwd() + "/merchant-pilot-test-loader.mjs");
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
register(`data:text/javascript,${encodeURIComponent(typeScriptLoader)}`, import.meta.url);

const { GET, POST } = await import("../app/api/merchant/pilot/route.ts");

let requestSequence = 70;
function pilotRequest(body, headers = {}) {
  return new NextRequest("https://pool.example/api/merchant/pilot", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pool-agent-action": "evaluate-seller-pilot",
      "x-real-ip": `203.0.113.${requestSequence++}`,
      origin: "https://pool.example",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("GET publishes the same sanitized, explicitly non-traction RFP artifact", async () => {
  const response = await GET();
  const contract = await response.json();
  const download = JSON.parse(
    await readFile(
      new URL("../public/merchant/pool-seller-pilot-rfp-v1.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(contract, download);
  assert.equal(contract.artifact.kind, "product_integration_artifact");
  assert.equal(contract.artifact.liveRetailerConnected, false);
  assert.equal(contract.artifact.tractionClaimed, false);
  assert.equal(contract.artifact.binding, false);
  assert.equal(contract.artifact.externalWrites, false);
  assert.equal(contract.rfp.committedQuantity, 12);
  assert.equal(contract.rfp.demandEvidence.kind, "simulated_full_msrp_reservations");
  assert.equal(contract.rfp.demandEvidence.custodyClaimed, false);

  const serialized = JSON.stringify(contract);
  for (const forbidden of [
    "Harbor Labs",
    "Patchwork AI",
    "Kernel Works",
    "maxUnitPriceCents",
    "targetUnitPriceCents",
    "rankIfAdmitted",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must remain private`);
  }
});

test("a fitting pilot bid returns a fingerprint and a categorical zero-write boundary", async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error("the pure merchant pilot must never contact an external service");
  };
  try {
    const response = await POST(
      pilotRequest({
        unitPriceCents: 38_900,
        deliveryDays: 7,
        warrantyMonths: 36,
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(externalCalls, 0);
    assert.equal(body.status, "eligible");
    assert.equal(body.serverPinned.rfpVersion, 2);
    assert.equal(body.serverPinned.committedQuantity, 12);
    assert.equal(body.offer.grossOrderValueCents, 466_800);
    assert.match(body.offer.termsFingerprint, /^offer-v1-[a-f0-9]{64}$/);
    assert.equal(body.financialAuthorization, "not_requested");
    assert.equal(body.externalWrites, false);
    assert.equal(body.aggregateOrderPlaced, false);
    assert.equal(body.providerBoundary.rain, "not_contacted");
    assert.equal(body.providerBoundary.monad, "not_contacted");

    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "Harbor Labs",
      "Patchwork AI",
      "Kernel Works",
      "merchant-signal",
      "Signal Supply Co.",
      "Keystone Office",
      "Northstar Systems",
      "maxUnitPriceCents",
      "targetUnitPriceCents",
      "rankIfAdmitted",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `${forbidden} must not reach the seller`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blinded policy rejection reveals no private threshold and performs no write", async () => {
  const response = await POST(
    pilotRequest({
      unitPriceCents: 52_900,
      deliveryDays: 7,
      warrantyMonths: 36,
    }),
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.status, "rejected");
  assert.equal(body.externalWrites, false);
  assert.equal(body.financialAuthorization, "not_requested");
  assert.match(body.message, /no private threshold was disclosed/i);
  assert.equal(serialized.includes("UNIT_PRICE_LIMIT"), false);
  assert.equal(serialized.includes("42000"), false);
  assert.equal(serialized.includes("40500"), false);
});

test("the browser cannot choose merchant identity, quantity, or RFP version", async () => {
  const response = await POST(
    pilotRequest({
      merchantId: "merchant-signal",
      committedQuantity: 1,
      rfpVersion: 999,
      unitPriceCents: 38_900,
      deliveryDays: 7,
      warrantyMonths: 36,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_PILOT_BID");
  assert.equal(body.externalWrites, false);
  assert.match(body.message, /cannot be supplied by the browser/i);
});

test("the route has a structural no-provider boundary and the page states its limits", async () => {
  const routeSource = await readFile(
    new URL("../app/api/merchant/pilot/route.ts", import.meta.url),
    "utf8",
  );
  const pageSource = await readFile(
    new URL("../app/merchant/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(routeSource, /merchant-runtime|rain\/(?:client|execute)|monad\/|demo-access|canExecuteLiveDemo/);
  assert.doesNotMatch(routeSource, /fetch\s*\(/);
  assert.match(routeSource, /evaluateMerchantBid/);
  assert.match(pageSource, /No live retailer is connected\./);
  assert.match(pageSource, /product integration artifact—not merchant traction/i);
  assert.match(pageSource, /non-binding and never creates an order/i);
});
