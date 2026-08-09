"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  CreditCard,
  Gavel,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  buildNegotiationTranscript,
  MACBOOK_DEMAND_SCENARIO,
  negotiateDemandCurve,
  type DemandClearing,
  type TranscriptEntry,
} from "@/lib/negotiation";

import styles from "./negotiate.module.css";

type Phase = "idle" | "running" | "done";
type RunSource = "engine" | "local";

interface PurchaseReceipt {
  readonly merchantName: string;
  readonly amountInCents: number;
  readonly cardLast4?: string;
  readonly transactionId?: string;
  readonly transactionStatus?: string;
}

interface PurchasePlan {
  readonly merchantName: string;
  readonly merchantCategoryCode: string;
  readonly amountInCents: number;
}

type PurchaseState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "live"; message: string; receipt: PurchaseReceipt }
  | { kind: "rehearsal"; message: string; plan: PurchasePlan }
  | { kind: "failed"; message: string };

interface EditablePledge {
  readonly id: string;
  discountPct: number;
  buyerCount: number;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const moneyExact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const count = new Intl.NumberFormat("en-US");

function cents(value: number) {
  return value % 100 === 0 ? money.format(value / 100) : moneyExact.format(value / 100);
}

let pledgeSeq = 0;
const nextPledgeId = () => `pledge-${(pledgeSeq += 1)}`;

const DEFAULT_PLEDGES: EditablePledge[] = MACBOOK_DEMAND_SCENARIO.pledges.map((pledge) => ({
  id: nextPledgeId(),
  discountPct: pledge.discountBps / 100,
  buyerCount: pledge.buyerCount,
}));

const REVEAL_MS = 720;

export default function NegotiateExperience() {
  const [productLabel] = useState(MACBOOK_DEMAND_SCENARIO.productLabel);
  const [msrpDollars, setMsrpDollars] = useState(MACBOOK_DEMAND_SCENARIO.msrpUnitCents / 100);
  const [pledges, setPledges] = useState<EditablePledge[]>(DEFAULT_PLEDGES);
  const [phase, setPhase] = useState<Phase>("idle");
  const [clearing, setClearing] = useState<DemandClearing | null>(null);
  const [transcript, setTranscript] = useState<readonly TranscriptEntry[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [source, setSource] = useState<RunSource>("engine");
  const [error, setError] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<PurchaseState>({ kind: "idle" });
  const timers = useRef<number[]>([]);
  const streamRef = useRef<HTMLDivElement>(null);

  const msrpCents = Math.round(msrpDollars * 100);

  const curvePreview = useMemo(
    () =>
      [...pledges]
        .sort((a, b) => a.discountPct - b.discountPct)
        .map((pledge) => ({
          ...pledge,
          thresholdCents: Math.round((msrpCents * (100 - pledge.discountPct)) / 100),
        })),
    [msrpCents, pledges],
  );

  const totalPledgedBuyers = pledges.reduce((sum, pledge) => sum + pledge.buyerCount, 0);

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  const buildInput = useCallback(
    () => ({
      productLabel,
      msrpUnitCents: msrpCents,
      pledges: pledges.map((pledge) => ({
        discountBps: Math.round(pledge.discountPct * 100),
        buyerCount: Math.round(pledge.buyerCount),
      })),
    }),
    [msrpCents, pledges, productLabel],
  );

  const animate = useCallback((entries: readonly TranscriptEntry[]) => {
    clearTimers();
    setRevealed(1);
    for (let index = 2; index <= entries.length; index += 1) {
      const timer = window.setTimeout(() => {
        setRevealed(index);
        if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
      }, REVEAL_MS * (index - 1));
      timers.current.push(timer);
    }
    const done = window.setTimeout(() => setPhase("done"), REVEAL_MS * entries.length);
    timers.current.push(done);
  }, []);

  const run = useCallback(async () => {
    setPhase("running");
    setError(null);
    setClearing(null);
    setTranscript([]);
    setRevealed(0);
    setPurchase({ kind: "idle" });
    const input = buildInput();

    try {
      const response = await fetch("/api/negotiation/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pool-Agent-Action": "run-negotiation",
        },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as {
        clearing?: DemandClearing;
        transcript?: TranscriptEntry[];
        message?: string;
      };
      if (!response.ok || !body.clearing || !body.transcript) {
        throw new Error(body.message ?? "Negotiation service rejected the request.");
      }
      setSource("engine");
      setClearing(body.clearing);
      setTranscript(body.transcript);
      animate(body.transcript);
    } catch {
      // The engine is pure, so fall back to computing the same result locally.
      try {
        const localClearing = negotiateDemandCurve(input);
        const localTranscript = buildNegotiationTranscript(localClearing);
        setSource("local");
        setClearing(localClearing);
        setTranscript(localTranscript);
        animate(localTranscript);
      } catch (localError) {
        setPhase("idle");
        setError(localError instanceof Error ? localError.message : "This demand curve could not be negotiated.");
      }
    }
  }, [animate, buildInput]);

  const agentPurchase = useCallback(async () => {
    setPurchase({ kind: "running" });
    try {
      const response = await fetch("/api/negotiation/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pool-Agent-Action": "agent-purchase",
        },
        body: JSON.stringify(buildInput()),
      });
      const body = (await response.json()) as {
        status?: string;
        message?: string;
        receipt?: PurchaseReceipt;
        plan?: PurchasePlan;
      };
      if (response.ok && body.status === "purchased" && body.receipt) {
        setPurchase({ kind: "live", message: body.message ?? "", receipt: body.receipt });
      } else if (response.ok && body.status === "rehearsal" && body.plan) {
        setPurchase({ kind: "rehearsal", message: body.message ?? "", plan: body.plan });
      } else {
        setPurchase({ kind: "failed", message: body.message ?? "The agent could not complete the purchase." });
      }
    } catch {
      setPurchase({ kind: "failed", message: "The agent purchase endpoint was unreachable." });
    }
  }, [buildInput]);

