import { NextRequest, NextResponse } from "next/server";
import {
  getRainIssuingBalances,
  isRainConfigured,
  RainApiError,
} from "../../../../lib/rain/client";
import {
  canExecuteLiveDemo,
  getDemoAccessConfiguration,
  isDemoAccessConfigured,
} from "../../../../lib/security/demo-access";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Labeled offline ceiling. It is returned whenever POOL cannot read a real
 * number, so the client never has to guess whether a figure came from Rain.
 */
function localTreasury(reason: string) {
  return {
    source: "local" as const,
    currency: "usd",
    spendingPowerCents: null,
    creditLimitCents: null,
    postedChargesCents: null,
    pendingChargesCents: null,
    syncedAt: null,
    reason,
  };
}

/**
 * Reports the team's real Rain sandbox spend ceiling.
 *
 * Read-only: it never issues a card, funds collateral, or moves sandbox value.
 * It contacts Rain only once the same access boundary the status route applies
 * has been satisfied, so a locked deployment stays offline rather than leaking
 * provider state.
 */
export async function GET(request: NextRequest) {
  if (!isRainConfigured()) {
    return NextResponse.json(localTreasury("Rain sandbox is not configured."), {
      headers: NO_STORE,
    });
  }

  const accessConfiguration = getDemoAccessConfiguration();
  const accessUnlocked = canExecuteLiveDemo(request);
  const accessRequired =
    !accessUnlocked &&
    (isDemoAccessConfigured() || accessConfiguration.required);

  if (accessRequired) {
    return NextResponse.json(
      localTreasury("Unlock the protected demo to read the live Rain ceiling."),
      { headers: NO_STORE },
    );
  }

  try {
    const balances = await getRainIssuingBalances();
    return NextResponse.json(
      {
        source: "rain-sandbox" as const,
        currency: balances.currency,
        spendingPowerCents: balances.spendingPower,
        creditLimitCents: balances.creditLimit,
        postedChargesCents: balances.postedCharges,
        pendingChargesCents: balances.pendingCharges,
        balanceDueCents: balances.balanceDue,
        syncedAt: new Date().toISOString(),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    const reason =
      error instanceof RainApiError
        ? error.message
        : "Rain sandbox could not be reached.";
    return NextResponse.json(localTreasury(reason), {
      status: 503,
      headers: NO_STORE,
    });
  }
}
