/**
 * Turns a {@link DemandClearing} into a linear, human-readable transcript.
 *
 * This is the narration the buyer watches after the window closes: the agent
 * aggregating the curve, testing each price level with the merchants, and
 * landing on the single clearing price everyone pays. It is pure so the same
 * clearing always produces the same story.
 */

import type { DemandClearing } from "./demand-curve.ts";

export type TranscriptActor = "pool_agent" | "merchant" | "market";

export type TranscriptKind =
  | "window_closed"
  | "curve_aggregated"
  | "probe"
  | "rejected"
  | "cleared"
  | "no_deal";

export interface TranscriptEntry {
  readonly sequence: number;
  readonly actor: TranscriptActor;
  readonly kind: TranscriptKind;
  readonly title: string;
  readonly detail: string;
  readonly unitPriceCents: number | null;
}

const money = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const pct = (bps: number): string => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export function buildNegotiationTranscript(clearing: DemandClearing): readonly TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let sequence = 0;
  const push = (entry: Omit<TranscriptEntry, "sequence">) => {
    sequence += 1;
    entries.push({ sequence, ...entry });
  };

  const totalBuyers = clearing.curve.at(-1)?.cumulativeBuyers ?? 0;

  push({
    actor: "market",
    kind: "window_closed",
    title: "Commitment window closed",
    detail: `${totalBuyers} buyers pledged along the ${clearing.productLabel} demand curve at ${money(clearing.msrpUnitCents)} MSRP.`,
    unitPriceCents: null,
  });

  const curveSummary = clearing.curve
    .map((point) => `${point.buyerCount} at ${money(point.thresholdUnitPriceCents)}`)
    .join(", ");
  push({
    actor: "pool_agent",
    kind: "curve_aggregated",
    title: "Agent aggregated the demand curve",
    detail: `Taking the whole curve to the merchants: ${curveSummary}. Lower price unlocks more committed buyers.`,
    unitPriceCents: null,
  });

  for (const round of clearing.rounds) {
    push({
      actor: round.accepted ? "merchant" : "market",
      kind: round.accepted ? "probe" : "rejected",
      title: round.accepted
        ? `Probe ${pct(round.consideredDiscountBps)} off · ${round.committedUnits} units`
        : `${pct(round.consideredDiscountBps)} off is out of reach`,
      detail: round.note,
      unitPriceCents: round.bestUnitPriceCents,
    });
  }

  if (clearing.code === "cleared" && clearing.winner && clearing.clearingUnitPriceCents !== null) {
    push({
      actor: "market",
      kind: "cleared",
      title: `Cleared at ${money(clearing.clearingUnitPriceCents)} — ${pct(clearing.clearingDiscountBps ?? 0)} off`,
      detail: `${clearing.winner.merchantName} takes the ${clearing.activatedUnits}-unit order. All ${clearing.activatedBuyers} activated buyers pay ${money(clearing.clearingUnitPriceCents)}, saving ${money(clearing.totalSavingsCents)} together versus MSRP.`,
      unitPriceCents: clearing.clearingUnitPriceCents,
    });
  } else if (clearing.shortfall) {
    push({
      actor: "market",
      kind: "no_deal",
      title: "No deal cleared",
      detail: `The deepest merchant price was ${money(clearing.shortfall.bestAchievableUnitPriceCents)}, still ${money(clearing.shortfall.gapCents)} above the highest pledge of ${money(clearing.shortfall.highestPledgeUnitPriceCents)}. Every reservation is released.`,
      unitPriceCents: clearing.shortfall.bestAchievableUnitPriceCents,
    });
  }

  return entries;
}
