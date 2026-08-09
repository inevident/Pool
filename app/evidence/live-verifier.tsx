"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Fingerprint,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  X,
} from "lucide-react";

import styles from "./page.module.css";

type VerificationStatus = "verified" | "mismatch" | "degraded";
type CheckStatus = "pass" | "fail" | "unavailable";

type VerificationCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  expected: string | number | boolean;
  actual: string | number | boolean | null;
  detail: string;
};

type VerificationResponse = {
  schemaVersion: 1;
  status: VerificationStatus;
  verified: boolean;
  checkedAt: string;
  evidence: {
    path: string;
    schemaVersion: string | number;
    recordedAt: string;
    sourceBranch: string;
    sourceCommit: string;
    evidenceMode: string;
  };
  provenance: {
    network: string;
    expectedChainId: number;
    rpcUrlKind: "public-monad-testnet";
    registryAddress: string;
    commitmentId: string;
    deploymentTransactionHash: string;
    commitmentTransactionHash: string;
    attestationTransactionHash: string;
  };
  scope: {
    readOnly: true;
    externalWrites: false;
    financialAuthorization: "not_requested";
    rainContacted: false;
    monadWrites: false;
  };
  checks: VerificationCheck[];
  chain: {
    expectedChainId: number;
    observedChainId: number | null;
  };
  registry: {
    address: string;
    expectedOperator: string;
    observedOperator: string | null;
    bytecodePresent: boolean | null;
  };
  commitment: {
    id: string;
    observed: null | {
      poolIdHash: string;
      termsHash: string;
      fundingRoot: string;
      acceptedOfferHash: string;
      rainSettlementHash: string;
      reservedCents: string;
      capturedCents: string;
      committedAt: string;
      bidClosesAt: string;
      settledAt: string;
      unitCount: number;
    };
  };
  settlement: {
    rainTransactionIds: string[];
    publishedRainSettlementHash: string;
    recomputedRainSettlementHash: string;
    acceptedOfferHash: string;
  };
  errors: Array<{
    code: string;
    message: string;
    retryable: boolean;
  }>;
};

type ViewState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "result"; result: VerificationResponse }
  | { kind: "error"; message: string };

const statusCopy: Record<
  VerificationStatus,
  { eyebrow: string; title: string; body: string }
> = {
  verified: {
    eyebrow: "Read-only verification passed",
    title: "Published state matches.",
    body: "The public chain reads and locally recomputed settlement digest match the published record.",
  },
  mismatch: {
    eyebrow: "Verification mismatch",
    title: "At least one claim did not match.",
    body: "Treat the published record as unverified until the failed checks are investigated.",
  },
  degraded: {
    eyebrow: "Verification incomplete",
    title: "Some checks were unavailable.",
    body: "No mismatch is implied, but the public RPC did not return enough data to verify every claim.",
  },
};

function isVerificationResponse(value: unknown): value is VerificationResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VerificationResponse>;
  return (
    (candidate.status === "verified" ||
      candidate.status === "mismatch" ||
      candidate.status === "degraded") &&
    typeof candidate.verified === "boolean" &&
    typeof candidate.checkedAt === "string" &&
    Array.isArray(candidate.checks) &&
    !!candidate.provenance &&
    !!candidate.scope &&
    !!candidate.chain &&
    !!candidate.registry &&
    !!candidate.commitment &&
    !!candidate.settlement &&
    Array.isArray(candidate.errors)
  );
}

function comparable(value: VerificationCheck["actual"] | VerificationCheck["expected"]) {
  if (value === null) return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(timestamp);
}

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <Check size={13} aria-hidden="true" />;
  if (status === "fail") return <X size={13} aria-hidden="true" />;
  return <CircleDashed size={13} aria-hidden="true" />;
}

function ScopeMatrix() {
  return (
    <dl className={styles.verifierScope} aria-label="Live verifier scope">
      <div>
        <dt>Network source</dt>
        <dd>Public Monad Testnet RPC</dd>
      </div>
      <div>
        <dt>Operation</dt>
        <dd>Read state + recompute digest</dd>
      </div>
      <div>
        <dt>Provider writes</dt>
        <dd>None</dd>
      </div>
      <div>
        <dt>Financial authority</dt>
        <dd>Not requested</dd>
      </div>
    </dl>
  );
}

