import assert from "node:assert/strict";
import test from "node:test";

import {
  GET,
  dynamic,
  dynamicParams,
  generateStaticParams,
  revalidate,
} from "../app/api/agent/product-sample/[sampleId]/route.ts";

test("the public model surface is exactly five statically generated samples", () => {
  assert.equal(dynamic, "force-static");
  assert.equal(dynamicParams, false);
  assert.equal(revalidate, false);
  assert.deepEqual(generateStaticParams(), [
    { sampleId: "sony-xm6" },
    { sampleId: "steam-deck-oled" },
    { sampleId: "macbook-air-m4" },
    { sampleId: "dyson-airwrap" },
    { sampleId: "reference-monitor" },
  ]);
});

test("a generated sample records the model tool call while preserving zero visitor calls", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env.OPENAI_API_KEY = "sk-test-static-build-only";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({
      id: "resp_static_reference_monitor",
      model: "gpt-5.6-static-test",
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "extract_catalog_purchase_mandate",
          arguments: JSON.stringify({
            productId: "product-monitor-27-4k-usbc",
            productLabel: "27-inch 4K USB-C monitor",
            quantity: 1,
            maxUnitPriceCents: 43_000,
            patienceDays: 30,
            clarification: null,
          }),
        },
      ],
    });
  };

  try {
    const response = await GET(new Request("http://localhost/ignored"), {
      params: Promise.resolve({ sampleId: "reference-monitor" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, "openai_responses");
    assert.equal(body.modelResponseId, "resp_static_reference_monitor");
    assert.equal(body.status, "ready_for_review");
    assert.equal(body.match.productId, "product-monitor-27-4k-usbc");
    assert.equal(body.decision.financialAuthorization, "not_requested");
    assert.equal(body.decision.interpretationMovedCents, 0);
    assert.deepEqual(body.sampleProvenance, {
      kind: "release_built_agent_sample",
      sampleId: "reference-monitor",
      generatedAt: body.sampleProvenance.generatedAt,
      interactiveInputUsed: false,
      runtimeCallsPerVisitor: 0,
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.openai\.com\/v1\/responses/);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

