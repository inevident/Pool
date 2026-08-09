import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config.ts";

test("the Next/Vercel target carries the browser security baseline", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers();
  const root = rules.find((rule) => rule.source === "/(.*)");
  assert.ok(root);
  const headers = new Map(root.headers.map((header) => [header.key, header.value]));

  for (const key of [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.ok(headers.has(key), `${key} must be set on the Next deployment target`);
  }
  assert.match(headers.get("Content-Security-Policy"), /object-src 'none'/);
  assert.match(headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
});
