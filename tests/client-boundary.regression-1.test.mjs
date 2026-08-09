import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: ISSUE-001 — the client product barrel re-exported server hashing
// code, so hydration crashed when Vite externalized node:crypto.
// Found by /qa on 2026-08-09
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-09.md
test("the browser-safe product entry point cannot expose server execution modules", async () => {
  const [browserEntry, serverEntry, workspace] = await Promise.all([
    readFile(new URL("../lib/product/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/product/server.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/_components/product-workspace.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(workspace, /from "@\/lib\/product"/);
  assert.match(browserEntry, /export \* from "\.\/schedule\.ts"/);
  assert.doesNotMatch(browserEntry, /execution\.ts|window-resolution\.ts/);
  assert.match(serverEntry, /export \* from "\.\/execution\.ts"/);
  assert.match(serverEntry, /export \* from "\.\/window-resolution\.ts"/);
});
