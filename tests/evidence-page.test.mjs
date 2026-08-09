import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderEvidence() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("evidence-test", `${process.pid}-${Date.now()}`);
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

test("renders the finalized Rain plus Monad record in the current slot", async () => {
  const response = await renderEvidence();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const text = renderedText(html);

  assert.match(html, /<title>Evidence registry — POOL<\/title>/i);
  assert.match(html, /<main\b/i);
  assert.match(text, /Verify the claim\. Read the boundary\./i);
  assert.match(text, /Current verification slot Published/i);
  assert.match(
    text,
    /Rain sandbox \+ Monad Testnet finalized record/i,
  );
  assert.match(text, /3 settlement records · Monad Testnet rain settlement attested/i);
  assert.match(text, /Two bounded evidence rails\./i);
  assert.match(text, /Open finalized attestation/i);
  assert.match(text, /No real money/i);
});

test("publishes the archived Rain sandbox IDs and exact fixture reconciliation", async () => {
  const response = await renderEvidence();
  const html = await response.text();
  const text = renderedText(html);

  assert.match(text, /Rain sandbox settlement record/i);
  assert.match(text, /Rain sandbox only/i);
  assert.match(text, /Simulated fixture ledger/i);
  assert.match(text, /Reserved \$5,748 = Captured \$4,668 \+ Released \$1,080/i);
  assert.match(
    html,
    /aria-label="\$5,748 reserved equals \$4,668 captured plus \$1,080 released"/i,
  );

  for (const transactionId of [
    "ddcdfd2c-9846-4b46-b0d4-60b86510a8c3",
    "e98eea91-ca5e-43c0-896c-dd9e20da5c35",
    "e2a24bda-512a-4460-8665-cb618df345d3",
  ]) {
    assert.match(text, new RegExp(transactionId));
  }

  assert.match(text, /Three exact settlement IDs\./i);
  assert.match(text, /9b59b3b8-447b-4f85-bd97-a5090088d6b6/);
  assert.match(text, /scoped_card_mcc_not_allowed/);
  assert.match(text, /merchant category code 7995/i);
  assert.match(text, /Local proof only — not Testnet/i);
  assert.match(html, /href="\/evidence\/rain-sandbox-2026-08-09\.json"/);
  assert.match(html, /href="\/evidence\/rain-sandbox-2026-08-09\.png"/);
});

test("keeps the archived evidence source sanitized and its overclaims absent", async () => {
  const evidence = JSON.parse(
    await readFile(
      new URL("../public/evidence/rain-sandbox-2026-08-09.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(evidence.environment, "sandbox");
  assert.equal(evidence.realMoneyMoved, false);
  assert.equal(evidence.fundingBoundary.simulated, true);
  assert.equal(evidence.monad.mode, "local-proof");
  assert.equal(evidence.monad.testnetTransactionClaimed, false);
  assert.equal(evidence.payments.length, 3);
  assert.ok(evidence.payments.every((payment) => payment.status === "settled"));
  assert.equal(
    evidence.fundingBoundary.reservedCents,
    evidence.fundingBoundary.capturedCents +
      evidence.fundingBoundary.releasedCents,
  );

  const source = await readFile(
    new URL("../app/evidence/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:real money was moved|moved real money|production payment processing verified)/i,
  );
  assert.match(source, /Independent audit, merchant demand, or product-market fit/);
});

test("publishes a sanitized finalized Monad record with the exact Rain receipt set", async () => {
  const evidence = JSON.parse(
    await readFile(
      new URL(
        "../public/evidence/rain-monad-testnet-2026-08-09.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.equal(evidence.realMoneyMoved, false);
  assert.equal(evidence.fundingBoundary.simulated, true);
  assert.equal(evidence.rain.sameDayIdempotentReplay, true);
  assert.equal(evidence.rain.payments.length, 3);
  assert.equal(evidence.monad.chainId, 10143);
  assert.equal(evidence.monad.testnetTransactionClaimed, true);
  assert.equal(evidence.monad.offerRegistrations.length, 6);
  assert.equal(evidence.monad.settlementAttestation.rainTransactionCount, 3);
  assert.match(
    evidence.monad.registryExplorerUrl,
    /^https:\/\/testnet\.monadscan\.com\/address\//,
  );
  for (const explorerUrl of [
    evidence.monad.deployment.explorerUrl,
    evidence.monad.commitment.transaction.explorerUrl,
    ...evidence.monad.offerRegistrations.map((offer) => offer.explorerUrl),
    evidence.monad.settlementAttestation.transaction.explorerUrl,
  ]) {
    assert.match(explorerUrl, /^https:\/\/testnet\.monadscan\.com\/tx\//);
  }
  assert.equal(
    evidence.fundingBoundary.reservedCents,
    evidence.fundingBoundary.capturedCents +
      evidence.fundingBoundary.releasedCents,
  );

  const settlementIds = evidence.rain.payments
    .map((payment) => payment.transactionId)
    .sort();
  assert.deepEqual(settlementIds, [
    "ddcdfd2c-9846-4b46-b0d4-60b86510a8c3",
    "e2a24bda-512a-4460-8665-cb618df345d3",
    "e98eea91-ca5e-43c0-896c-dd9e20da5c35",
  ]);
  assert.equal(
    evidence.rain.guardrail.reason,
    "scoped_card_mcc_not_allowed",
  );

  const serialized = JSON.stringify(evidence);
  for (const forbidden of [
    "cardId",
    "cardLast4",
    "RAIN_API_KEY",
    "MONAD_PRIVATE_KEY",
    "authorizationHeaders",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
