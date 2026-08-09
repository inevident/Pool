import { runProductIntentAgent } from "../../../../../lib/agent/product-intent.ts";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;

const PRODUCT_SAMPLES = {
  "sony-xm6":
    "I want 1 Sony XM6 under $400 and can wait 30 days.",
  "steam-deck-oled":
    "I want 1 Steam Deck OLED under $520 and can wait 30 days.",
  "macbook-air-m4":
    "I want 1 MacBook Air M4 under $950 and can wait 30 days.",
  "dyson-airwrap":
    "I want 1 Dyson Airwrap under $550 and can wait 30 days.",
  "reference-monitor":
    "I want 1 27-inch 4K USB-C monitor under $430 and can wait 30 days.",
} as const;

type ProductSampleId = keyof typeof PRODUCT_SAMPLES;

function isProductSampleId(value: string): value is ProductSampleId {
  return Object.hasOwn(PRODUCT_SAMPLES, value);
}

export function generateStaticParams() {
  return Object.keys(PRODUCT_SAMPLES).map((sampleId) => ({ sampleId }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sampleId: string }> },
) {
  const { sampleId } = await params;
  if (!isProductSampleId(sampleId)) {
    return Response.json(
      { status: "not_found", code: "UNKNOWN_PRODUCT_AGENT_SAMPLE" },
      { status: 404 },
    );
  }

  const generatedAt = new Date();
  const run = await runProductIntentAgent(PRODUCT_SAMPLES[sampleId], {
    // These five fixed paths are generated once during the release build. A
    // visitor never triggers a model request, so public traffic cannot turn
    // the server key into an unbounded inference endpoint. If the model is
    // unavailable during build, the same strict deterministic runtime wins.
    apiKey: process.env.OPENAI_API_KEY?.trim() || null,
    now: generatedAt,
  });

  return Response.json({
    ...run,
    sampleProvenance: {
      kind: "release_built_agent_sample",
      sampleId,
      generatedAt: generatedAt.toISOString(),
      interactiveInputUsed: false,
      runtimeCallsPerVisitor: 0,
    },
  });
}
