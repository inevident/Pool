"use client";

import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CloudLightning,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type RainStatus = {
  configured: boolean;
  connected: boolean;
  environment: "sandbox" | "rehearsal";
  liveExecutionEnabled: boolean;
};

type RainPayment = {
  buyerId: string;
  buyerName: string;
  amountInCents: number;
  cardLast4: string;
  cardId: string;
  transactionId?: string;
  status: string;
  idempotentReplay: boolean;
};

type RainResult = {
  status: "settled" | "partial" | "failed";
  provider?: "Rain";
  environment?: "sandbox";
  realSandbox?: boolean;
  runKey?: string;
  sharedSandboxCardholder?: boolean;
  guardrail?: {
    status: string;
    reason: string;
    transactionId: string;
    merchantCategoryCode: string;
  };
  payments?: RainPayment[];
  message?: string;
  code?: string;
};

type SettlementState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "live"; result: RainResult }
  | { kind: "rehearsal" }
  | { kind: "failed"; message: string };

const MSRP_UNIT = 479;
const DEAL_UNIT = 389;

const buyers = [
  {
    id: "buyer-harbor",
    name: "Harbor Labs",
    initials: "HL",
    quantity: 3,
    deadline: 10,
    brief: '“Three color-accurate 27\" 4K displays with one-cable charging.”',
    accent: "violet",
  },
  {
    id: "buyer-patchwork",
    name: "Patchwork AI",
    initials: "PA",
    quantity: 4,
    deadline: 8,
    brief: '“Four VESA-mountable 27\" 4K displays for a new engineering pod.”',
    accent: "blue",
  },
  {
    id: "buyer-kernel",
    name: "Kernel Works",
    initials: "KW",
    quantity: 5,
    deadline: 12,
    brief: '“Five compact 4K development monitors with HDMI support.”',
    accent: "coral",
  },
] as const;

const merchants = [
  {
    id: "signal",
    name: "Signal Supply Co.",
    initials: "SS",
    prices: [401, 401, 389, 389],
    delivery: "7 days",
    warranty: "36 mo",
    inventory: 60,
    accent: "lime",
  },
  {
    id: "keystone",
    name: "Keystone Office",
    initials: "KO",
    prices: [405, 405, 395, 395],
    delivery: "3 days",
    warranty: "24 mo",
    inventory: 40,
    accent: "violet",
  },
  {
    id: "northstar",
    name: "Northstar Systems",
    initials: "NS",
    prices: [407, 407, 397, 397],
    delivery: "5 days",
    warranty: "24 mo",
    inventory: 80,
    accent: "blue",
  },
] as const;

const timeline = [
  { stage: 1, time: "00:01", label: "Harbor qualifies with $1,437 deposited; MSRP is reserved", tone: "accent" },
  { stage: 2, time: "00:03", label: "Patchwork joins; $1,916 becomes unavailable elsewhere", tone: "accent" },
  { stage: 3, time: "00:05", label: "Kernel reserves $2,395 and adds HDMI as a hard constraint", tone: "accent" },
  { stage: 4, time: "00:07", label: "Ultrawide request isolated — form-factor mismatch", tone: "danger" },
  { stage: 5, time: "00:09", label: "12 units and $5,748 in MSRP reservations clear into POOL-017", tone: "accent" },
  { stage: 6, time: "00:12", label: "Three merchant agents receive an anonymized RFP", tone: "neutral" },
  { stage: 7, time: "00:16", label: "Initial market opens with a best bid of $401", tone: "accent" },
  { stage: 8, time: "00:21", label: "Coalition counters at $383 for immediate commitment", tone: "accent" },
  { stage: 9, time: "00:24", label: "Signal clears at $389; accepted offer freezes reservations", tone: "success" },
  { stage: 10, time: "00:27", label: "$4,668 clears for capture; $1,080 releases only after settlement", tone: "success" },
  { stage: 11, time: "00:30", label: "Rain receives scoped authority only after POOL clearing", tone: "rain" },
] as const;