  const reset = () => {
    clearTimers();
    setPhase("idle");
    setClearing(null);
    setTranscript([]);
    setRevealed(0);
    setError(null);
    setPurchase({ kind: "idle" });
    setMsrpDollars(MACBOOK_DEMAND_SCENARIO.msrpUnitCents / 100);
    setPledges(MACBOOK_DEMAND_SCENARIO.pledges.map((pledge) => ({
      id: nextPledgeId(),
      discountPct: pledge.discountBps / 100,
      buyerCount: pledge.buyerCount,
    })));
  };

  const updatePledge = (id: string, patch: Partial<EditablePledge>) => {
    setPledges((current) => current.map((pledge) => (pledge.id === id ? { ...pledge, ...patch } : pledge)));
  };

  const addPledge = () => {
    setPledges((current) => {
      if (current.length >= 6) return current;
      const usedPct = new Set(current.map((pledge) => pledge.discountPct));
      const nextPct = [5, 15, 25, 35, 40, 45].find((pct) => !usedPct.has(pct)) ?? 40;
      return [...current, { id: nextPledgeId(), discountPct: nextPct, buyerCount: 50 }];
    });
  };

  const removePledge = (id: string) => {
    setPledges((current) => (current.length <= 1 ? current : current.filter((pledge) => pledge.id !== id)));
  };

