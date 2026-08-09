import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the observational Monad status route reports degraded proof in-band", async () => {
  const source = await readFile(
    new URL("../app/api/monad/status/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /readiness:\s*"degraded"/);
  assert.match(source, /state:\s*"proof-unavailable"/);
  assert.match(source, /\{ status: 200, headers \}/);
  assert.doesNotMatch(source, /\{ status: 503, headers \}/);
});
