import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSameOriginJsonAction,
  RequestBoundaryError,
} from "../lib/agent/http.ts";

const originalNodeEnv = process.env.NODE_ENV;
const action = "interpret-buyer-intent";

test.afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function actionRequest(url, origin) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pool-agent-action": action,
      origin,
    },
    body: JSON.stringify({ intent: "a sufficiently long purchase intent" }),
  });
}

function assertOriginRejected(request) {
  assert.throws(
    () => assertSameOriginJsonAction(request, action),
    (error) =>
      error instanceof RequestBoundaryError &&
      error.status === 403 &&
      error.code === "ORIGIN_REJECTED",
  );
}

test("development accepts localhost, IPv4 loopback, and IPv6 loopback aliases", () => {
  process.env.NODE_ENV = "development";

  assert.doesNotThrow(() =>
    assertSameOriginJsonAction(
      actionRequest("http://localhost:3000/api/agent/run", "http://127.0.0.1:3000"),
      action,
    ),
  );
  assert.doesNotThrow(() =>
    assertSameOriginJsonAction(
      actionRequest("http://127.0.0.1:3000/api/agent/run", "http://[::1]:3000"),
      action,
    ),
  );
});

test("development loopback aliases still require the same protocol and port", () => {
  process.env.NODE_ENV = "development";

  assertOriginRejected(
    actionRequest("http://localhost:3000/api/agent/run", "http://127.0.0.1:3001"),
  );
  assertOriginRejected(
    actionRequest("http://localhost:3000/api/agent/run", "https://127.0.0.1:3000"),
  );
});

test("development never grants loopback equivalence to a non-loopback host", () => {
  process.env.NODE_ENV = "development";

  assertOriginRejected(
    actionRequest("http://localhost:3000/api/agent/run", "http://pool.local:3000"),
  );
  assertOriginRejected(
    actionRequest("http://pool.local:3000/api/agent/run", "http://127.0.0.1:3000"),
  );
});

test("production retains strict origin equality, including for loopback URLs", () => {
  process.env.NODE_ENV = "production";

  assert.doesNotThrow(() =>
    assertSameOriginJsonAction(
      actionRequest("https://pool.example/api/agent/run", "https://pool.example"),
      action,
    ),
  );
  assertOriginRejected(
    actionRequest("http://localhost:3000/api/agent/run", "http://127.0.0.1:3000"),
  );
  assertOriginRejected(
    actionRequest("https://pool.example/api/agent/run", "https://evil.example"),
  );
});

test("same-origin actions can use a route-specific action header", () => {
  process.env.NODE_ENV = "development";

  const request = new Request("http://localhost:3000/api/rain/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pool-demo-action": "execute-sandbox",
      origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify({ scenarioVersion: "test" }),
  });

  assert.doesNotThrow(() =>
    assertSameOriginJsonAction(
      request,
      "execute-sandbox",
      "x-pool-demo-action",
    ),
  );
});