  const editable = phase !== "running";
  const maxBuyers = Math.max(...curvePreview.map((point) => point.buyerCount), 1);
  const visibleTranscript = transcript.slice(0, revealed);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="POOL home">
          <span className={styles.brandMark} aria-hidden="true"><span /><span /><span /></span>
          <span>POOL</span>
        </Link>
        <nav className={styles.nav} aria-label="Product navigation">
          <Link href="/">Workspace</Link>
          <Link href="/explore">Explore</Link>
          <Link href="/demo">Proof</Link>
          <span className={styles.navCurrent}>Agent negotiation</span>
        </nav>
        <button className={styles.iconButton} onClick={reset} aria-label="Reset scenario" title="Reset scenario">
          <RefreshCcw size={15} />
        </button>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Sparkles size={12} /> REVERSE MARKETPLACE</span>
          <h1>Buyers set the ceiling.<br /><em>Agents find the floor.</em></h1>
          <p>
            Nobody clicks “buy now.” Each buyer pledges the <strong>most</strong> they’d pay along a demand
            curve. When the window closes, POOL’s agents carry the whole curve to the merchants and negotiate
            one clearing price — and <strong>everyone</strong> who committed at or above it pays that price,
            even the buyers who would gladly have paid more.
          </p>
        </div>
        <div className={styles.heroCard}>
          <div className={styles.heroCardHead}>
            <span>DEMAND CURVE</span>
            <span>{count.format(totalPledgedBuyers)} pledged buyers</span>
          </div>
          <div className={styles.curveBars}>
            {curvePreview.map((point) => (
              <div className={styles.curveBar} key={point.id}>
                <span className={styles.curveBarLabel}>{point.discountPct}% off</span>
                <div className={styles.curveBarTrack}>
                  <div
                    className={styles.curveBarFill}
                    style={{ width: `${Math.max(8, (point.buyerCount / maxBuyers) * 100)}%` }}
                  >
                    <span>{count.format(point.buyerCount)}</span>
                  </div>
                </div>
                <span className={styles.curveBarPrice}>{cents(point.thresholdCents)}</span>
              </div>
            ))}
          </div>
          <p className={styles.heroCardFoot}>
            Lower price → more committed buyers → deeper merchant discount. That feedback loop is what the
            agents exploit.
          </p>
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><Users size={15} /><span>DEMAND CURVE</span></div>
            <span>what buyers pledged</span>
          </div>
          <div className={styles.editor}>
            <label className={styles.msrpRow}>
              <span>{productLabel} · MSRP</span>
              <span className={styles.inputShell}>
                <i>$</i>
                <input
                  type="number"
                  min={1}
                  max={1_000_000}
                  step={1}
                  value={msrpDollars}
                  disabled={!editable}
                  onChange={(event) => setMsrpDollars(Math.max(1, Number(event.target.value) || 0))}
                  aria-label="MSRP in dollars"
                />
              </span>
            </label>

            <div className={styles.pledgeHeadRow}>
              <span>Discount pledged</span>
              <span>Buyers</span>
              <span>Ceiling</span>
              <span />
            </div>

            {curvePreview.map((point) => (
              <div className={styles.pledgeRow} key={point.id}>
                <span className={styles.inputShell}>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    step={1}
                    value={point.discountPct}
                    disabled={!editable}
                    onChange={(event) => updatePledge(point.id, { discountPct: Math.max(0, Math.min(90, Number(event.target.value) || 0)) })}
                    aria-label="Discount percent"
                  />
                  <i>% off</i>
                </span>
                <span className={styles.inputShell}>
                  <input
                    type="number"
                    min={1}
                    max={1_000_000}
                    step={10}
                    value={point.buyerCount}
                    disabled={!editable}
                    onChange={(event) => updatePledge(point.id, { buyerCount: Math.max(1, Number(event.target.value) || 1) })}
                    aria-label="Buyer count"
                  />
                </span>
                <span className={styles.ceiling}>{cents(point.thresholdCents)}</span>
                <button
                  className={styles.rowButton}
                  onClick={() => removePledge(point.id)}
                  disabled={!editable || pledges.length <= 1}
                  aria-label="Remove pledge tier"
                >
                  <Minus size={13} />
                </button>
              </div>
            ))}

            <button className={styles.addRow} onClick={addPledge} disabled={!editable || pledges.length >= 6}>
              <Plus size={13} /> Add a price rung
            </button>
          </div>

