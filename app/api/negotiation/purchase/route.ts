import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  assertRateLimit,
  assertSameOriginJsonAction,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";
import {
  DemandCurveError,
  MACBOOK_DEMAND_SCENARIO,
  negotiateDemandCurve,
  type DemandCurveInput,
} from "../../../../lib/negotiation/index";
import { ELECTRONICS_MCC } from "../../../../lib/market/consumer";
import { canExecuteLiveDemo } from "../../../../lib/security/demo-access";
import { executeAgentPurchase } from "../../../../lib/rain/agent-purchase";
import { isRainConfigured, RainApiError } from "../../../../lib/rain/client";

export const dynamic = "force-dynamic";

/** A single autonomous authorization stays well under the sandbox rail cap. */
const MAX_AGENT_PURCHASE_CENTS = 500_000;

const pledgeSchema = z
  .object({
    discountBps: z.number().int().min(0).max(9_000),
    buyerCount: z.number().int().min(1).max(1_000_000),
    unitsPerBuyer: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const purchaseRequestSchema = z
  .object({
    productLabel: z.string().trim().min(1).max(80),
    msrpUnitCents: z.number().int().min(1).max(100_000_000),
    pledges: z.array(pledgeSchema).min(1).max(8),
  })
  .strict();

function utcRunWindow(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const expiresAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 0, 0, 0),
  ).toISOString();
  return { day, expiresAt };
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginJsonAction(request, "agent-purchase");
    assertRateLimit(request, "agent-purchase", { maxRequests: 6 });

    const raw = await readLimitedJson(request, 4_096);
    const input: DemandCurveInput =
      raw && typeof raw === "object" && Object.keys(raw as object).length > 0
        ? purchaseRequestSchema.parse(raw)
        : MACBOOK_DEMAND_SCENARIO;

    // The agent re-derives the clearing itself so the price it acts on is the
    // market's, never a number the browser proposed.
    const clearing = negotiateDemandCurve(input);
    if (clearing.code !== "cleared" || !clearing.winner || clearing.clearingUnitPriceCents === null) {
      return NextResponse.json(
        {
          status: "no_deal",
          message: "The market did not clear, so there is nothing for the agent to buy.",
          clearing: summarize(clearing),
        },
        { status: 409, headers: noStoreHeaders },
      );
    }

    // The agent buys one representative unit at the cleared price from its chosen
    // merchant. A production pool repeats this authorization per committed buyer.
    const unitAmountCents = Math.min(clearing.clearingUnitPriceCents, MAX_AGENT_PURCHASE_CENTS);
    const summary = {
      ...summarize(clearing),
      chosenMerchant: clearing.winner.merchantName,
      chosenMerchantId: clearing.winner.merchantId,
      merchantCategoryCode: ELECTRONICS_MCC || "5732",
      representativeUnitCents: unitAmountCents,
    };

    const liveExecutionAvailable =
      process.env.RAIN_LIVE_EXECUTION_ENABLED === "true" &&
      isRainConfigured() &&
      canExecuteLiveDemo(request);

    if (!liveExecutionAvailable) {
      // No pretending. Describe exactly what the agent would do on Rain.
      return NextResponse.json(
        {
          status: "rehearsal",
          mode: "REHEARSAL · SIMULATED",
          message:
            "The agent chose its merchant and prepared a scoped Rain card, but live sandbox execution is not unlocked in this environment. No card was issued and no money moved.",
          clearing: summary,
          plan: {
            action: "issue_scoped_card_then_authorize_and_settle",
            merchantName: summary.chosenMerchant,
            merchantCategoryCode: summary.merchantCategoryCode,
            amountInCents: unitAmountCents,
            allowedMccs: [summary.merchantCategoryCode],
          },
        },
        { headers: noStoreHeaders },
      );
    }

    const { day, expiresAt } = utcRunWindow();
    const runKey = `pool-agent-buy-${day}-${clearing.winner.merchantId}-${unitAmountCents}`;
    const receipt = await executeAgentPurchase({
      merchantName: clearing.winner.merchantName,
      merchantCategoryCode: summary.merchantCategoryCode,
      amountInCents: unitAmountCents,
      runKey,
      expiresAt,
    });

    return NextResponse.json(
      {
        status: "purchased",
        mode: "RAIN SANDBOX · VERIFIED",
        message: `The agent autonomously purchased one unit from ${receipt.merchantName} at the cleared price via Rain.`,
        clearing: summary,
        receipt,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { status: "rejected", code: error.code, message: error.message },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { status: "rejected", code: "INVALID_CURVE", message: "Provide a product label, MSRP in cents, and 1–8 demand pledges." },
        { status: 400, headers: noStoreHeaders },
      );
    }
    if (error instanceof DemandCurveError) {
      return NextResponse.json(
        { status: "rejected", code: error.code, message: error.message },
        { status: 400, headers: noStoreHeaders },
      );
    }
    if (error instanceof RainApiError) {
      return NextResponse.json(
        {
          status: "purchase_failed",
          code: error.code ?? "rain_error",
          message: "Rain sandbox could not complete the agent's purchase. No simulated receipt was substituted.",
        },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      { status: "unavailable", code: "PURCHASE_UNAVAILABLE", message: "The agent purchase could not be processed." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}

function summarize(clearing: ReturnType<typeof negotiateDemandCurve>) {
  return {
    productLabel: clearing.productLabel,
    clearingUnitPriceCents: clearing.clearingUnitPriceCents,
    clearingDiscountBps: clearing.clearingDiscountBps,
    activatedBuyers: clearing.activatedBuyers,
    activatedUnits: clearing.activatedUnits,
    totalSavingsCents: clearing.totalSavingsCents,
  };
}
