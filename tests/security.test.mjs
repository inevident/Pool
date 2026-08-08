import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import {
  accessCodeMatches,
  canExecuteLiveDemo,
  createDemoSession,
  DEMO_ACCESS_COOKIE,
  getDemoAccessConfiguration,
  hasValidDemoSession,
} from "../lib/security/demo-access.ts";

const originalToken = process.env.POOL_DEMO_ACCESS_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;
const originalRainLive = process.env.RAIN_LIVE_EXECUTION_ENABLED;
const originalMonadRequired = process.env.MONAD_LIVE_REQUIRED;

test.afterEach(() => {
  if (originalToken === undefined) delete process.env.POOL_DEMO_ACCESS_TOKEN;
  else process.env.POOL_DEMO_ACCESS_TOKEN = originalToken;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalRainLive === undefined) delete process.env.RAIN_LIVE_EXECUTION_ENABLED;
  else process.env.RAIN_LIVE_EXECUTION_ENABLED = originalRainLive;
  if (originalMonadRequired === undefined) delete process.env.MONAD_LIVE_REQUIRED;
  else process.env.MONAD_LIVE_REQUIRED = originalMonadRequired;
});

test("live execution is frictionless only on loopback when no access token exists", () => {
  process.env.NODE_ENV = "development";
  delete process.env.POOL_DEMO_ACCESS_TOKEN;
  assert.equal(
    canExecuteLiveDemo(new NextRequest("http://localhost:3000/api/rain/execute")),
    true,
  );
  assert.equal(
    canExecuteLiveDemo(new NextRequest("https://pool.example/api/rain/execute")),
    false,
  );
});

test("production never trusts a loopback URL as an access boundary", () => {
  process.env.NODE_ENV = "production";
  delete process.env.POOL_DEMO_ACCESS_TOKEN;
  assert.equal(
    canExecuteLiveDemo(new NextRequest("http://localhost:3000/api/rain/execute")),
    false,
  );
});

test("a no-secret production rehearsal does not advertise an unlock requirement", () => {
  process.env.NODE_ENV = "production";
  process.env.RAIN_LIVE_EXECUTION_ENABLED = "false";
  delete process.env.MONAD_LIVE_REQUIRED;
  delete process.env.POOL_DEMO_ACCESS_TOKEN;
  assert.equal(getDemoAccessConfiguration().required, false);

  process.env.RAIN_LIVE_EXECUTION_ENABLED = "true";
  assert.equal(getDemoAccessConfiguration().required, true);
});

test("an invalid access-token configuration disables the development bypass", () => {
  process.env.NODE_ENV = "development";
  process.env.POOL_DEMO_ACCESS_TOKEN = "too-short";
  assert.equal(
    canExecuteLiveDemo(new NextRequest("http://localhost:3000/api/rain/execute")),
    false,
  );
});

test("a constant-time code check mints a bounded HttpOnly-session value", () => {
  process.env.POOL_DEMO_ACCESS_TOKEN = "judge-access-token-for-tests";
  assert.equal(accessCodeMatches("judge-access-token-for-tests"), true);
  assert.equal(accessCodeMatches("wrong"), false);

  const now = Date.now();
  const session = createDemoSession(now);
  assert.ok(session);
  const request = new NextRequest("https://pool.example/api/rain/execute", {
    headers: { cookie: `${DEMO_ACCESS_COOKIE}=${session.value}` },
  });
  assert.equal(hasValidDemoSession(request, now + 1_000), true);
  assert.equal(canExecuteLiveDemo(request), true);
  assert.equal(hasValidDemoSession(request, now + 4 * 60 * 60 * 1_000 + 1), false);
});

test("public live execution fails closed when an access token exists but no session does", () => {
  process.env.POOL_DEMO_ACCESS_TOKEN = "judge-access-token-for-tests";
  assert.equal(
    canExecuteLiveDemo(new NextRequest("https://pool.example/api/rain/execute")),
    false,
  );
  assert.equal(
    canExecuteLiveDemo(new NextRequest("http://localhost:3000/api/rain/execute")),
    false,
  );
});
