import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderDemo() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("demo-presentation", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/demo", {
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
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

test("the demo source derives the first-frame proof from canonical fixtures", async () => {
  const source = await readFile(
    new URL("../app/demo/demo-experience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /import \{ HERO_FUNDING \} from "@\/lib\/funding"/);
  assert.match(source, /FIXTURE_TOTAL_UNITS = HERO_FUNDING\.summary\.buyers\.reduce/);
  assert.match(source, /FIXTURE_CAPTURE_COUNT = HERO_FUNDING\.summary\.buyers\.length/);
  assert.match(source, /FIXTURE_SAVINGS = HERO_FUNDING\.summary\.totalReleasedCents \/ 100/);
  assert.match(source, /Rain bounded captures/);
  assert.match(source, /Monad commitment \/ attestation/);
  assert.match(source, /Published finalized record/);
  assert.match(source, /Runtime not connected · open evidence/);
  assert.match(source, /MCC \{BLOCKED_MCC\} BLOCKED/);
  assert.match(source, /className="judge-console-disclosure"/);
  assert.match(source, /className="event-panel audit-details"/);
  assert.match(source, /reservation-panel audit-details/);
  assert.doesNotMatch(
    source,
    /LIVE MARKET|COALITION LIVE|BEST LIVE OFFER|LIVE RAIL PROTECTED|Live sandbox run/,
  );
});

test("the rendered demo leads with an honest, complete proof summary", async () => {
  const response = await renderDemo();
  assert.equal(response.status, 200);

  const html = await response.text();
  const text = renderedText(html);
  assert.match(text, /FIXED TECHNICAL EVIDENCE FIXTURE/);
  assert.match(text, /12 prefunded units\./);
  assert.match(text, /\$1,080 stays with buyers\./);
  assert.match(text, /Rain bounded captures 3 captures/);
  assert.match(text, /Monad commitment \/ attestation/);
  assert.match(text, /Published finalized record/);
  assert.match(text, /Runtime not connected · open evidence/);
  assert.match(text, /MCC 7995 BLOCKED/);
  assert.match(text, /not the repeat-use consumer app/);
  assert.match(text, /Open the technical inspector/);
  assert.match(text, /Published record/);
  assert.doesNotMatch(text, /LIVE MARKET|COALITION LIVE|BEST LIVE OFFER/);
});