function VerifyingState() {
  const pendingChecks = [
    "Confirm chain identity",
    "Read registry bytecode and operator",
    "Read published commitment state",
    "Recompute Rain receipt-set digest",
  ];

  return (
    <div className={styles.verifyingState}>
      <div className={styles.verifyingHeading}>
        <span className={styles.verifierSpinner} aria-hidden="true" />
        <div>
          <p>Live RPC read in progress</p>
          <h3>Verifying the published state…</h3>
        </div>
      </div>
      <ol>
        {pendingChecks.map((check, index) => (
          <li key={check}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {check}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResultState({ result }: { result: VerificationResponse }) {
  const copy = statusCopy[result.status];
  const observedDigest = result.settlement.recomputedRainSettlementHash;

  return (
    <div className={`${styles.verifierResult} ${styles[`verifierResult_${result.status}`]}`}>
      <header className={styles.verifierResultHeader}>
        <div className={styles.resultStatusIcon} aria-hidden="true">
          {result.status === "verified" ? (
            <ShieldCheck size={24} />
          ) : result.status === "mismatch" ? (
            <AlertTriangle size={24} />
          ) : (
            <CircleDashed size={24} />
          )}
        </div>
        <div>
          <p>{copy.eyebrow}</p>
          <h3>{copy.title}</h3>
          <span>{copy.body}</span>
        </div>
        <time dateTime={result.checkedAt}>{humanTimestamp(result.checkedAt)}</time>
      </header>

      <dl className={styles.verifierFacts}>
        <div>
          <dt>Chain</dt>
          <dd>
            <strong>{result.chain.observedChainId ?? "Unavailable"}</strong>
            <span>Expected {result.chain.expectedChainId}</span>
          </dd>
        </div>
        <div>
          <dt>Registry</dt>
          <dd><code title={result.registry.address}>{result.registry.address}</code></dd>
        </div>
        <div>
          <dt>Commitment</dt>
          <dd><code title={result.commitment.id}>{result.commitment.id}</code></dd>
        </div>
        <div>
          <dt>Recomputed digest</dt>
          <dd><code title={observedDigest}>{observedDigest}</code></dd>
        </div>
      </dl>

      <div className={styles.verifierChecks}>
        <div className={styles.verifierChecksHeader}>
          <span>Verification checks</span>
          <strong>
            {result.checks.filter((check) => check.status === "pass").length}/
            {result.checks.length} passed
          </strong>
        </div>
        <ol>
          {result.checks.map((check, index) => (
            <li key={check.id} className={styles[`verifierCheck_${check.status}`]}>
              <span className={styles.checkIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.checkIcon}>
                <CheckIcon status={check.status} />
                <span className={styles.srOnly}>{check.status}</span>
              </span>
              <div className={styles.checkCopy}>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
              <dl className={styles.checkValues}>
                <div>
                  <dt>Expected</dt>
                  <dd>{comparable(check.expected)}</dd>
                </div>
                <div>
                  <dt>Observed</dt>
                  <dd>{comparable(check.actual)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>

      {result.errors.length > 0 ? (
        <div className={styles.verifierErrors}>
          <strong>Verifier notices</strong>
          <ul>
            {result.errors.map((error) => (
              <li key={`${error.code}-${error.message}`}>
                <code>{error.code}</code> — {error.message}
                {error.retryable ? " You can retry this read." : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={styles.verifierResultBoundary}>
        Result scope: read-only {result.provenance.network} state and a local
        recomputation over published, sanitized Rain transaction IDs. Rain was
        not contacted; no Monad write or financial authorization occurred.
      </p>
    </div>
  );
}

export default function LiveEvidenceVerifier() {
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  async function verify() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setView({ kind: "verifying" });

    try {
      const response = await fetch("/api/evidence/verify", {
        method: "GET",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        throw new Error(
          response.status === 429
            ? `The public verifier is rate-limited. Try again${retryAfter ? ` in ${retryAfter} seconds` : " shortly"}.`
            : "The verifier endpoint did not return a successful response.",
        );
      }
      if (!isVerificationResponse(body)) {
        throw new Error("The verifier returned an unexpected response shape.");
      }

      setView({ kind: "result", result: body });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setView({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The live read could not be completed.",
      });
    }
  }

  const isVerifying = view.kind === "verifying";

  return (
    <section
      className={styles.liveVerifierSection}
      id="live-verifier"
      aria-labelledby="live-verifier-title"
    >
      <div className={styles.sectionHeading}>
        <span>01 / Live read-only verifier</span>
        <div>
          <h2 id="live-verifier-title">Check the chain yourself</h2>
          <p>
            Query current Monad Testnet state and recompute the digest recorded
            for the published Rain receipt set. This is a live verification of
            public chain state—not a replay of the provider run.
          </p>
        </div>
        <span>GET /api/evidence/verify</span>
      </div>

      <div className={styles.verifierConsole}>
        <header className={styles.verifierConsoleHeader}>
          <span>
            <ScanSearch size={14} aria-hidden="true" /> Independent read surface
          </span>
          <span className={styles.readOnlyBadge}>Read only · zero writes</span>
        </header>

        <div className={styles.verifierIntro}>
          <div>
            <p className={styles.verifierOverline}>Public verification / Monad Testnet</p>
            <h3>One click. Four boundaries.</h3>
            <p>
              The verifier reads the public registry, compares the published
              commitment, and recomputes the settlement digest from sanitized
              IDs already in this registry.
            </p>
            <button type="button" onClick={verify} disabled={isVerifying}>
              {isVerifying ? (
                <RefreshCw size={15} className={styles.buttonSpinner} aria-hidden="true" />
              ) : (
                <Fingerprint size={15} aria-hidden="true" />
              )}
              {isVerifying
                ? "Verifying public state…"
                : view.kind === "result"
                  ? "Run verification again"
                  : "Run live verification"}
            </button>
          </div>
          <ScopeMatrix />
        </div>

        <div
          className={styles.verifierOutput}
          role="status"
          aria-live="polite"
          aria-atomic="false"
          aria-busy={isVerifying}
        >
          {view.kind === "idle" ? (
            <div className={styles.verifierIdle}>
              <CircleDashed size={18} aria-hidden="true" />
              <div>
                <strong>Ready for a public, read-only check.</strong>
                <span>No request has been sent.</span>
              </div>
            </div>
          ) : null}
          {view.kind === "verifying" ? <VerifyingState /> : null}
          {view.kind === "result" ? <ResultState result={view.result} /> : null}
          {view.kind === "error" ? (
            <div className={styles.verifierRequestError}>
              <AlertTriangle size={19} aria-hidden="true" />
              <div>
                <strong>Live verification could not start.</strong>
                <span>{view.message}</span>
              </div>
            </div>
          ) : null}
        </div>

        <footer className={styles.verifierBoundary}>
          <ShieldCheck size={16} aria-hidden="true" />
          <p>
            <strong>Exact boundary:</strong> this checks current Monad state and
            recomputes the published digest. It does not query Rain, move money,
            authorize a transaction, verify buyer balances, or prove real
            merchants participated.
          </p>
        </footer>
      </div>
    </section>
  );
}