          <button className={styles.runButton} onClick={() => void run()} disabled={phase === "running"}>
            {phase === "running" ? <span className={styles.spinner} /> : <Gavel size={15} />}
            {phase === "running" ? "Agents negotiating…" : phase === "done" ? "Re-run negotiation" : "Close window & send the agents"}
          </button>
          {error ? <p className={styles.error} role="alert"><X size={13} /> {error}</p> : null}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><Bot size={15} /><span>NEGOTIATION</span></div>
            <span>{source === "local" ? "local engine" : "agent runtime"}</span>
          </div>
          <div className={styles.stream} ref={streamRef} aria-live="polite">
            {phase === "idle" && visibleTranscript.length === 0 ? (
              <div className={styles.streamEmpty}>
                <Gavel size={18} />
                <span>Close the window to watch the agents take the demand curve to the merchants.</span>
              </div>
            ) : (
              visibleTranscript.map((entry) => (
                <div className={`${styles.entry} ${styles[`entry_${entry.actor}`] ?? ""}`} key={entry.sequence}>
                  <span className={styles.entryIcon} aria-hidden="true">
                    {entry.actor === "merchant" ? <Store size={13} /> : entry.actor === "pool_agent" ? <Bot size={13} /> : entry.kind === "cleared" ? <Check size={13} /> : entry.kind === "no_deal" ? <X size={13} /> : <Gavel size={13} />}
                  </span>
                  <div className={styles.entryBody}>
                    <div className={styles.entryTitle}>
                      <strong>{entry.title}</strong>
                      {entry.unitPriceCents !== null ? <span className={styles.entryPrice}>{cents(entry.unitPriceCents)}</span> : null}
                    </div>
                    <p>{entry.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      {clearing && phase === "done" ? (
        clearing.code === "cleared" && clearing.clearingUnitPriceCents !== null && clearing.winner ? (
          <section className={styles.outcome}>
            <div className={styles.outcomeHead}>
              <span className={styles.kicker}><TrendingDown size={12} /> MARKET CLEARED</span>
              <h2>Everyone pays <em>{cents(clearing.clearingUnitPriceCents)}</em></h2>
              <p>
                {clearing.winner.merchantName} took the {count.format(clearing.activatedUnits)}-unit order at{" "}
                {(clearing.clearingDiscountBps ?? 0) / 100}% off. All {count.format(clearing.activatedBuyers)} activated
                buyers pay the same price — including the ones who pledged far higher.
              </p>
            </div>

            <div className={styles.outcomeMetrics}>
              <div><span>Clearing price</span><strong>{cents(clearing.clearingUnitPriceCents)}</strong><small>{(clearing.clearingDiscountBps ?? 0) / 100}% below MSRP</small></div>
              <div><span>Activated buyers</span><strong>{count.format(clearing.activatedBuyers)}</strong><small>{count.format(clearing.activatedUnits)} units</small></div>
              <div><span>Total order</span><strong>{cents(clearing.clearingTotalCents)}</strong><small>vs {cents(clearing.msrpTotalCents)} at MSRP</small></div>
              <div className={styles.metricHighlight}><span>Collective savings</span><strong>{cents(clearing.totalSavingsCents)}</strong><small>released to buyers</small></div>
            </div>

            <div className={styles.tierTable} role="table" aria-label="Per-tier outcome">
              <div className={styles.tierRowHead} role="row">
                <span role="columnheader">Pledge</span>
                <span role="columnheader">Buyers</span>
                <span role="columnheader">Their ceiling</span>
                <span role="columnheader">They pay</span>
                <span role="columnheader">Saved / buyer</span>
              </div>
              {clearing.tierOutcomes.map((tier) => (
                <div className={`${styles.tierRow} ${tier.included ? styles.tierIncluded : styles.tierExcluded}`} role="row" key={tier.discountBps}>
                  <span role="cell">{tier.discountBps / 100}% off</span>
                  <span role="cell">{count.format(tier.buyerCount)}</span>
                  <span role="cell">{cents(tier.thresholdUnitPriceCents)}</span>
                  <span role="cell">
                    {tier.included && tier.paidUnitPriceCents !== null ? (
                      <strong>{cents(tier.paidUnitPriceCents)}</strong>
                    ) : (
                      <em className={styles.notServed}>not served</em>
                    )}
                  </span>
                  <span role="cell">
                    {tier.included ? (
                      <span className={styles.saved}>+{cents(tier.surplusPerBuyerCents)}</span>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className={styles.outcomeNote}>
              <LockKeyhole size={12} /> Merchant floors stayed private throughout. Only public quotes ever left
              the negotiation.
            </p>

            <div className={styles.purchase}>
              <div className={styles.purchaseCopy}>
                <span className={styles.kicker}><CreditCard size={12} /> AUTONOMOUS PURCHASE</span>
                <strong>Let the agent buy it from {clearing.winner.merchantName}</strong>
                <p>
                  The agent mints a Rain scoped card for exactly the cleared price, locked to the merchant’s
                  category, then authorizes and settles the purchase on its own. It can never spend more than the
                  cleared amount or off-category.
                </p>
              </div>
              <div className={styles.purchaseAction}>
                {purchase.kind === "live" ? (
                  <div className={`${styles.receipt} ${styles.receiptLive}`}>
                    <div className={styles.receiptHead}><ShieldCheck size={14} /> RAIN SANDBOX · VERIFIED</div>
                    <p>{purchase.message}</p>
                    <dl>
                      <div><dt>Merchant</dt><dd>{purchase.receipt.merchantName}</dd></div>
                      <div><dt>Charged</dt><dd>{cents(purchase.receipt.amountInCents)}</dd></div>
                      {purchase.receipt.cardLast4 ? <div><dt>Scoped card</dt><dd>•••• {purchase.receipt.cardLast4}</dd></div> : null}
                      {purchase.receipt.transactionId ? <div><dt>Transaction</dt><dd className={styles.mono}>{purchase.receipt.transactionId.slice(0, 8)}…</dd></div> : null}
                    </dl>
                  </div>
                ) : purchase.kind === "rehearsal" ? (
                  <div className={`${styles.receipt} ${styles.receiptRehearsal}`}>
                    <div className={styles.receiptHead}><Bot size={14} /> REHEARSAL · SIMULATED</div>
                    <p>{purchase.message}</p>
                    <dl>
                      <div><dt>Would charge</dt><dd>{cents(purchase.plan.amountInCents)}</dd></div>
                      <div><dt>Merchant</dt><dd>{purchase.plan.merchantName}</dd></div>
                      <div><dt>Card scope (MCC)</dt><dd className={styles.mono}>{purchase.plan.merchantCategoryCode}</dd></div>
                    </dl>
                  </div>
                ) : purchase.kind === "failed" ? (
                  <p className={styles.error}><X size={13} /> {purchase.message}</p>
                ) : null}
                <button
                  className={styles.purchaseButton}
                  onClick={() => void agentPurchase()}
                  disabled={purchase.kind === "running"}
                >
                  {purchase.kind === "running" ? <span className={styles.spinner} /> : <CreditCard size={15} />}
                  {purchase.kind === "running"
                    ? "Agent purchasing…"
                    : purchase.kind === "live" || purchase.kind === "rehearsal"
                      ? "Run purchase again"
                      : "Send the agent to buy"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className={`${styles.outcome} ${styles.outcomeNoDeal}`}>
            <div className={styles.outcomeHead}>
              <span className={styles.kicker}><X size={12} /> NO DEAL</span>
              <h2>The market didn’t clear</h2>
              <p>
                The deepest merchant price was {cents(clearing.shortfall?.bestAchievableUnitPriceCents ?? 0)}, still{" "}
                {cents(clearing.shortfall?.gapCents ?? 0)} above the highest pledge of{" "}
                {cents(clearing.shortfall?.highestPledgeUnitPriceCents ?? 0)}. No buyer is charged and every
                reservation is released — patience did not turn into leverage this time.
              </p>
            </div>
          </section>
        )
      ) : null}

      <section className={styles.explainer}>
        <div className={styles.explainStep}>
          <span>01</span>
          <strong>Pledge, don’t bid</strong>
          <p>Each buyer names the highest price they’d accept. That’s the whole ask.</p>
        </div>
        <ArrowRight size={16} />
        <div className={styles.explainStep}>
          <span>02</span>
          <strong>Agents aggregate</strong>
          <p>POOL turns thousands of ceilings into one demand curve of committed purchasing power.</p>
        </div>
        <ArrowRight size={16} />
        <div className={styles.explainStep}>
          <span>03</span>
          <strong>Merchants compete</strong>
          <p>Deeper volume unlocks deeper discounts; the agent keeps pushing until a merchant stops.</p>
        </div>
        <ArrowRight size={16} />
        <div className={styles.explainStep}>
          <span>04</span>
          <strong>One price for all</strong>
          <p>Everyone above the clearing price buys — and every one of them pays the clearing price.</p>
        </div>
      </section>
    </main>
  );
}
