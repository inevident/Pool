"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CloudLightning,
  EyeOff,
  Fingerprint,
  Gavel,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Store,
  TerminalSquare,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { HERO_FUNDING } from "@/lib/funding";
import { BLOCKED_MCC, ELECTRONICS_MCC } from "@/lib/market/consumer";

type RainStatus = {
  configured: boolean;
  connected: boolean;
  environment: "sandbox" | "rehearsal";
  liveExecutionEnabled: boolean;
  accessRequired?: boolean;
  accessUnlocked?: boolean;
  message?: string;
};

type DemoAccessState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "authorized"; message: string }
  | { kind: "error"; message: string };

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
  monad?: {
    status?: "attested" | "attestation_pending" | "not_configured";
    commitmentId?: string;
    rainSettlementHash?: string;
    replayed?: boolean;
    message?: string;
    transaction?: {
      hash?: string;
      explorerUrl?: string;
    } | null;
  };
  message?: string;
  code?: string;
};

type SettlementState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "live"; result: RainResult }
  | { kind: "rehearsal" }
  | { kind: "failed"; message: string };

type TraceLine = {
  label: string;
  detail: string;
  status: "complete" | "blocked" | "info";
};

type ConsoleResult = {
  kind: "idle" | "running" | "complete" | "failed";
  verdict?: "passed" | "blocked";
  mode?: string;
  title?: string;
  detail?: string;
  trace?: TraceLine[];
};

type MonadStatus = {
  status?: string;
  mode?: string;
  state?: string;
  confirmation?: string;
  message?: string;
  configured?: boolean;
  environment?: string;
  chainName?: string;
  chainId?: number | string;
  explorerUrl?: string;
  contractAddress?: string;
  registryAddress?: string | null;
  registryExplorerUrl?: string | null;
  commitmentId?: string | null;
  network?: {
    name?: string;
    chainId?: number | string;
    explorerUrl?: string;
  };
  localProof?: {
    termsHash?: string;
    fundingRoot?: string;
  };
  onchainProof?: {
    termsHash?: string;
    rainSettlementHash?: string | null;
  };
  commitment?: {
    id?: string;
    hash?: string;
    termsHash?: string;
    txHash?: string;
    status?: string;
  };
  settlement?: {
    txHash?: string;
    hash?: string;
    explorerUrl?: string;
    status?: string;
  };
  transactions?: {
    commitment?: {
      hash?: string;
      explorerUrl?: string;
    } | null;
  };
};

type MonadPreparationState = "idle" | "running" | "ready" | "local" | "failed";

const MSRP_UNIT = HERO_FUNDING.msrpUnitCents / 100;
const DEAL_UNIT = HERO_FUNDING.dealUnitCents / 100;
const FIXTURE_TOTAL_UNITS = HERO_FUNDING.summary.buyers.reduce(
  (total, buyer) => total + buyer.quantity,
  0,
);
const FIXTURE_CAPTURE_COUNT = HERO_FUNDING.summary.buyers.length;
const FIXTURE_BASELINE = HERO_FUNDING.summary.totalReservedCents / 100;
const FIXTURE_CAPTURE_TOTAL = HERO_FUNDING.summary.totalCapturedCents / 100;
const FIXTURE_SAVINGS = HERO_FUNDING.summary.totalReleasedCents / 100;

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
  { stage: 5, time: "00:09", label: "12 units and $5,748 freeze before any seller sees the RFP", tone: "success" },
  { stage: 6, time: "00:12", label: "Funded terms are committed; Monad Testnet timestamps them when configured", tone: "monad" },
  { stage: 7, time: "00:16", label: "Only now do three merchant agents receive the anonymized RFP", tone: "neutral" },
  { stage: 8, time: "00:21", label: "Market opens at $401; coalition counters at $383", tone: "accent" },
  { stage: 9, time: "00:24", label: "Signal clears at $389 against the already-frozen commitment", tone: "success" },
  { stage: 10, time: "00:27", label: "$4,668 clears for capture; $1,080 releases only after settlement", tone: "success" },
  { stage: 11, time: "00:30", label: "Rain receives scoped authority only after POOL clearing", tone: "rain" },
] as const;

const stageCopy = [
  { eyebrow: "PREFUNDED MARKET", title: "Participation starts with the MSRP on balance." },
  { eyebrow: "RESERVATION 01 / 03", title: "Harbor joins. Its full MSRP becomes reserved." },
  { eyebrow: "RESERVATION 02 / 03", title: "Patchwork locks its buying commitment." },
  { eyebrow: "RESERVATION 03 / 03", title: "Every unit is now covered before negotiation." },
  { eyebrow: "CONSTRAINT CHECK", title: "Similarity is not permission." },
  { eyebrow: "PRE-BID FREEZE", title: "The coalition commits before sellers can price it." },
  { eyebrow: "MONAD COMMITMENT", title: "POOL’s funded-demand claim gets a tamper-evident timestamp." },
  { eyebrow: "SELLER MARKET OPEN", title: "Only committed demand reaches the merchant market." },
  { eyebrow: "REVERSE AUCTION", title: "Competition converts committed quantity into leverage." },
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function textValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function traceFrom(value: unknown, fallback: TraceLine[]): TraceLine[] {
  if (!Array.isArray(value)) return fallback;
  const lines = value.flatMap((entry): TraceLine[] => {
    if (typeof entry === "string") return [{ label: "agent", detail: entry, status: "info" }];
    const item = asRecord(entry);
    const label = textValue(item.tool ?? item.action ?? item.name ?? item.label ?? item.stage, "agent");
    const detail = textValue(item.detail ?? item.output ?? item.result ?? item.reason, "completed");
    const rawStatus = textValue(item.status, "complete").toLowerCase();
    const status = rawStatus.includes("block") || rawStatus.includes("reject") ? "blocked" : rawStatus.includes("complete") || rawStatus.includes("pass") || rawStatus.includes("success") ? "complete" : "info";
    return [{ label, detail, status }];
  });
  return lines.length > 0 ? lines.slice(0, 5) : fallback;
}

function safeExplorerHref(base: string | undefined, txHash: string | undefined) {
  if (!base || !txHash) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return undefined;
    return `${url.href.replace(/\/$/, "")}/tx/${encodeURIComponent(txHash)}`;
  } catch {
    return undefined;
  }
}

