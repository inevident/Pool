import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderEvidence() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("verifier-ui-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/evidence", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function renderedText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

test("renders a truthful one-click verifier before client hydration", async () => {
  const response = await renderEvidence();
  assert.equal(response.status, 200);

  const text = renderedText(await response.text());
  assert.match(text, /Check the chain yourself/i);
  assert.match(text, /Run live verification/i);
  assert.match(text, /Ready for a public, read-only check/i);
  assert.match(text, /Public Monad Testnet RPC/i);
  assert.match(text, /Read state \+ recompute digest/i);
  assert.match(text, /Read only · zero writes/i);
  assert.match(
    text,
    /does not query Rain, move money, authorize a transaction, verify buyer balances, or prove real merchants participated/i,
  );
});

test("implements verified, degraded, mismatch, and request-failure states", async () => {
  const source = await readFile(
    new URL("../app/evidence/live-verifier.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /fetch\("\/api\/evidence\/verify"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /"verified" \| "mismatch" \| "degraded"/);
  assert.match(source, /"pass" \| "fail" \| "unavailable"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-busy=\{isVerifying\}/);
  assert.match(source, /Rain was\s+not contacted/i);
  assert.match(source, /no Monad write or financial authorization occurred/i);
});
