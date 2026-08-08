import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BLOCKED_MCC,
  demoSettlementBoundaryIsValid,
  DEMO_MERCHANT,
  DEMO_SCENARIO_VERSION,
  ELECTRONICS_MCC,
  getDemoFundingState,
  settlementAllocations,
  settlementTotalInCents,
} from "../../../../lib/demo/settlement";
import {
  authorizeCard,
  fundDemoRailCollateral,
  issueScopedCard,
  RainApiError,
  reverseAuthorization,
  settleAuthorization,
} from "../../../../lib/rain/client";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  scenarioVersion: z.literal(DEMO_SCENARIO_VERSION),
  confirmation: z.literal("execute-rain-sandbox"),
});

let lastExecutionAt = 0;

function utcRunWindow(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const expiration = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 2,
      0,
      0,
      0,
    ),
  ).toISOString();
  return { runKey: `pool-${DEMO_SCENARIO_VERSION}-${day}`, expiration };
}

function isTrustedDemoRequest(request: NextRequest) {
  if (request.headers.get("x-pool-demo-action") !== "execute-sandbox") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return (
      requestUrl.protocol === originUrl.protocol &&
      requestUrl.host === originUrl.host
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (process.env.RAIN_LIVE_EXECUTION_ENABLED !== "true") {
    return NextResponse.json(
      {
        status: "disabled",
        message: "Live Rain execution is disabled in this environment.",
      },
      { status: 403 },
    );
  }

  if (!isTrustedDemoRequest(request)) {
    return NextResponse.json(
      { status: "rejected", message: "Invalid demo execution request." },
      { status: 403 },
    );
  }

  const now = Date.now();
  if (now - lastExecutionAt < 8_000) {
    return NextResponse.json(
      {
        status: "rate_limited",
        message: "A settlement run is already in progress.",
      },
      { status: 429 },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { status: "rejected", message: "Invalid demo execution payload." },
      { status: 400 },
    );
  }

  if (input.scenarioVersion !== DEMO_SCENARIO_VERSION) {
    return NextResponse.json(
      { status: "stale", message: "The negotiated offer is no longer current." },
      { status: 409 },
    );
  }

  if (!demoSettlementBoundaryIsValid()) {
    return NextResponse.json(
      {
        status: "rejected",
        message: "The settlement no longer matches the accepted market agreement.",
      },
      { status: 409 },
    );
  }

  lastExecutionAt = now;
  const { runKey, expiration } = utcRunWindow();
  const cards: Array<{
    buyerId: string;
    buyerName: string;
    amountInCents: number;
    cardId: string;
    last4: string;
    cached: boolean;
  }> = [];
  const authorized: Array<{
    buyerId: string;
    transactionId: string;
    amountInCents: number;
    cached: boolean;
  }> = [];
  const settled: Array<{
    buyerId: string;
    transactionId: string;
    amountInCents: number;
    status: string;
    cached: boolean;
  }> = [];

  try {
    await fundDemoRailCollateral(500_000, `${runKey}-fund`);

    for (const allocation of settlementAllocations) {
      const issued = await issueScopedCard({
        amountInUSDCents: allocation.amountInCents,
        allowedMccs: [ELECTRONICS_MCC],
        expiresAt: expiration,
        idempotencyKey: `${runKey}-${allocation.buyerId}-card`,
      });
      cards.push({
        buyerId: allocation.buyerId,
        buyerName: allocation.buyerName,
        amountInCents: allocation.amountInCents,
        cardId: issued.card.id,
        last4: issued.card.last4,
        cached: issued.cached,
      });
    }

    const probe = await authorizeCard({
      cardId: cards[0].cardId,
      amountInCents: cards[0].amountInCents,
      merchantName: DEMO_MERCHANT,
      merchantCategoryCode: BLOCKED_MCC,
      idempotencyKey: `${runKey}-blocked-mcc-probe`,
    });

    if (probe.transaction.status !== "declined") {
      await reverseAuthorization({
        transactionId: probe.transaction.transactionId,
        idempotencyKey: `${runKey}-unsafe-probe-reversal`,
      });
      throw new RainApiError(
        "Rain did not apply the expected MCC restriction",
        502,
        "guardrail_not_applied",
      );
    }

    for (const card of cards) {
      const authorization = await authorizeCard({
        cardId: card.cardId,
        amountInCents: card.amountInCents,
        merchantName: DEMO_MERCHANT,
        merchantCategoryCode: ELECTRONICS_MCC,
        idempotencyKey: `${runKey}-${card.buyerId}-authorize`,
      });

      if (authorization.transaction.status !== "authorized") {
        for (const open of authorized) {
          await reverseAuthorization({
            transactionId: open.transactionId,
            idempotencyKey: `${runKey}-${open.buyerId}-compensate`,
          });
        }
        throw new RainApiError(
          "A buyer authorization was declined",
          409,
          authorization.transaction.declinedReason,
        );
      }

      authorized.push({
        buyerId: card.buyerId,
        transactionId: authorization.transaction.transactionId,
        amountInCents: card.amountInCents,
        cached: authorization.cached,
      });
    }

    for (const authorization of authorized) {
      const settlement = await settleAuthorization({
        transactionId: authorization.transactionId,
        amountInCents: authorization.amountInCents,
        idempotencyKey: `${runKey}-${authorization.buyerId}-settle`,
      });
      if (settlement.transaction.status !== "settled") {
        throw new RainApiError(
          "Rain did not confirm settlement of an authorized allocation",
          502,
          "settlement_not_confirmed",
        );
      }
      settled.push({
        buyerId: authorization.buyerId,
        transactionId: settlement.transaction.transactionId,
        amountInCents: authorization.amountInCents,
        status: settlement.transaction.status,
        cached: settlement.cached,
      });
    }

    return NextResponse.json(
      {
        status: "settled",
        provider: "Rain",
        environment: "sandbox",
        realSandbox: true,
        runKey,
        sharedSandboxCardholder: true,
        funding: getDemoFundingState("settled", settlementTotalInCents),
        guardrail: {
          status: probe.transaction.status,
          reason: probe.transaction.declinedReason ?? "blocked_mcc",
          transactionId: probe.transaction.transactionId,
          merchantCategoryCode: BLOCKED_MCC,
        },
        payments: cards.map((card) => {
          const settlement = settled.find(
            (entry) => entry.buyerId === card.buyerId,
          );
          return {
            buyerId: card.buyerId,
            buyerName: card.buyerName,
            amountInCents: card.amountInCents,
            cardLast4: card.last4,
            cardId: card.cardId,
            transactionId: settlement?.transactionId,
            status: settlement?.status ?? "unknown",
            idempotentReplay: card.cached || settlement?.cached || false,
          };
        }),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const code =
      error instanceof RainApiError ? error.code : "rain_execution_failed";
    const externalSettledInCents = settled.reduce(
      (total, entry) => total + entry.amountInCents,
      0,
    );
    const fundingState =
      settled.length > 0
        ? getDemoFundingState(
            "reconciliation_required",
            externalSettledInCents,
          )
        : getDemoFundingState("frozen_for_retry");
    return NextResponse.json(
      {
        status: settled.length > 0 ? "partial" : "failed",
        code,
        message:
          "Rain sandbox could not complete this run. No simulated receipt has been substituted.",
        funding: fundingState,
        progress: {
          cardsIssued: cards.length,
          authorizations: authorized.length,
          settlements: settled.length,
        },
      },
      {
        status: error instanceof RainApiError ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
