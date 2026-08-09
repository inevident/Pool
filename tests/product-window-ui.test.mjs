import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the product UI routes expired windows through the server resolution path", async () => {
  const source = await readFile(
    new URL("../app/_components/product-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Resolve missed window/);
  assert.match(source, /latestMarketPhase !== "open" && latestMarketPhase !== "closed"/);
  assert.match(source, /case "execution_window_missed"/);
  assert.match(source, /releaseReason: "execution_window_missed"/);
  assert.match(
    source,
    /releasableOutcome\.status === "execution_window_missed"[\s\S]*releasableOutcome\.serverTime/,
  );
  assert.match(source, /cannot contact Rain or Monad in any environment/i);
});

test("a modeled product quote never fabricates a browser-local settlement", async () => {
  const source = await readFile(
    new URL("../app/_components/product-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /case "modeled_quote"/);
  assert.match(source, /releaseReason: "rehearsal_complete"/);
  assert.match(source, /modeledAllocationCents/);
  assert.match(source, /modeledSavingsCents/);
  assert.match(source, /modeledQuote \?\?[\s\S]*belowMinimum/);
  assert.match(source, /did not[\s\S]*mutate the browser-local reservation/i);
  assert.doesNotMatch(source, /type: "pool\/settle"/);
});

test("both rehearsal-only routes use the safe missed-window resolver", async () => {
  const [commitRoute, settleRoute] = await Promise.all([
    readFile(
      new URL("../app/api/pool/commit/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/pool/settle/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of [commitRoute, settleRoute]) {
    assert.match(source, /resolveMissedExecutionWindow\(execution/);
    assert.doesNotMatch(source, /isLoopbackRequest/);
    assert.match(source, /status: 200/);
  }
});