const stageCopy = [
  { eyebrow: "PREFUNDED MARKET", title: "Participation starts with the MSRP on balance." },
  { eyebrow: "RESERVATION 01 / 03", title: "Harbor joins. Its full MSRP becomes reserved." },
  { eyebrow: "RESERVATION 02 / 03", title: "Patchwork locks its buying commitment." },
  { eyebrow: "RESERVATION 03 / 03", title: "Every unit is now covered before negotiation." },
  { eyebrow: "CONSTRAINT CHECK", title: "Similarity is not permission." },
  { eyebrow: "COALITION FORMED", title: "Twelve funded units now negotiate as one." },
  { eyebrow: "SELLER MARKET OPEN", title: "Merchants compete for the whole block." },
  { eyebrow: "REVERSE AUCTION", title: "Competition converts quantity into leverage." },
  { eyebrow: "COUNTEROFFER", title: "Commitment moves the market again." },
  { eyebrow: "AGREEMENT FOUND", title: "The coalition clears at $389 per unit." },
  { eyebrow: "CAPTURE CLEARING", title: "Only the deal price can leave each reservation." },
  { eyebrow: "PAYMENT AUTHORITY", title: "POOL clears first. Rain executes second." },
  { eyebrow: "POOL SETTLED", title: "The deal is captured. The difference is available again." },
] as const;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const timings = [0, 900, 900, 1050, 1200, 1250, 1300, 1650, 1700, 1350, 1500, 0];

function merchantRound(stage: number) {
  if (stage >= 9) return 3;
  if (stage >= 8) return 2;
  if (stage >= 7) return 1;
  return 0;
}

function shortId(value?: string) {
  if (!value) return "pending";
  return `${value.slice(0, 6)}…${value.slice(-5)}`;
}

function RainWordmark() {
  return <span className="rain-wordmark" aria-label="Rain">rain</span>;
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={`status-dot ${online ? "is-online" : ""}`} aria-hidden="true" />;
}

