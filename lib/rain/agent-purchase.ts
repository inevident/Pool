import "server-only";
import {
  authorizeCard,
  fundDemoRailCollateral,
  issueScopedCard,
  RainApiError,
  reverseAuthorization,
  settleAuthorization,
} from "./client.ts";

/**
 * Autonomous purchase for the negotiation agent.
 *
 * After the demand curve clears and the agent has chosen a winning merchant, it
 * executes the buy itself: it mints a Rain scoped card for exactly the cleared
 * amount, restricted to the merchant's category, authorizes at that merchant,
 * and settles. The card is scoped so the agent can never spend more than the
 * cleared amount or at an off-policy merchant category — the authority the agent
 * receives is derived from the market outcome, not the other way around.
 *
 * If any step after authorization fails, the open authorization is reversed so a
 * failed run never leaves money held.
 */
export interface AgentPurchaseInput {
  readonly merchantName: string;
  readonly merchantCategoryCode: string;
  readonly amountInCents: number;
  readonly runKey: string;
  readonly expiresAt: string;
}

export interface AgentPurchaseReceipt {
  readonly status: "purchased";
  readonly provider: "Rain";
  readonly environment: "sandbox";
  readonly merchantName: string;
  readonly merchantCategoryCode: string;
  readonly amountInCents: number;
  readonly cardId: string;
  readonly cardLast4: string;
  readonly transactionId: string;
  readonly transactionStatus: string;
  readonly idempotentReplay: boolean;
}

export async function executeAgentPurchase(
  input: AgentPurchaseInput,
): Promise<AgentPurchaseReceipt> {
  // Top up team-level sandbox rail liquidity. This is not a buyer balance.
  await fundDemoRailCollateral(500_000, `${input.runKey}-fund`);

  const issued = await issueScopedCard({
    amountInUSDCents: input.amountInCents,
    allowedMccs: [input.merchantCategoryCode],
    expiresAt: input.expiresAt,
    idempotencyKey: `${input.runKey}-card`,
  });

  const authorization = await authorizeCard({
    cardId: issued.card.id,
    amountInCents: input.amountInCents,
    merchantName: input.merchantName,
    merchantCategoryCode: input.merchantCategoryCode,
    idempotencyKey: `${input.runKey}-authorize`,
  });

  if (authorization.transaction.status !== "authorized") {
    throw new RainApiError(
      "The agent's scoped-card authorization was declined by Rain.",
      409,
      authorization.transaction.declinedReason ?? "authorization_declined",
    );
  }

  try {
    const settlement = await settleAuthorization({
      transactionId: authorization.transaction.transactionId,
      amountInCents: input.amountInCents,
      idempotencyKey: `${input.runKey}-settle`,
    });

    if (settlement.transaction.status !== "settled") {
      throw new RainApiError(
        "Rain did not confirm settlement of the agent's purchase.",
        502,
        "settlement_not_confirmed",
      );
    }

    return {
      status: "purchased",
      provider: "Rain",
      environment: "sandbox",
      merchantName: input.merchantName,
      merchantCategoryCode: input.merchantCategoryCode,
      amountInCents: input.amountInCents,
      cardId: issued.card.id,
      cardLast4: issued.card.last4,
      transactionId: settlement.transaction.transactionId,
      transactionStatus: settlement.transaction.status,
      idempotentReplay: issued.cached || settlement.cached,
    };
  } catch (error) {
    // Never leave a dangling hold on a failed run.
    await reverseAuthorization({
      transactionId: authorization.transaction.transactionId,
      idempotencyKey: `${input.runKey}-reverse`,
    }).catch(() => undefined);
    throw error;
  }
}
