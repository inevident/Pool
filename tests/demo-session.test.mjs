import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server.js";

import { POST } from "../app/api/demo/session/route.ts";

const originalToken = process.env.POOL_DEMO_ACCESS_TOKEN;

test.before(() => {
  process.env.POOL_DEMO_ACCESS_TOKEN = "demo-session-route-secret-for-tests";
});

test.after(() => {
  if (originalToken === undefined) delete process.env.POOL_DEMO_ACCESS_TOKEN;
  else process.env.POOL_DEMO_ACCESS_TOKEN = originalToken;
});

function request(body, headers = {}) {
  return new NextRequest("https://pool.example/api/demo/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://pool.example",
      "x-real-ip": "203.0.113.42",
      ...headers,
    },
    body,
  });
}

test("demo session rejects an oversized body even without Content-Length", async () => {
  const response = await POST(
    request(JSON.stringify({ accessCode: "x".repeat(2_000) })),
  );

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    status: "rejected",
    message: "Invalid session request.",
  });
});

test("demo session requires JSON before parsing credentials", async () => {
  const response = await POST(
    request("accessCode=anything", { "content-type": "text/plain" }),
  );

  assert.equal(response.status, 415);
});
