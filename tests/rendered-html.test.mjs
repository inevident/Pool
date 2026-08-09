import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
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
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
}

test("server-renders the functional POOL buyer product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>POOL — Turn patience into bargaining power<\/title>/i);
  assert.match(html, /What are you willing to/);
  assert.match(html, /Product sandbox/i);
  assert.match(html, /Available to commit/);
  assert.match(html, /Active commitments/);
  assert.match(html, /Popular group buys/);
  assert.match(html, /Sony/);
  assert.match(html, /Reserve &amp; join/);
  assert.match(html, /Add test funds/);
  assert.doesNotMatch(html, /Judge console/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps the cinematic market and payment proof isolated at /demo", async () => {
  const response = await render("/demo");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Live market walkthrough — POOL<\/title>/i);
  assert.match(html, /Replay the fixed market/);
  assert.match(html, /FIXED TECHNICAL EVIDENCE FIXTURE/);
  assert.match(html, /Rain bounded captures/);
  assert.match(html, /Monad commitment \/ attestation/);
  assert.match(html, /BUYER AGENTS/);
  assert.match(html, /SELLER COMPETITION/);
  assert.match(html, /POOL BALANCE RESERVATIONS/);
  assert.match(html, /Rain does not hold the POOL balance or reservation/);
  assert.match(html, /EXECUTION RAIL · AFTER POOL CLEARING/);
  assert.match(html, /SANDBOX · NO REAL MONEY/);
  assert.match(html, /Product workspace/);
});

test("server-renders every repeat-use product surface", async () => {
  const surfaces = [
    ["/explore", /Discover funded group buys/],
    ["/wallet", /Know what is free and what is committed/],
    ["/orders", /Your purchases, from commitment to delivery/],
    ["/beta", /Coming soon/],
    [
      "/pools/pool-sony-xm6-august",
      /Full MSRP coverage/,
    ],
  ];

  for (const [path, expected] of surfaces) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} should render successfully`);
    const html = await response.text();
    assert.match(html, expected);
    assert.doesNotMatch(html, /\d+%\s+to\s+(?:merchant\s+)?bidding/i);
    assert.doesNotMatch(html, /\d+\s*\/\s*\d+\s+(?:buyers|members|units)/i);
  }
});

test("does not present the shared Rain sandbox ceiling as buyer funds", async () => {
  const source = await readFile(
    new URL("../app/_components/product-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /not buyer funds/i);
  assert.match(source, /not buyer custody, backing, or an available balance/i);
});

test("unknown pool identifiers use the real 404 boundary", async () => {
  // Regression: ISSUE-004 — missing pool IDs rendered an empty state with 200.
  // Found by /qa on 2026-08-09.
  for (const poolId of [
    "not-a-real-pool",
    "constructor",
    "__proto__",
    "toString",
  ]) {
    const response = await render(`/pools/${poolId}`);
    assert.equal(response.status, 404, `${poolId} should return a real 404`);
    const html = await response.text();
    assert.match(html, /404 · Pool not found/);
    assert.match(html, /This buying pool is not in the current workspace/);
    assert.match(
      html,
      /<meta[^>]*(?:name="robots"[^>]*content="noindex"|content="noindex"[^>]*name="robots")[^>]*>/,
    );
  }
});

test("renders the mobile preview from current fixed-window pool fixtures", async () => {
  // Regression: ISSUE-003 — empty workspaces showed a fabricated reserved
  // commitment and the phone preview exposed dead button controls.
  // Found by /qa on 2026-08-09.
  const response = await render("/beta");
  assert.equal(response.status, 200);
  const html = await response.text();
  const text = renderedText(html);
  assert.match(text, /Mobile Preview/);
  assert.doesNotMatch(text, /Mobile Beta/);
  assert.doesNotMatch(text, /soonto/);
  assert.match(text, /34 funded units/);
  assert.match(text, /\$379/);
  assert.match(text, /10-unit eligibility floor/);
  assert.match(text, /14-day window elapsed/);
  assert.match(text, /no enrollment cap/);
  assert.match(text, /EXAMPLE COMMITMENT/);
  assert.match(text, /full-MSRP coverage/);
  assert.match(text, /no funds are locked in this preview/);
  assert.doesNotMatch(text, /YOUR COMMITMENT\$449\.99 reserved/);
  assert.match(html, /href="\/pools\/pool-sony-xm6-august"/);
  assert.match(html, /href="\/wallet"/);
  assert.doesNotMatch(html, /18 buyers|buyers joined|72% to merchant bidding/i);
});

test("does not reintroduce target-headcount progress semantics", async () => {
  const source = await readFile(
    new URL("../app/_components/product-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /targetMemberCount|of unit target|target headcount|buyers needed/i,
  );
  assert.doesNotMatch(source, /18 buyers|buyers joined|72% to merchant bidding/i);
});

test("applies a secure browser header baseline", async () => {
  const response = await render();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' 'nonce-[a-f0-9]+' 'strict-dynamic'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  const html = await response.text();
  assert.doesNotMatch(html, /<script(?![^>]*\bnonce=)/i);
});

test("removes every disposable starter surface", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../.env.example", import.meta.url));
});