export default function Home() {
  const [stage, setStage] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [rainStatus, setRainStatus] = useState<RainStatus | null>(null);
  const [settlement, setSettlement] = useState<SettlementState>({ kind: "idle" });
  const [paymentProgress, setPaymentProgress] = useState(0);
  const eventStreamRef = useRef<HTMLDivElement>(null);

  const round = merchantRound(stage);
  const currentPrice = stage >= 8 ? DEAL_UNIT : stage >= 6 ? 401 : MSRP_UNIT;
  const visibleEvents = timeline.filter((event) => event.stage <= stage);
  const savings = (MSRP_UNIT - DEAL_UNIT) * 12;
  const baseline = MSRP_UNIT * 12;
  const poolTotal = DEAL_UNIT * 12;
  const totalUnits = buyers.reduce((total, buyer) => total + buyer.quantity, 0);
  const reservedUnits = buyers
    .slice(0, Math.min(stage, buyers.length))
    .reduce((total, buyer) => total + buyer.quantity, 0);
  const activeReservation = stage >= 12 ? 0 : reservedUnits * MSRP_UNIT;
  const currentCopy = stageCopy[Math.min(stage, stageCopy.length - 1)];
  const marketIsPlaying = autoplay && stage < 11;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/rain/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as RainStatus;
        setRainStatus(body);
      })
      .catch(() => {
        setRainStatus({
          configured: false,
          connected: false,
          environment: "rehearsal",
          liveExecutionEnabled: false,
        });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoplay || stage === 0 || stage >= 11) {
      return;
    }
    const timeout = window.setTimeout(
      () => setStage((current) => Math.min(current + 1, 11)),
      timings[stage] ?? 1100,
    );
    return () => window.clearTimeout(timeout);
  }, [autoplay, stage]);

  useEffect(() => {
    if (settlement.kind !== "running") return;
    const interval = window.setInterval(() => {
      setPaymentProgress((current) => Math.min(current + (current < 55 ? 7 : 2), 88));
    }, 420);
    return () => window.clearInterval(interval);
  }, [settlement.kind]);

  useEffect(() => {
    if (eventStreamRef.current) {
      eventStreamRef.current.scrollTop = eventStreamRef.current.scrollHeight;
    }
  }, [visibleEvents.length]);

  const marketState = useMemo(() => {
    if (stage === 0) return "Waiting for demand";
    if (stage <= 3) return "Reserving MSRP";
    if (stage === 4) return "Protecting hard constraints";
    if (stage === 5) return "Pool live";
    if (stage <= 8) return "Merchants competing";
    if (stage === 9) return "Deal agreed";
    if (stage === 10) return "Capture amounts cleared";
    if (settlement.kind === "running") return "Rain authorizing";
    if (stage >= 12) return "Pool settled";
    return "Ready to transact";
  }, [settlement.kind, stage]);

  function launchDemo() {
    setSettlement({ kind: "idle" });
    setPaymentProgress(0);
    setStage(1);
    setAutoplay(true);
  }

  function resetDemo() {
    setStage(0);
    setAutoplay(false);
    setSettlement({ kind: "idle" });
    setPaymentProgress(0);
  }

  async function executeRainSettlement() {
    setAutoplay(false);
    setSettlement({ kind: "running" });
    setPaymentProgress(8);
    try {
      const response = await fetch("/api/rain/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pool-Demo-Action": "execute-sandbox",
        },
        body: JSON.stringify({
          scenarioVersion: "monitor-pool-v1",
          confirmation: "execute-rain-sandbox",
        }),
      });
      const result = (await response.json()) as RainResult;
      if (!response.ok || result.status !== "settled") {
        throw new Error(result.message ?? "Rain sandbox execution failed");
      }
      setPaymentProgress(100);
      setSettlement({ kind: "live", result });
      setStage(12);
    } catch (error) {
      setSettlement({
        kind: "failed",
        message: error instanceof Error ? error.message : "Rain sandbox execution failed",
      });
    }
  }

  function useRehearsal() {
    setPaymentProgress(100);
    setSettlement({ kind: "rehearsal" });
    setStage(12);
  }

  const livePayments = settlement.kind === "live" ? settlement.result.payments ?? [] : [];
  const outcomeMode = settlement.kind === "live" ? "RAIN SANDBOX · VERIFIED" : "REHEARSAL · SIMULATED";

  return (
    <main className={`app-shell stage-${stage}`}>
      <header className="topbar">
        <a href="#top" className="brand" aria-label="POOL home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>POOL</span>
        </a>
        <nav className="topnav" aria-label="Product navigation">
          <a href="#market">Live market</a>
          <a href="#authority">Funds & authority</a>
          <a href="#outcome">Outcome</a>
        </nav>
        <div className="topbar-status">
          <div className="sandbox-badge" title="No real money moves in the Rain hackathon sandbox">
            <StatusDot online={Boolean(rainStatus?.connected)} />
            <RainWordmark />
            <span>{rainStatus?.connected ? "sandbox connected" : "rehearsal ready"}</span>
          </div>
          <button className="icon-button" onClick={resetDemo} aria-label="Reset demo" title="Reset demo">
            <RefreshCcw size={15} />
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="section-label"><span>PREFUNDED COLLECTIVE COMMERCE</span><span>01 / LIVE MARKET</span></div>
          <h1>Buyers don’t find<br />the market. <em>They become it.</em></h1>
          <p>
            To join, every buyer first deposits at least the item’s MSRP into their POOL balance.
            Joining reserves that amount so it cannot be withdrawn or spent elsewhere while the group buy is active.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={stage === 0 ? launchDemo : () => setAutoplay((value) => !value)} disabled={stage >= 11}>
              {stage === 0 ? <Play size={15} fill="currentColor" /> : marketIsPlaying ? <Pause size={15} fill="currentColor" /> : stage >= 11 ? <Check size={15} /> : <Play size={15} fill="currentColor" />}
              {stage === 0 ? "Launch prefunded market" : marketIsPlaying ? "Pause market" : stage >= 11 ? "Market cleared" : "Resume market"}
            </button>
            <button className="text-button" onClick={() => {
              setAutoplay(false);
              setStage((current) => current === 0 ? 1 : Math.min(current + 1, 11));
            }} disabled={stage >= 11}>
              Step manually <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="hero-ledger" aria-label="Hero market summary">
          <div className="ledger-head">
            <span>HERO MARKET</span>
            <span className="live-chip"><StatusDot online={stage > 0} />{marketState}</span>
          </div>
          <div className="product-line">
            <div className="product-glyph" aria-hidden="true"><span /></div>
            <div>
              <strong>27” 4K USB-C displays</strong>
              <span>12-unit group buy · MSRP {money.format(MSRP_UNIT)} each · New York</span>
            </div>
          </div>
          <div className="hero-metrics">
            <div><span>MSRP requirement</span><strong>{money.format(MSRP_UNIT)}<small>/unit</small></strong></div>
            <div><span>POOL balances</span><strong>{money.format(baseline)}<small>deposited</small></strong></div>
            <div><span>Active reservation</span><strong>{money.format(activeReservation)}<small>{stage >= 12 ? "released" : "locked"}</small></strong></div>
          </div>
          <div className="funding-rail" aria-label="POOL funding lifecycle">
            <div className="funding-step is-active"><span>01 · DEPOSIT</span><strong>{money.format(baseline)}</strong><small>across 3 POOL balances</small></div>
            <ArrowRight size={14} />
            <div className={`funding-step ${stage >= 1 ? "is-active" : ""}`}><span>02 · JOIN</span><strong>Reserve MSRP</strong><small>unavailable while active</small></div>
            <ArrowRight size={14} />
            <div className={`funding-step ${stage >= 9 ? "is-active" : ""}`}><span>03 · SETTLE</span><strong>{money.format(poolTotal)} captured</strong><small>{money.format(savings)} unlocks</small></div>
          </div>
          <div className="funding-exit-rule"><LockKeyhole size={12} /><span>Leave before the commitment cutoff → full release. After offer acceptance → frozen through settlement, cancellation, or reconciliation.</span></div>
          <div className="hero-ticker"><span>POOL-2408-017</span><span>{currentCopy.eyebrow}</span><span>NYC / USD</span></div>
        </div>
      </section>

      <section className="market-section" id="market">
        <div className="market-section-head">
          <div>
            <span className="eyebrow">{currentCopy.eyebrow}</span>
            <h2>{currentCopy.title}</h2>
          </div>
          <div className="stage-progress" aria-label={`Demo stage ${Math.min(stage, 11)} of 11`}>
            {Array.from({ length: 11 }, (_, index) => (
              <span key={index} className={index < stage ? "is-complete" : index === stage ? "is-current" : ""} />
            ))}
          </div>
        </div>

        <div className="market-grid">
          <section className="market-column buyers-column" aria-labelledby="buyers-title">
            <div className="column-head">
              <div><Users size={15} /><span id="buyers-title">BUYER AGENTS</span></div>
              <span>{Math.min(stage, 3)} / 3 compatible</span>
            </div>
            <div className="buyer-list">
              {buyers.map((buyer, index) => {
                const visible = stage >= index + 1;
                const cleared = stage >= 5;
                const requiredDeposit = buyer.quantity * MSRP_UNIT;
                return (
                  <article className={`buyer-row ${visible ? "is-visible" : ""}`} key={buyer.id}>
                    <div className={`avatar avatar-${buyer.accent}`}>{buyer.initials}</div>
                    <div className="buyer-main">
                      <div className="row-title"><strong>{buyer.name}</strong><span>{visible ? "intent received" : "waiting"}</span></div>
                      <p>{buyer.brief}</p>
                      <div className="constraint-row">
                        <span><strong>{buyer.quantity}</strong> units</span>
                        <span><Clock3 size={12} /> ≤ {buyer.deadline}d</span>
                        <span><LockKeyhole size={12} /> max sealed</span>
                      </div>
                      <div className={`buyer-funds ${visible ? "is-reserved" : ""}`}>
                        <span>POOL balance <strong>{money.format(requiredDeposit)}</strong></span>
                        <span>{visible ? "MSRP reserved" : "deposit required"} <strong>{money.format(requiredDeposit)}</strong></span>
                      </div>
                    </div>
                    <span className={`match-mark ${cleared ? "is-cleared" : ""}`} aria-label={cleared ? "Compatible" : "Pending"}>
                      {cleared ? <Check size={14} /> : <span />}
                    </span>
                  </article>
                );
              })}
              <article className={`buyer-row excluded-row ${stage >= 4 ? "is-visible" : ""}`}>
                <div className="avatar avatar-muted">SA</div>
                <div className="buyer-main">
                  <div className="row-title"><strong>Studio Arc</strong><span>kept separate</span></div>
                  <p>“Two immersive 34-inch ultrawide OLED displays.”</p>
                  <div className="constraint-row danger-text"><X size={12} /> Hard form-factor mismatch</div>
                </div>
                <span className="match-mark is-rejected"><X size={14} /></span>
              </article>
            </div>
            <div className={`privacy-note ${stage >= 5 ? "is-active" : ""}`}>
              <Fingerprint size={16} />
              <div><strong>Funded without exposing a ceiling</strong><span>POOL verifies MSRP coverage and reserves funds. Private maximum prices never leave the buyer agents.</span></div>
            </div>
          </section>

          <section className={`pool-core ${stage >= 5 ? "is-formed" : ""}`} aria-labelledby="pool-title">
            <div className="pool-orbit orbit-one" /><div className="pool-orbit orbit-two" />
            <div className="pool-core-head"><span>POOL-017</span><span>{stage >= 5 ? "COALITION LIVE" : "SCANNING"}</span></div>
            <div className="pool-quantity">
              <span id="pool-title">AGGREGATED DEMAND</span>
              <strong>{stage >= 5 ? totalUnits : "—"}</strong>
              <small>units · {stage >= 5 ? "3 buyers" : "forming"}</small>
            </div>
            <div className="pressure-meter" aria-label="Coalition bargaining pressure">
              <div><span>Harbor</span><i style={{ width: stage >= 1 ? "25%" : "0%" }} /></div>
              <div><span>Patchwork</span><i style={{ width: stage >= 2 ? "58%" : "0%" }} /></div>
              <div><span>Kernel</span><i style={{ width: stage >= 3 ? "100%" : "0%" }} /></div>
            </div>
            <div className="price-compression">
              <div className="compression-label"><span>PRICE COMPRESSION</span><span>{stage >= 6 ? `${Math.round(((MSRP_UNIT - currentPrice) / MSRP_UNIT) * 100)}%` : "—"}</span></div>
              <div className="price-track"><span className="price-fill" style={{ width: `${stage >= 6 ? Math.max(8, ((MSRP_UNIT - currentPrice) / 100) * 100) : 0}%` }} /><i className="baseline-pin">${MSRP_UNIT}</i><i className="deal-pin">${currentPrice}</i></div>
            </div>
            <div className="pool-footer"><EyeOff size={14} /><span>0 private limits revealed</span></div>
          </section>

          <section className="market-column sellers-column" aria-labelledby="sellers-title">
            <div className="column-head">
              <div><Store size={15} /><span id="sellers-title">SELLER COMPETITION</span></div>
              <span>{stage >= 6 ? "3 bidding" : "market closed"}</span>
            </div>
            <div className="merchant-list">
              {merchants.map((merchant, index) => {
                const visible = stage >= 6;
                const winning = merchant.id === "signal" && stage >= 9;
                const price = merchant.prices[round];
                const stepped = stage >= 7;
                return (
                  <article className={`merchant-row ${visible ? "is-visible" : ""} ${winning ? "is-winning" : ""}`} key={merchant.id} style={{ transitionDelay: `${index * 90}ms` }}>
                    <div className={`avatar avatar-${merchant.accent}`}>{merchant.initials}</div>
                    <div className="merchant-main">
                      <div className="row-title"><strong>{merchant.name}</strong>{winning ? <span className="winner-chip"><Check size={11} /> winner</span> : <span>{merchant.inventory} in stock</span>}</div>
                      <div className="merchant-terms"><span>{merchant.delivery}</span><span>{merchant.warranty}</span><span>floor sealed</span></div>
                    </div>
                    <div className={`merchant-price ${stepped ? "has-moved" : ""}`}><strong>{money.format(price)}</strong><span>/unit</span></div>
                  </article>
                );
              })}
            </div>
            <div className={`auction-callout ${stage >= 8 ? "is-active" : ""}`}>
              <div className="auction-icon"><Zap size={16} /></div>
              <div><span>COALITION COUNTER</span><strong>$383 / unit</strong><small>12 prefunded · immediate funded commitment</small></div>
              <ArrowRight size={17} />
            </div>
          </section>
        </div>

        <div className="market-lower-grid">
          <section className="event-panel">
            <div className="panel-head"><div><CloudLightning size={15} /><span>MARKET EVENT STREAM</span></div><span>deterministic replay</span></div>
            <div className="event-stream" ref={eventStreamRef} aria-live="polite">
              {visibleEvents.length === 0 ? (
                <div className="empty-stream"><Sparkles size={18} /><span>Launch the market to watch agents coordinate demand.</span></div>
              ) : visibleEvents.map((event) => (
                <div className={`event-row tone-${event.tone}`} key={event.stage}>
                  <time>{event.time}</time><span className="event-node" /><p>{event.label}</p><ChevronRight size={13} />
                </div>
              ))}
            </div>
          </section>

          <section className={`deal-panel ${stage >= 9 ? "is-agreed" : ""}`}>
            <div className="deal-price-block">
              <div><span>{stage >= 9 ? "NEGOTIATED UNIT PRICE" : "BEST LIVE OFFER"}</span><strong>{money.format(currentPrice)}</strong></div>
              <div className="price-delta"><ArrowDown size={15} /><strong>{stage >= 6 ? money.format(MSRP_UNIT - currentPrice) : "$0"}</strong><span>per unit</span></div>
            </div>
            <div className="deal-facts">
              <div><span>Quantity</span><strong>{stage >= 5 ? "12 units" : "forming"}</strong></div>
              <div><span>Fulfillment</span><strong>{stage >= 9 ? "7 days" : "open"}</strong></div>
              <div><span>Warranty</span><strong>{stage >= 9 ? "36 months" : "open"}</strong></div>
              <div><span>Seller</span><strong>{stage >= 9 ? "Signal" : "competing"}</strong></div>
            </div>
            <div className="deal-savings"><span>COALITION VALUE CREATED</span><strong>{stage >= 9 ? money.format(savings) : "—"}</strong><small>vs. independent public-market purchase</small></div>
          </section>
        </div>
      </section>

      <section className="authority-section" id="authority">
        <div className="authority-intro">
          <span className="eyebrow">02 / FUNDS + AUTHORITY</span>
          <h2>Fund the intent.<br /><em>Reserve the MSRP.</em></h2>
          <p>
            POOL admits a buyer only when their balance covers quantity × MSRP. Joining creates a reservation:
            that money remains theirs, but cannot be withdrawn or used elsewhere. A buyer may leave before the commitment cutoff;
            after an offer is accepted, the reservation stays frozen until settlement, cancellation, or reconciliation.
          </p>
          <div className="authority-rule"><CircleDollarSign size={17} /><span>deposit MSRP</span><ArrowRight size={14} /><strong>POOL reserves</strong><ArrowRight size={14} /><span>agents negotiate</span><ArrowRight size={14} /><strong>Rain executes</strong></div>
          <div className="custody-boundary"><ShieldCheck size={15} /><span><strong>Clear boundary:</strong> POOL balance and reservation are the product ledger. Rain is used only at execution; Rain is not presented as the custodial deposit account.</span></div>
        </div>

        <div className={`reservation-panel ${stage >= 1 ? "is-active" : ""}`}>
          <div className="panel-head"><div><LockKeyhole size={16} /><span>POOL BALANCE RESERVATIONS</span></div><span>MSRP COVERAGE REQUIRED</span></div>
          <div className="reservation-rules">
            <div><span>JOIN</span><strong>Balance ≥ MSRP</strong><small>or participation is denied</small></div>
            <ArrowRight size={14} />
            <div><span>ACTIVE</span><strong>MSRP is reserved</strong><small>no withdrawal or other spend</small></div>
            <ArrowRight size={14} />
            <div><span>SETTLE</span><strong>Capture deal price</strong><small>unlock the difference</small></div>
          </div>
          <div className="reservation-table">
            <div className="reservation-table-head"><span>Buyer</span><span>POOL balance</span><span>MSRP reserved</span><span>Deal captured</span><span>Unlocked</span></div>
            {buyers.map((buyer, index) => {
              const msrpReservation = buyer.quantity * MSRP_UNIT;
              const dealCapture = buyer.quantity * DEAL_UNIT;
              const unlocked = msrpReservation - dealCapture;
              return (
                <div className={`reservation-row ${stage >= index + 1 ? "is-reserved" : ""} ${stage >= 12 ? "is-settled" : ""}`} key={buyer.id}>
                  <span><i className={`mini-avatar avatar-${buyer.accent}`}>{buyer.initials}</i>{buyer.name}</span>
                  <span><strong>{money.format(msrpReservation)}</strong><small>deposited</small></span>
                  <span><strong>{money.format(msrpReservation)}</strong><small>{stage >= 12 ? "reservation reconciled" : "locked while active"}</small></span>
                  <span><strong>{money.format(dealCapture)}</strong><small>at settlement</small></span>
                  <span className="unlock-value"><strong>+{money.format(unlocked)}</strong><small>available again</small></span>
                </div>
              );
            })}
            <div className="reservation-total"><span>TOTAL · 12 UNITS</span><strong>{money.format(baseline)} reserved</strong><ArrowRight size={13} /><strong>{money.format(poolTotal)} captured</strong><strong className="unlock-value">+{money.format(savings)} available</strong></div>
          </div>
          <div className="leave-rule"><RefreshCcw size={13} /><span><strong>Before the commitment cutoff:</strong> leaving releases the full MSRP reservation. <strong>After offer acceptance:</strong> it stays frozen through settlement, cancellation, or reconciliation. Failed or partial execution never appears as released.</span></div>
        </div>

        <div className="mandate-panel">
          <div className="panel-head"><div><ShieldCheck size={16} /><span>PRIVATE MANDATE CLEARING</span></div><span>{stage >= 10 ? "3 / 3 pass" : "awaiting deal"}</span></div>
          <div className="mandate-table">
            <div className="table-head"><span>Buyer</span><span>Allocation</span><span>Hard max</span><span>Delivery</span><span>Decision</span></div>
            {buyers.map((buyer) => {
              const total = buyer.quantity * DEAL_UNIT;
              return (
                <div className="mandate-row" key={buyer.id}>
                  <span><i className={`mini-avatar avatar-${buyer.accent}`}>{buyer.initials}</i>{buyer.name}</span>
                  <span>{buyer.quantity} × ${DEAL_UNIT}</span>
                  <span className="sealed-value"><EyeOff size={12} /> SEALED</span>
                  <span>7d ≤ {buyer.deadline}d</span>
                  <span className={stage >= 10 ? "decision-pass" : "decision-wait"}>{stage >= 10 ? <><Check size={13} /> PASS · {money.format(total)}</> : "PENDING"}</span>
                </div>
              );
            })}
          </div>
          <div className={`attack-row ${stage >= 10 ? "is-visible" : ""}`}>
            <div><X size={15} /><span>AGENT REQUEST</span><strong>$529 / unit</strong></div>
            <div><LockKeyhole size={15} /><span>BUYER POLICY</span><strong>private maximum exceeded</strong></div>
            <div className="attack-result"><ShieldCheck size={16} /><span>PRE-FLIGHT</span><strong>BLOCKED</strong></div>
          </div>
        </div>

        <div className={`rain-panel ${stage >= 11 ? "is-ready" : ""}`}>
          <div className="rain-panel-head">
            <div><RainWordmark /><span>EXECUTION RAIL · AFTER POOL CLEARING</span></div>
            <span className="sandbox-outline">SANDBOX · NO REAL MONEY</span>
          </div>
          <div className="rain-boundary-note"><ShieldCheck size={14} /><span><strong>Rain does not hold the POOL balance or reservation.</strong> After the deal clears, POOL sends Rain only the negotiated, bounded execution terms shown below.</span></div>
          <div className="scope-grid">
            {buyers.map((buyer) => (
              <div className="scope-row" key={buyer.id}>
                <div><span>{buyer.name}</span><strong>{money.format(buyer.quantity * DEAL_UNIT)}</strong></div>
                <div className="scope-tags"><span><CircleDollarSign size={12} /> deal amount</span><span><Store size={12} /> MCC 5732</span><span><Clock3 size={12} /> 48h expiry</span></div>
                <div className="scope-state">{stage >= 11 ? <><Check size={14} /> READY</> : <><Clock3 size={14} /> WAITING</>}</div>
              </div>
            ))}
          </div>

          {stage >= 11 && stage < 12 && settlement.kind !== "running" && (
            <div className="rain-action-row">
              <div>
                <strong>{rainStatus?.connected && rainStatus.liveExecutionEnabled ? "Rain sandbox is ready" : "Rehearsal mode is ready"}</strong>
                <span>Three separate scoped cards · requested spend {money.format(poolTotal)} · idempotent execution</span>
              </div>
              <div className="rain-buttons">
                {rainStatus?.connected && rainStatus.liveExecutionEnabled && (
                  <button className="rain-button" onClick={executeRainSettlement}><RainWordmark /><span>Settle in sandbox</span><ArrowRight size={15} /></button>
                )}
                <button className="rehearsal-button" onClick={useRehearsal}>Run rehearsal</button>
              </div>
            </div>
          )}

          {settlement.kind === "running" && (
            <div className="payment-progress" aria-live="polite">
              <div className="payment-progress-copy"><div className="spinner" /><div><strong>Rain is executing bounded authority</strong><span>{paymentProgress < 28 ? "POOL reservations remain frozen · issuing scoped cards" : paymentProgress < 52 ? "Proving blocked merchant category" : paymentProgress < 76 ? "Authorizing buyer allocations" : "Settling transaction records"}</span></div><strong>{paymentProgress}%</strong></div>
              <div className="payment-progress-track"><span style={{ width: `${paymentProgress}%` }} /></div>
            </div>
          )}

          {settlement.kind === "failed" && (
            <div className="payment-error"><X size={17} /><div><strong>Live sandbox run did not complete</strong><span>{settlement.message} POOL reservations remain frozen for safe retry or reconciliation; no refund or simulated receipt is substituted.</span></div><button onClick={() => { setSettlement({ kind: "idle" }); setPaymentProgress(0); }}>Retry settlement</button></div>
          )}

          <div className="sandbox-disclosure">
            <LockKeyhole size={13} /> Hackathon sandbox: POOL’s deposit and reservation ledger is represented in the demo; Rain begins at execution. Three allocations use separate scoped cards under one provisioned Rain test cardholder. No PAN or CVC is stored or shown.
          </div>
        </div>
      </section>

      {stage >= 12 && (
        <section className={`outcome-section ${settlement.kind === "live" ? "is-live-outcome" : ""}`} id="outcome">
          <div className="outcome-topline"><span><StatusDot online />{outcomeMode}</span><span>POOL-2408-017 · CLOSED</span></div>
          <div className="outcome-main">
            <div className="outcome-title"><span>MARKET CLEARED</span><h2>MSRP secured the commitment.<br /><em>Only the deal price moved.</em></h2></div>
            <div className="outcome-number"><strong>{money.format(savings)}</strong><span>returned to available balances</span></div>
          </div>
          <div className="outcome-metrics">
            <div><span>MSRP RESERVED</span><strong>{money.format(baseline)}</strong></div>
            <div><span>DEAL CAPTURED</span><strong>{money.format(poolTotal)}</strong></div>
            <div><span>UNLOCKED</span><strong>{money.format(savings)}</strong></div>
            <div><span>PRICE IMPROVEMENT</span><strong>18.8%</strong></div>
          </div>

          <div className="receipts-panel">
            <div className="receipts-head"><div><ShieldCheck size={16} /><span>{settlement.kind === "live" ? "RAIN SANDBOX RECEIPTS" : "REHEARSAL RECEIPTS"}</span></div><span>{settlement.kind === "live" ? "provider-verified IDs" : "clearly simulated"}</span></div>
            <div className="receipt-grid">
              {buyers.map((buyer) => {
                const payment = livePayments.find((entry) => entry.buyerId === buyer.id);
                const captured = buyer.quantity * DEAL_UNIT;
                const unlocked = buyer.quantity * (MSRP_UNIT - DEAL_UNIT);
                return (
                  <div className="receipt-row" key={buyer.id}>
                    <div><i className={`mini-avatar avatar-${buyer.accent}`}>{buyer.initials}</i><span>{buyer.name}</span></div>
                    <span className="receipt-money"><strong>{money.format(captured)}</strong><small>+{money.format(unlocked)} available</small></span>
                    <span className="receipt-id">{payment ? `tx ${shortId(payment.transactionId)}` : "demo receipt"}</span>
                    <span className="receipt-status"><Check size={13} /> SETTLED</span>
                  </div>
                );
              })}
              <div className="receipt-row blocked-receipt">
                <div><ShieldCheck size={15} /><span>Safety challenge</span></div>
                <strong>MCC {settlement.kind === "live" ? settlement.result.guardrail?.merchantCategoryCode ?? "7995" : "7995"}</strong>
                <span className="receipt-id">{settlement.kind === "live" ? `tx ${shortId(settlement.result.guardrail?.transactionId)}` : "demo challenge"}</span>
                <span className="receipt-status is-blocked"><X size={13} /> {settlement.kind === "live" ? settlement.result.guardrail?.reason?.toUpperCase() ?? "BLOCKED" : "SIMULATED BLOCK"}</span>
              </div>
            </div>
          </div>

          <div className="outcome-footer">
            <div><span className="brand compact"><span className="brand-mark"><span /><span /><span /></span><span>POOL</span></span><strong>We didn’t build AI that shops.</strong><span>We built a market where demand organizes itself.</span></div>
            <button className="outcome-reset" onClick={resetDemo}><RefreshCcw size={15} /> Reset the market</button>
          </div>
        </section>
      )}

      <footer className="site-footer">
        <div><span className="brand compact"><span className="brand-mark"><span /><span /><span /></span><span>POOL</span></span><span>Autonomous collective purchasing for the agentic economy.</span></div>
        <div><span>Built for Raingentic Commerce Hackathon NYC</span><span>Rain sandbox · fictional merchants · deterministic demo</span></div>
      </footer>
    </main>
  );
}