function safeHttpsHref(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function RainWordmark() {
  return <span className="rain-wordmark" aria-label="Rain">rain</span>;
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={`status-dot ${online ? "is-online" : ""}`} aria-hidden="true" />;
}

function ConsoleOutput({ state, empty }: { state: ConsoleResult; empty: string }) {
  if (state.kind === "idle") {
    return <div className="console-empty"><TerminalSquare size={15} /><span>{empty}</span></div>;
  }
  if (state.kind === "running") {
    return <div className="console-empty is-running" aria-live="polite"><span className="mini-spinner" /><span>Calling the runtime and recording tool decisions…</span></div>;
  }
  if (state.kind === "failed") {
    return <div className="console-empty is-failed" role="alert"><X size={15} /><span>{state.detail ?? "This test did not complete."}</span></div>;
  }
  const blocked = state.verdict === "blocked";
  return (
    <div className={`console-result${blocked ? " is-blocked" : ""}`} aria-live="polite">
      <div className="console-result-head">
        <div>{blocked ? <X size={14} /> : <Check size={14} />}<strong>{state.title}</strong></div>
        <span>{state.mode ?? "policy runtime"}</span>
      </div>
      {state.detail ? <p>{state.detail}</p> : null}
      <div className="tool-trace">
        {(state.trace ?? []).map((line, index) => (
          <div className={`tool-line is-${line.status}`} key={`${line.label}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{line.label}</strong>
            <p>{line.detail}</p>
            {line.status === "blocked" ? <X size={12} /> : line.status === "complete" ? <Check size={12} /> : <ChevronRight size={12} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DemoExperience() {
  const [stage, setStage] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [rainStatus, setRainStatus] = useState<RainStatus | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [demoAccess, setDemoAccess] = useState<DemoAccessState>({ kind: "idle" });
  const [monadStatus, setMonadStatus] = useState<MonadStatus | null>(null);
  const [monadPreparation, setMonadPreparation] = useState<MonadPreparationState>("idle");
  const [intent, setIntent] = useState('I need 2 color-accurate 27" 4K USB-C monitors under $430 each within 10 days.');
  const [intentResult, setIntentResult] = useState<ConsoleResult>({ kind: "idle" });
  const [merchantPrice, setMerchantPrice] = useState("389");
  const [merchantDelivery, setMerchantDelivery] = useState("7");
  const [bidResult, setBidResult] = useState<ConsoleResult>({ kind: "idle" });
  const [settlement, setSettlement] = useState<SettlementState>({ kind: "idle" });
  const [paymentProgress, setPaymentProgress] = useState(0);
  const eventStreamRef = useRef<HTMLDivElement>(null);

  const round = merchantRound(stage);
  const currentPrice = stage >= 9 ? DEAL_UNIT : stage >= 7 ? 401 : MSRP_UNIT;
  const visibleEvents = timeline.filter((event) => event.stage <= stage);
  const savings = FIXTURE_SAVINGS;
  const baseline = FIXTURE_BASELINE;
  const poolTotal = FIXTURE_CAPTURE_TOTAL;
  const totalUnits = FIXTURE_TOTAL_UNITS;
  const reservedUnits = buyers
    .slice(0, Math.min(stage, buyers.length))
    .reduce((total, buyer) => total + buyer.quantity, 0);
  const activeReservation = stage >= 12 ? 0 : reservedUnits * MSRP_UNIT;
  const currentCopy = stageCopy[Math.min(stage, stageCopy.length - 1)];
  const marketIsPlaying = autoplay && stage < 11;

  async function refreshMonadStatus(signal?: AbortSignal) {
    try {
      const response = await fetch("/api/monad/status", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Monad status unavailable");
      const body = await response.json() as MonadStatus;
      setMonadStatus((current) => ({
        ...body,
        transactions: body.transactions ?? current?.transactions,
        settlement: body.settlement ?? current?.settlement,
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMonadStatus({ configured: false, environment: "local-proof" });
    }
  }

  const prepareMonadCommitment = useCallback(async () => {
    setMonadPreparation("running");
    try {
      const response = await fetch("/api/monad/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pool-Agent-Action": "prepare-monad",
        },
        body: JSON.stringify({
          scenarioVersion: "monitor-pool-v1",
          confirmation: "prepare-monad-testnet",
        }),
      });
      const body = (await response.json()) as MonadStatus;
      setMonadStatus((current) => ({
        ...current,
        ...body,
        network: { ...current?.network, ...body.network },
        localProof: body.localProof ?? current?.localProof,
      }));
      if (!response.ok) throw new Error(body.message ?? "Monad preparation failed");
      setMonadPreparation(body.status === "prepared" ? "ready" : "local");
      return true;
    } catch {
      setMonadPreparation("failed");
      return false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
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
        }),
      fetch("/api/monad/status", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Monad status unavailable");
          setMonadStatus((await response.json()) as MonadStatus);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMonadStatus({ configured: false, environment: "local-proof" });
        }),
    ]);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoplay || stage === 0 || stage >= 11) {
      return;
    }
    if (stage === 5) {
      const timeout = window.setTimeout(() => {
        void prepareMonadCommitment().then((prepared) => {
          if (prepared) {
            setStage(6);
          } else {
            setAutoplay(false);
          }
        });
      }, timings[stage] ?? 1100);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(
      () => setStage((current) => Math.min(current + 1, 11)),
      timings[stage] ?? 1100,
    );
    return () => window.clearTimeout(timeout);
  }, [autoplay, prepareMonadCommitment, stage]);

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
    if (monadPreparation === "running") return "Finalizing commitment proof";
    if (monadPreparation === "failed") return "Commitment proof blocked";
    if (stage === 0) return "Waiting for demand";
    if (stage <= 3) return "Reserving MSRP";
    if (stage === 4) return "Protecting hard constraints";
    if (stage === 5) return "Membership frozen";
    if (stage === 6) return "Anchoring commitment";
    if (stage <= 8) return "Merchants competing";
    if (stage === 9) return "Deal agreed";
    if (stage === 10) return "Capture amounts cleared";
    if (settlement.kind === "running") return "Rain authorizing";
    if (stage >= 12) return "Pool settled";
    return "Ready to transact";
  }, [monadPreparation, settlement.kind, stage]);

  function launchDemo() {
    setSettlement({ kind: "idle" });
    setPaymentProgress(0);
    setStage(1);
    setAutoplay(true);
  }

  async function stepManually() {
    setAutoplay(false);
    if (stage === 5) {
      if (await prepareMonadCommitment()) setStage(6);
      return;
    }
    setStage((current) => current === 0 ? 1 : Math.min(current + 1, 11));
  }

  function resetDemo() {
    setStage(0);
    setAutoplay(false);
    setSettlement({ kind: "idle" });
    setPaymentProgress(0);
    setMonadPreparation("idle");
  }

  async function unlockDemoExecution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = accessCode.trim();
    if (!code) {
      setDemoAccess({ kind: "error", message: "Enter the private demo access code." });
      return;
    }

    setDemoAccess({ kind: "submitting" });
    try {
      const sessionResponse = await fetch("/api/demo/session", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });
      const sessionBody = await sessionResponse.json() as { message?: string };
      if (!sessionResponse.ok) {
        throw new Error(sessionBody.message ?? "Demo access was not accepted.");
      }

      const rainReadiness = fetch("/api/rain/status", {
        cache: "no-store",
        credentials: "same-origin",
      }).then(async (response) => {
        const body = await response.json() as RainStatus;
        setRainStatus(body);
        return body;
      });
      const [nextRainStatus] = await Promise.all([
        rainReadiness,
        refreshMonadStatus(),
      ]);

      if (nextRainStatus.accessRequired) {
        throw new Error("The session cookie could not be verified. Please try the code again.");
      }

      setAccessCode("");
      setDemoAccess({
        kind: "authorized",
        message: nextRainStatus.liveExecutionEnabled
          ? "Access confirmed. Rain sandbox settlement is ready."
          : "Access confirmed. Rain is still in rehearsal mode; check its connection status.",
      });
    } catch (error) {
      setDemoAccess({
        kind: "error",
        message: error instanceof Error ? error.message : "Demo access could not be verified.",
      });
    }
  }

  async function runBuyerAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanIntent = intent.trim();
    if (!cleanIntent) return;
    setIntentResult({ kind: "running" });
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pool-Agent-Action": "interpret-buyer-intent",
        },
        body: JSON.stringify({ intent: cleanIntent }),
      });
      const payload = asRecord(await response.json());
      if (!response.ok) throw new Error(textValue(payload.message ?? payload.error, "Agent route unavailable"));
      const normalized = asRecord(payload.normalized ?? payload.intent ?? payload.parsedIntent);
      const policyDecision = asRecord(payload.decision);
      const quantityValue = normalized.quantity ?? payload.quantity;
      const quantity = typeof quantityValue === "number" && Number.isInteger(quantityValue)
        ? quantityValue
        : null;
      const deadlineValue = normalized.deadlineDays ?? normalized.deliveryDays ?? payload.deadlineDays;
      const deadline = typeof deadlineValue === "number" && Number.isFinite(deadlineValue)
        ? deadlineValue
        : null;
      const requiredDepositCents = typeof policyDecision.requiredDepositCents === "number"
        ? policyDecision.requiredDepositCents
        : null;
      const clarification = textValue(normalized.clarification);
      const decision = textValue(payload.status, "runtime_result");
      const mode = textValue(payload.mode ?? payload.provider, "runtime result");
      const details = [
        clarification,
        deadline !== null ? `Normalized deadline: ${deadline} days.` : "",
        requiredDepositCents !== null
          ? `Required MSRP coverage: ${money.format(requiredDepositCents / 100)}. No funds were moved.`
          : "",
      ].filter(Boolean);
      setIntentResult({
        kind: "complete",
        verdict: decision === "needs_clarification" || policyDecision.eligibleForPool === false
          ? "blocked"
          : "passed",
        mode,
        title: quantity === null
          ? decision.replace(/_/g, " ")
          : `${decision.replace(/_/g, " ")} · ${quantity} unit${quantity === 1 ? "" : "s"}`,
        detail: `${details.join(" ") || "The runtime returned no additional decision detail."} This test does not mutate the fixed ${totalUnits}-unit Rain evidence run.`,
        trace: traceFrom(payload.trace ?? payload.toolTrace, []),
      });
    } catch (error) {
      setIntentResult({
        kind: "failed",
        mode: "runtime unavailable",
        detail: error instanceof Error
          ? error.message
          : "The buyer agent request failed before a verifiable result was returned. No decision was made.",
      });
    }
  }

  async function evaluateMerchantBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage < 7) return;
    const unitPrice = Number(merchantPrice);
    const deliveryDays = Number(merchantDelivery);
    if (!Number.isFinite(unitPrice) || !Number.isFinite(deliveryDays)) return;
    setBidResult({ kind: "running" });
    try {
      const response = await fetch("/api/merchant/bid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pool-Agent-Action": "evaluate-merchant-bid",
        },
        body: JSON.stringify({
          merchantId: "merchant-signal",
          unitPriceCents: Math.round(unitPrice * 100),
          deliveryDays: Math.round(deliveryDays),
          warrantyMonths: 36,
          rfpVersion: 2,
        }),
      });
      const payload = asRecord(await response.json());
      if (!response.ok) throw new Error(textValue(payload.message ?? payload.error, "Bid route unavailable"));
      const decision = textValue(payload.status, payload.accepted === true ? "accepted" : "evaluated");
      setBidResult({
        kind: "complete",
        mode: textValue(payload.mode, "deterministic policy"),
        title: `${decision.replace(/_/g, " ")} · ${money.format(unitPrice)}/unit`,
        detail: textValue(payload.reason ?? payload.message, "Evaluated against the already-frozen coalition mandate without revealing buyer ceilings."),
        trace: traceFrom(payload.trace ?? payload.toolTrace, [
          { label: "verify_commitment", detail: "Coalition commitment must predate this offer", status: "complete" },
          { label: "clear_mandates", detail: "Price, delivery, warranty, and inventory checked", status: "complete" },
        ]),
      });
    } catch (error) {
      setBidResult({
        kind: "failed",
        mode: "runtime unavailable",
        detail: error instanceof Error
          ? error.message
          : "The merchant runtime could not verify this bid. Nothing was admitted or written on-chain.",
      });
    }
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
      if (result.monad?.status === "attested") {
        setMonadStatus((current) => ({
          ...current,
          mode: "monad-testnet",
          state: "rain-settlement-attested",
          commitmentId: result.monad?.commitmentId ?? current?.commitmentId,
          settlement: {
            txHash: result.monad?.transaction?.hash,
            explorerUrl: result.monad?.transaction?.explorerUrl,
            status: "finalized",
          },
          onchainProof: {
            ...current?.onchainProof,
            rainSettlementHash: result.monad?.rainSettlementHash ?? null,
          },
        }));
      }
      void refreshMonadStatus();
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
  const monadChainName = monadStatus?.chainName ?? monadStatus?.network?.name;
  const monadChainId = monadStatus?.chainId ?? monadStatus?.network?.chainId;
  const monadExplorerUrl = monadStatus?.explorerUrl ?? monadStatus?.network?.explorerUrl;
  const monadContractAddress = monadStatus?.contractAddress ?? monadStatus?.registryAddress;
  const monadCommitmentId = monadStatus?.commitment?.id ?? monadStatus?.commitmentId;
  const monadCommitmentHash = monadStatus?.commitment?.hash ?? monadStatus?.commitment?.termsHash ?? monadStatus?.onchainProof?.termsHash ?? monadStatus?.localProof?.termsHash;
  const commitmentTx = monadStatus?.commitment?.txHash ?? monadStatus?.transactions?.commitment?.hash;
  const settlementTx = monadStatus?.settlement?.txHash ?? monadStatus?.settlement?.hash;
  const registryHref = safeHttpsHref(monadStatus?.registryExplorerUrl ?? undefined);
  const commitmentHref = safeHttpsHref(monadStatus?.transactions?.commitment?.explorerUrl) ?? safeExplorerHref(monadExplorerUrl, commitmentTx);
  const settlementHref = safeHttpsHref(monadStatus?.settlement?.explorerUrl) ?? safeExplorerHref(monadExplorerUrl, settlementTx);
  const monadIsConfigured = Boolean(monadContractAddress) || monadStatus?.mode === "monad-testnet";
  const monadHasFinalizedCommitment = Boolean(monadCommitmentId) && (monadStatus?.confirmation === "finalized" || monadStatus?.confirmation === "finalized-state");
  const commitmentProofHref = commitmentHref ?? (monadHasFinalizedCommitment ? registryHref : undefined);
  const monadCommitmentIsOnchain = Boolean(commitmentTx) || monadHasFinalizedCommitment;
  const monadLabel = commitmentTx
    ? `${monadChainName ?? "Monad testnet"} · on-chain`
    : monadHasFinalizedCommitment
      ? `${monadChainName ?? "Monad testnet"} · finalized state`
    : monadIsConfigured
      ? `${monadChainName ?? "Monad testnet"} · ready`
      : monadPreparation === "running"
        ? "deriving commitment…"
        : monadPreparation === "failed"
          ? "proof blocked · sellers held"
      : "local proof only · not on-chain";
  const outcomeMonad = settlement.kind === "live" ? settlement.result.monad : undefined;
  const outcomeMonadStatus = outcomeMonad?.status ?? "not_configured";
  const outcomeMonadTx = outcomeMonad?.transaction?.hash ?? settlementTx;
  const outcomeMonadReplay = outcomeMonadStatus === "attested" && outcomeMonad?.replayed === true && !outcomeMonad?.transaction;
  const outcomeMonadHref = safeHttpsHref(outcomeMonad?.transaction?.explorerUrl) ?? settlementHref ?? commitmentProofHref;
  const outcomeMonadTitle = outcomeMonadReplay
    ? "Finalized state · idempotent replay verified"
    : outcomeMonadStatus === "attested"
    ? "Rain settlement digest timestamped on Monad Testnet"
    : outcomeMonadStatus === "attestation_pending"
      ? "Rain settled; Monad attestation is pending"
      : settlement.kind === "live"
        ? "Rain settled with a local commitment proof"
        : "Local commitment proof · no on-chain claim";
  const outcomeMonadDetail = outcomeMonadReplay
    ? "The registry already contained the same settlement digest; finalized state was verified without submitting a duplicate transaction."
    : outcomeMonad?.message ?? (outcomeMonadStatus === "attested"
    ? "The finalized registry transaction binds POOL’s Rain settlement digest to its pre-bid commitment."
    : outcomeMonadStatus === "attestation_pending"
      ? "The Rain receipts are final; POOL is not claiming an on-chain settlement timestamp until confirmation completes."
      : "Monad testnet signing is not configured, so this run does not claim an on-chain transaction.");
  const rainSummaryState = rainStatus?.connected && rainStatus.liveExecutionEnabled
    ? "Sandbox execution ready"
    : rainStatus?.accessRequired
      ? "Sandbox execution locked"
      : "Fixed sandbox evidence";
  const monadSummaryState = outcomeMonadStatus === "attested"
    ? "Settlement attested"
    : outcomeMonadStatus === "attestation_pending"
      ? "Attestation pending"
      : monadCommitmentIsOnchain
        ? "Commitment finalized"
        : monadIsConfigured
          ? "Testnet ready"
          : "Local proof only";
  const monadSummaryDetail = monadCommitmentIsOnchain
    ? `${monadChainName ?? "Monad Testnet"} · ${shortId(commitmentTx ?? monadCommitmentId ?? undefined)}`
    : monadIsConfigured
      ? `${monadChainName ?? "Monad Testnet"} · awaiting commitment`
      : "No testnet transaction claimed";

  return (
    <main className={`app-shell stage-${stage}`}>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="POOL product home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>POOL</span>
        </Link>
        <nav className="topnav" aria-label="Product navigation">
          <Link href="/">Product workspace</Link>
          <Link href="/merchant">Seller pilot</Link>
          <Link href="/evidence">Evidence registry</Link>
          <a href="#market">Evidence replay</a>
          <a href="#authority">Funds & authority</a>
          <a href="#outcome">Outcome</a>
        </nav>
        <div className="topbar-status">
          <div className="sandbox-badge" title="No real money moves in the Rain hackathon sandbox">
            <StatusDot online={Boolean(rainStatus?.connected)} />
            <RainWordmark />
            <span>{rainStatus?.accessRequired ? "sandbox locked" : rainStatus?.connected ? "sandbox connected" : "rehearsal ready"}</span>
          </div>
          <button className="icon-button" onClick={resetDemo} aria-label="Reset demo" title="Reset demo">
            <RefreshCcw size={15} />
          </button>
        </div>
      </header>

      {rainStatus?.accessRequired ? (
        <aside className="demo-access" aria-labelledby="demo-access-title">
          <div className="demo-access-card">
            <div className="demo-access-copy">
              <span className="demo-access-icon" aria-hidden="true"><LockKeyhole size={16} /></span>
              <div>
                <span className="demo-access-kicker">JUDGE ACCESS · SANDBOX RAIL PROTECTED</span>
                <strong id="demo-access-title">Unlock Rain sandbox execution</strong>
                <p id="demo-access-help">Enter the private demo code. Rehearsal mode remains available without it.</p>
              </div>
            </div>
            <form className="demo-access-form" onSubmit={unlockDemoExecution} aria-busy={demoAccess.kind === "submitting"}>
              <label htmlFor="demo-access-code">Demo access code</label>
              <div className="demo-access-control">
                <input
                  id="demo-access-code"
                  name="accessCode"
                  type="password"
                  value={accessCode}
                  onChange={(event) => {
                    setAccessCode(event.target.value);
                    if (demoAccess.kind === "error") setDemoAccess({ kind: "idle" });
                  }}
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={demoAccess.kind === "submitting"}
                  aria-describedby={`demo-access-help${demoAccess.kind === "error" ? " demo-access-error" : ""}`}
                  aria-invalid={demoAccess.kind === "error"}
                  placeholder="Private access code"
                />
                <button type="submit" disabled={demoAccess.kind === "submitting" || accessCode.trim().length === 0}>
                  {demoAccess.kind === "submitting" ? <span className="demo-access-spinner" aria-hidden="true" /> : <LockKeyhole size={13} />}
                  {demoAccess.kind === "submitting" ? "Verifying…" : "Unlock"}
                </button>
              </div>
              {demoAccess.kind === "error" ? <p className="demo-access-error" id="demo-access-error" role="alert">{demoAccess.message}</p> : null}
            </form>
          </div>
        </aside>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {demoAccess.kind === "submitting" ? "Verifying demo access." : demoAccess.kind === "authorized" ? demoAccess.message : ""}
      </p>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="section-label"><span>FIXED TECHNICAL EVIDENCE FIXTURE</span><span>01 / JUDGE REPLAY</span></div>
          <div className="fixture-notice">
            <Fingerprint size={14} aria-hidden="true" />
            <span>Repeatable scenario · fictional organizations · no real money</span>
          </div>
          <h1>{totalUnits} prefunded units.<br /><em>{money.format(savings)} stays with buyers.</em></h1>
          <p>
            This page is the fixed, auditable technical fixture for the Rain + Monad proof path—not the repeat-use consumer app.
            Three buyers reserve MSRP, sellers compete, and only the cleared price can move. <Link href="/">Open the product workspace <ArrowRight size={13} /></Link>
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={stage === 0 ? launchDemo : () => setAutoplay((value) => !value)} disabled={stage >= 11}>
              {stage === 0 ? <Play size={15} fill="currentColor" /> : marketIsPlaying ? <Pause size={15} fill="currentColor" /> : stage >= 11 ? <Check size={15} /> : <Play size={15} fill="currentColor" />}
              {stage === 0 ? "Replay the fixed market" : marketIsPlaying ? "Pause replay" : stage >= 11 ? "Market cleared" : "Resume replay"}
            </button>
            <button className="text-button" onClick={() => void stepManually()} disabled={stage >= 11 || monadPreparation === "running"}>
              Step manually <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="hero-evidence-stack">
          <aside className="proof-summary" aria-labelledby="proof-summary-title">
            <div className="proof-summary-head">
              <div><Sparkles size={15} aria-hidden="true" /><span id="proof-summary-title">THE 90-SECOND PROOF</span></div>
              <span>fixed fixture</span>
            </div>
            <div className="proof-summary-fixture-note"><Fingerprint size={12} aria-hidden="true" /> Technical evidence fixture · no real money · separate from the repeat-use product</div>
            <div className="proof-summary-grid">
              <div className="proof-summary-stat is-demand">
                <span>Prefunded demand</span>
                <strong>{totalUnits} units</strong>
                <small>{money.format(baseline)} MSRP reserved before bidding</small>
              </div>
              <div className="proof-summary-stat is-outcome">
                <span>Buyer savings</span>
                <strong>{money.format(savings)}</strong>
                <small>{money.format(MSRP_UNIT)} → {money.format(DEAL_UNIT)} per unit</small>
              </div>
              <div className="proof-summary-stat is-rain">
                <span>Rain bounded captures</span>
                <strong>{FIXTURE_CAPTURE_COUNT} captures</strong>
                <small>{rainSummaryState}</small>
                <Link href="/evidence">
                  Verified evidence registry <Link2 size={10} aria-hidden="true" />
                </Link>
              </div>
              <div className="proof-summary-stat is-monad">
                <span>Monad commitment / attestation</span>
                <strong>{monadSummaryState}</strong>
                <small>{monadSummaryDetail}</small>
              </div>
            </div>
            <div className="sponsor-proof-row">
              <div className="guardrail-proof">
                <ShieldCheck size={17} aria-hidden="true" />
                <div><span>RAIN GUARDRAIL CHALLENGE</span><strong>MCC {BLOCKED_MCC} BLOCKED</strong><small>off-policy spend cannot pass the scoped card</small></div>
              </div>
              <div className="monad-evidence-proof">
                <Fingerprint size={17} aria-hidden="true" />
                <div><span>MONAD EVIDENCE STATE</span><strong>{monadSummaryState}</strong><small>{monadSummaryDetail}</small></div>
                {commitmentProofHref ? (
                  <a href={commitmentProofHref} target="_blank" rel="noopener noreferrer" aria-label="Open Monad commitment evidence">
                    Explorer <Link2 size={12} />
                  </a>
                ) : <span className="proof-state-pill">Evidence only</span>}
              </div>
            </div>
          </aside>

          <details className="fixture-ledger-disclosure">
            <summary>
              <span><CircleDollarSign size={14} aria-hidden="true" /> View fixture funding ledger</span>
              <span>{money.format(baseline)} reserved · {money.format(poolTotal)} captured <ChevronRight className="disclosure-chevron" size={14} aria-hidden="true" /></span>
            </summary>
            <div className="hero-ledger" aria-label="Fixed fixture funding ledger">
              <div className="ledger-head">
                <span>FIXTURE FUNDING LEDGER</span>
                <span className="live-chip"><StatusDot online={stage > 0} />{marketState}</span>
              </div>
              <div className="product-line">
                <div className="product-glyph" aria-hidden="true"><span /></div>
                <div>
                  <strong>27” 4K USB-C displays</strong>
                  <span>{totalUnits}-unit group buy · MSRP {money.format(MSRP_UNIT)} each · New York</span>
                </div>
              </div>
              <div className="hero-metrics">
                <div><span>MSRP requirement</span><strong>{money.format(MSRP_UNIT)}<small>/unit</small></strong></div>
                <div><span>POOL balances</span><strong>{money.format(baseline)}<small>deposited</small></strong></div>
                <div><span>Active reservation</span><strong>{money.format(activeReservation)}<small>{stage >= 12 ? "released" : "locked"}</small></strong></div>
              </div>
              <div className="funding-rail" aria-label="POOL funding lifecycle">
                <div className="funding-step is-active"><span>01 · DEPOSIT</span><strong>{money.format(baseline)}</strong><small>across {FIXTURE_CAPTURE_COUNT} POOL balances</small></div>
                <ArrowRight size={14} />
                <div className={`funding-step ${stage >= 1 ? "is-active" : ""}`}><span>02 · JOIN</span><strong>Reserve MSRP</strong><small>unavailable while active</small></div>
                <ArrowRight size={14} />
                <div className={`funding-step ${stage >= 9 ? "is-active" : ""}`}><span>03 · SETTLE</span><strong>{money.format(poolTotal)} captured</strong><small>{money.format(savings)} unlocks</small></div>
              </div>
              <div className="funding-exit-rule"><LockKeyhole size={12} /><span>Leave while the pool recruits → full release. Before the RFP opens, membership and MSRP reservations freeze through settlement, cancellation, or reconciliation.</span></div>
              <div className="hero-ticker"><span>POOL-2408-017</span><span>{currentCopy.eyebrow}</span><span>NYC / USD</span></div>
            </div>
          </details>
        </div>
      </section>

      <section className="judge-console" id="judge-console" aria-labelledby="judge-console-title">
        <details className="judge-console-disclosure">
          <summary>
            <div className="judge-console-summary-copy">
              <span className="eyebrow">OPTIONAL DEEP DIVE</span>
              <h2 id="judge-console-title">Open the technical inspector</h2>
              <p>Run both agents, inspect policy traces, and verify the complete Monad ordering proof.</p>
            </div>
            <span className="judge-console-summary-action">3 evidence panels · expand <ChevronRight className="disclosure-chevron" size={16} aria-hidden="true" /></span>
          </summary>
          <div className="judge-console-body">
            <div className="judge-console-head">
              <div>
                <span className="eyebrow">00 / RUNTIME CONTROLS</span>
                <h3>Test the agents.<br /><em>Inspect every boundary.</em></h3>
              </div>
              <p>
                These controls exercise the runtime APIs without rewriting the fixed, auditable Rain sandbox scenario below.
                Every result names whether it came from AI, deterministic policy, testnet, or a local rehearsal.
              </p>
            </div>

            <div className="judge-console-grid">
              <article className="console-card agent-console-card">
                <div className="console-card-head">
                  <div><Bot size={16} /><span>BUYER INTENT AGENT</span></div>
                  <span>natural language → mandate</span>
                </div>
                <form className="console-form" onSubmit={runBuyerAgent}>
                  <label htmlFor="buyer-intent">Try your own purchase intent</label>
                  <textarea
                    id="buyer-intent"
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    maxLength={500}
                    rows={3}
                    aria-describedby="buyer-intent-help"
                  />
                  <div className="console-form-footer">
                    <small id="buyer-intent-help">No account or money movement · maximum 500 characters</small>
                    <button className="console-submit" type="submit" disabled={intentResult.kind === "running" || intent.trim().length === 0}>
                      {intentResult.kind === "running" ? <span className="mini-spinner" /> : <Bot size={14} />}
                      {intentResult.kind === "running" ? "Running…" : "Run buyer agent"}
                    </button>
                  </div>
                </form>
                <ConsoleOutput state={intentResult} empty="Run an intent to see normalization, catalog matching, and the funding gate." />
              </article>

              <article className="console-card merchant-console-card">
                <div className="console-card-head">
                  <div><Gavel size={16} /><span>MERCHANT BID AGENT</span></div>
                  <span>offer → mandate clearing</span>
                </div>
                <form className="bid-form" onSubmit={evaluateMerchantBid}>
                  <label>
                    <span>Unit price</span>
                    <span className="input-shell"><i>$</i><input type="number" min="1" max="999" step="1" value={merchantPrice} onChange={(event) => setMerchantPrice(event.target.value)} aria-label="Merchant unit price in dollars" /></span>
                  </label>
                  <label>
                    <span>Delivery</span>
                    <span className="input-shell"><input type="number" min="1" max="90" step="1" value={merchantDelivery} onChange={(event) => setMerchantDelivery(event.target.value)} aria-label="Merchant delivery days" /><i>days</i></span>
                  </label>
                  <button className="console-submit" type="submit" disabled={stage < 7 || bidResult.kind === "running"}>
                    {bidResult.kind === "running" ? <span className="mini-spinner" /> : stage < 7 ? <LockKeyhole size={14} /> : <Gavel size={14} />}
                    {bidResult.kind === "running" ? "Evaluating…" : stage < 7 ? "Replay market to open committed RFP" : "Submit test bid"}
                  </button>
                </form>
                <div className="bid-disclosure"><EyeOff size={12} /> The merchant sees quantity and public requirements—never private buyer maximums.</div>
                <ConsoleOutput state={bidResult} empty="Submit an offer to test price, delivery, warranty, and commitment rules." />
              </article>

              <article className="console-card proof-console-card">
                <div className="console-card-head">
                  <div><Link2 size={16} /><span>COMMITMENT PROOF</span></div>
                  <span className={commitmentProofHref ? "proof-live" : ""}>{monadLabel}</span>
                </div>
                <div className="proof-order" aria-label="Required transaction ordering">
                  <div className="proof-step is-complete"><span>01</span><strong>{money.format(baseline)} funded</strong><small>MSRP verified</small></div>
                  <ArrowRight size={14} />
                  <div className="proof-step is-complete"><span>02</span><strong>{totalUnits} units frozen</strong><small>membership sealed</small></div>
                  <ArrowRight size={14} />
                  {monadCommitmentIsOnchain && commitmentProofHref ? (
                    <a className="proof-step is-onchain" href={commitmentProofHref} target="_blank" rel="noopener noreferrer" aria-label="Open finalized Monad commitment evidence">
                      <span>03</span><strong>Monad commit</strong><small>{commitmentTx ? "testnet transaction" : monadHasFinalizedCommitment ? "finalized registry state" : "locally derived"}</small>
                    </a>
                  ) : (
                    <div className="proof-step is-local"><span>03</span><strong>Monad commit</strong><small>locally derived</small></div>
                  )}
                  <ArrowRight size={14} />
                  <div className="proof-step"><span>04</span><strong>RFP opens</strong><small>sellers may bid</small></div>
                </div>
                <div className="proof-facts">
                  <div><span>Coalition ID</span><strong>POOL-2408-017</strong></div>
                  <div><span>Commitment</span><strong>{shortId(monadCommitmentHash ?? monadCommitmentId ?? undefined)}</strong></div>
                  <div><span>Contract</span><strong>{shortId(monadContractAddress ?? undefined)}</strong></div>
                  <div><span>Chain</span><strong>{monadChainId ? `${monadChainName ?? "Monad"} · ${monadChainId}` : "not configured"}</strong></div>
                </div>
                <div className="proof-links">
                  {commitmentProofHref ? <a href={commitmentProofHref} target="_blank" rel="noopener noreferrer"><Link2 size={12} /> {commitmentTx ? "Commitment tx" : "Finalized commitment state"} <span>{shortId(commitmentTx ?? monadCommitmentId ?? undefined)}</span></a> : <span><Link2 size={12} /> No on-chain commitment transaction claimed</span>}
                  {settlementHref ? <a href={settlementHref} target="_blank" rel="noopener noreferrer"><Check size={12} /> Settlement attestation <span>{shortId(settlementTx)}</span></a> : <span><Clock3 size={12} /> Settlement proof appears after Rain completes</span>}
                </div>
                <p className="proof-disclosure">
                  The registry timestamps POOL’s funding-root commitment before bidding; observers reconcile POOL and Rain evidence afterward.
                  A local hash is never presented as a testnet transaction.
                </p>
              </article>
            </div>
          </div>
        </details>
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
            <div className="pool-core-head"><span>POOL-017</span><span>{stage >= 5 ? "COALITION SEALED" : "SCANNING"}</span></div>
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
              <span>{stage >= 7 ? "3 bidding" : "market closed"}</span>
            </div>
            <div className="merchant-list">
              {merchants.map((merchant, index) => {
                const visible = stage >= 7;
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
              <div><span>COALITION COUNTER</span><strong>$383 / unit</strong><small>{totalUnits} prefunded · immediate funded commitment</small></div>
              <ArrowRight size={17} />
            </div>
          </section>
        </div>

        <div className="market-lower-grid">
          <details className="event-panel audit-details">
            <summary className="panel-head audit-panel-summary"><div><CloudLightning size={15} /><span>MARKET EVENT STREAM</span></div><span>open fixed audit trail <ChevronRight className="disclosure-chevron" size={13} aria-hidden="true" /></span></summary>
            <div className="event-stream" ref={eventStreamRef} aria-live="polite">
              {visibleEvents.length === 0 ? (
                <div className="empty-stream"><Sparkles size={18} /><span>Replay the market to watch agents coordinate demand.</span></div>
              ) : visibleEvents.map((event) => (
                <div className={`event-row tone-${event.tone}`} key={event.stage}>
                  <time>{event.time}</time><span className="event-node" /><p>{event.label}</p><ChevronRight size={13} />
                </div>
              ))}
            </div>
          </details>

          <section className={`deal-panel ${stage >= 9 ? "is-agreed" : ""}`}>
            <div className="deal-price-block">
              <div><span>{stage >= 9 ? "NEGOTIATED UNIT PRICE" : "BEST CURRENT OFFER"}</span><strong>{money.format(currentPrice)}</strong></div>
              <div className="price-delta"><ArrowDown size={15} /><strong>{stage >= 6 ? money.format(MSRP_UNIT - currentPrice) : "$0"}</strong><span>per unit</span></div>
            </div>
            <div className="deal-facts">
              <div><span>Quantity</span><strong>{stage >= 5 ? `${totalUnits} units` : "forming"}</strong></div>
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
            that money remains theirs, but cannot be withdrawn or used elsewhere. A buyer may leave while the pool recruits;
            before the RFP opens, membership and reservations freeze until settlement, cancellation, or reconciliation.
          </p>
          <div className="authority-rule"><CircleDollarSign size={17} /><span>deposit MSRP</span><ArrowRight size={14} /><strong>POOL freezes</strong><ArrowRight size={14} /><span>{monadCommitmentIsOnchain ? "Monad timestamps" : "commitment derived"}</span><ArrowRight size={14} /><strong>sellers bid</strong><ArrowRight size={14} /><strong>Rain executes</strong></div>
          <div className="custody-boundary"><ShieldCheck size={15} /><span><strong>Clear boundary:</strong> POOL balance and reservation are the product ledger. Rain is used only at execution; Rain is not presented as the custodial deposit account.</span></div>
        </div>

        <details className={`reservation-panel audit-details ${stage >= 1 ? "is-active" : ""}`}>
          <summary className="panel-head audit-panel-summary"><div><LockKeyhole size={16} /><span>POOL BALANCE RESERVATIONS</span></div><span>MSRP audit · expand <ChevronRight className="disclosure-chevron" size={13} aria-hidden="true" /></span></summary>
          <div className="reservation-rules">
            <div><span>JOIN</span><strong>Balance ≥ MSRP</strong><small>or participation is denied</small></div>
            <ArrowRight size={14} />
            <div><span>PRE-BID</span><strong>Membership freezes</strong><small>before sellers receive the RFP</small></div>
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
            <div className="reservation-total"><span>TOTAL · {totalUnits} UNITS</span><strong>{money.format(baseline)} reserved</strong><ArrowRight size={13} /><strong>{money.format(poolTotal)} captured</strong><strong className="unlock-value">+{money.format(savings)} available</strong></div>
          </div>
          <div className="leave-rule"><RefreshCcw size={13} /><span><strong>While recruiting:</strong> leaving releases the full MSRP reservation. <strong>Before the RFP opens:</strong> membership and funds freeze through settlement, cancellation, or reconciliation. Failed or partial execution never appears as released.</span></div>
        </details>

        <details className="mandate-panel audit-details">
          <summary className="panel-head audit-panel-summary"><div><ShieldCheck size={16} /><span>PRIVATE MANDATE CLEARING</span></div><span>{stage >= 10 ? `${FIXTURE_CAPTURE_COUNT} / ${FIXTURE_CAPTURE_COUNT} pass` : "policy audit · expand"} <ChevronRight className="disclosure-chevron" size={13} aria-hidden="true" /></span></summary>
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
        </details>

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
                <div className="scope-tags"><span><CircleDollarSign size={12} /> deal amount</span><span><Store size={12} /> MCC {ELECTRONICS_MCC}</span><span><Clock3 size={12} /> 48h expiry</span></div>
                <div className="scope-state">{stage >= 11 ? <><Check size={14} /> READY</> : <><Clock3 size={14} /> WAITING</>}</div>
              </div>
            ))}
          </div>

          {stage >= 11 && stage < 12 && settlement.kind !== "running" && (
            <div className="rain-action-row">
              <div>
                <strong>{rainStatus?.connected && rainStatus.liveExecutionEnabled ? "Rain sandbox is ready" : "Rehearsal mode is ready"}</strong>
                <span>{FIXTURE_CAPTURE_COUNT} separate scoped cards · requested spend {money.format(poolTotal)} · idempotent execution</span>
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
            <div className="payment-error"><X size={17} /><div><strong>Rain sandbox run did not complete</strong><span>{settlement.message} POOL reservations remain frozen for safe retry or reconciliation; no refund or simulated receipt is substituted.</span></div><button onClick={() => { setSettlement({ kind: "idle" }); setPaymentProgress(0); }}>Retry settlement</button></div>
          )}

          <div className="sandbox-disclosure">
            <LockKeyhole size={13} /> Hackathon sandbox: POOL’s deposit and reservation ledger is represented in the fixed fixture; Rain begins at execution. {FIXTURE_CAPTURE_COUNT} allocations use separate scoped cards under one provisioned Rain test cardholder. No PAN or CVC is stored or shown.
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

          <div className={`outcome-monad-proof is-${outcomeMonadStatus}`} role="status" aria-live="polite">
            <div className="outcome-monad-copy">
              <span className="outcome-monad-icon" aria-hidden="true"><Fingerprint size={17} /></span>
              <div>
                <span>MONAD SETTLEMENT EVIDENCE</span>
                <strong>{outcomeMonadTitle}</strong>
                <p>{outcomeMonadDetail}</p>
              </div>
            </div>
            {outcomeMonadStatus === "attested" ? (
              outcomeMonadHref ? (
                <a href={outcomeMonadHref} target="_blank" rel="noopener noreferrer"><Link2 size={13} /> {outcomeMonadTx ? "View attestation" : "View finalized registry state"} <span>{shortId(outcomeMonadTx ?? monadCommitmentId ?? monadContractAddress ?? undefined)}</span></a>
              ) : (
                <span className="outcome-monad-state"><Check size={13} /> Finalized · {shortId(outcomeMonadTx ?? outcomeMonad?.commitmentId ?? monadCommitmentId ?? monadContractAddress ?? undefined)}</span>
              )
            ) : outcomeMonadStatus === "attestation_pending" ? (
              <span className="outcome-monad-state"><Clock3 size={13} /> Confirmation pending</span>
            ) : (
              <span className="outcome-monad-state"><EyeOff size={13} /> No testnet transaction claimed</span>
            )}
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
                <strong>MCC {settlement.kind === "live" ? settlement.result.guardrail?.merchantCategoryCode ?? BLOCKED_MCC : BLOCKED_MCC}</strong>
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
        <div><span>Built for Raingentic Commerce Hackathon NYC</span><span>Rain sandbox · Monad proof rail · fictional merchants · fixed evidence replay</span></div>
      </footer>
    </main>
  );
}
