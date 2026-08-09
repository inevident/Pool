import assert from "node:assert/strict";
import test from "node:test";

import {
  compensateUnsettledRainAuthorizations,
  demoCompensationIdempotencyKey,
  rainCompensationRequiresReconciliation,
} from "../lib/rain/compensation.ts";

test("compensation reverses every authorized-but-unsettled buyer only", async () => {
  const calls = [];
  const attempts = await compensateUnsettledRainAuthorizations({
    runKey: "pool-monitor-pool-v1-20260809",
    authorized: [
      { buyerId: "buyer-a", transactionId: "tx-a" },
      { buyerId: "buyer-b", transactionId: "tx-b" },
      { buyerId: "buyer-c", transactionId: "tx-c" },
    ],
    settled: [{ buyerId: "buyer-a", transactionId: "settled-a" }],
    reverse: async (request) => {
      calls.push(request);
      if (request.transactionId === "tx-c") throw new Error("provider down");
    },
  });

  assert.deepEqual(
    calls.map((call) => call.transactionId),
    ["tx-b", "tx-c"],
  );
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].reversed, true);
  assert.equal(attempts[1].reversed, false);
  assert.equal(
    rainCompensationRequiresReconciliation({
      settledCount: 1,
      attempts,
    }),
    true,
  );
  for (const attempt of attempts) assert.ok(attempt.idempotencyKey.length <= 64);
});

test("an unexpectedly authorized guardrail probe is compensated and failure stays reconciling", async () => {
  const probeKey = demoCompensationIdempotencyKey(
    "pool-monitor-pool-v1-20260809",
    "guardrail-probe",
  );
  assert.ok(probeKey.length <= 64);

  const attempts = await compensateUnsettledRainAuthorizations({
    runKey: "pool-monitor-pool-v1-20260809",
    authorized: [
      { buyerId: "guardrail-probe", transactionId: "off-policy-tx" },
    ],
    settled: [],
    reverse: async () => {
      throw new Error("reversal failed");
    },
  });
  assert.equal(attempts[0].reversed, false);
  assert.equal(
    rainCompensationRequiresReconciliation({
      settledCount: 0,
      attempts,
    }),
    true,
  );
});
