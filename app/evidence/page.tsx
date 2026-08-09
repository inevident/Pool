import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDashed,
  FileJson,
  Fingerprint,
  Image as ImageIcon,
  LockKeyhole,
  ShieldAlert,
  X,
} from "lucide-react";

import rainSandboxEvidence from "@/public/evidence/rain-sandbox-2026-08-09.json";
import rainMonadEvidence from "@/public/evidence/rain-monad-testnet-2026-08-09.json";

import LiveEvidenceVerifier from "./live-verifier";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Evidence registry — POOL",
  description:
    "Inspect POOL's sanitized payment evidence, exact sandbox transaction identifiers, fixture-ledger reconciliation, and explicit proof boundaries.",
};

type EvidenceState = "current" | "archived";

type EvidenceRecord = {
  key: string;
  state: EvidenceState;
  label: string;
  recordedDate: string;
  scenarioVersion: string;
  provider: string;
  environment: string;
  realMoneyMoved: boolean;
  runKey: string;
  ledger: {
    name: string;
    simulated: boolean;
    reservedCents: number;
    capturedCents: number;
    releasedCents: number;
  };
  payments: Array<{
    buyerId: string;
    amountInCents: number;
    transactionId: string;
    status: string;
  }>;
  guardrail: {
    merchantCategoryCode: string;
    transactionId: string;
    status: string;
    reason: string;
  };
  chain: {
    name: string;
    status: string;
    mode: string;
    testnetTransactionClaimed: boolean;
    transactionId?: string;
    explorerHref?: string;
  };
  redactions: string[];
  rawHref: string;
  screenshotHref: string;
};

// New sanitized Rain + Monad records can be normalized into this registry and
// marked `current`; the page's primary slot and archive layout update together.
const evidenceRecords: readonly EvidenceRecord[] = [
  {
    key: "rain-monad-testnet-2026-08-09",
    state: "current",
    label: "Rain sandbox + Monad Testnet finalized record",
    recordedDate: rainMonadEvidence.recordedAt.slice(0, 10),
    scenarioVersion: rainMonadEvidence.scenarioVersion,
    provider: rainMonadEvidence.rain.provider,
    environment: rainMonadEvidence.rain.environment,
    realMoneyMoved: rainMonadEvidence.realMoneyMoved,
    runKey: rainMonadEvidence.runKey,
    ledger: {
      name: rainMonadEvidence.fundingBoundary.ledger,
      simulated: rainMonadEvidence.fundingBoundary.simulated,
      reservedCents: rainMonadEvidence.fundingBoundary.reservedCents,
      capturedCents: rainMonadEvidence.fundingBoundary.capturedCents,
      releasedCents: rainMonadEvidence.fundingBoundary.releasedCents,
    },
    payments: rainMonadEvidence.rain.payments,
    guardrail: rainMonadEvidence.rain.guardrail,
    chain: {
      name: rainMonadEvidence.monad.network,
      status: "rain_settlement_attested",
      mode: "monad-testnet",
      testnetTransactionClaimed:
        rainMonadEvidence.monad.testnetTransactionClaimed,
      transactionId:
        rainMonadEvidence.monad.settlementAttestation.transaction.hash,
      explorerHref:
        rainMonadEvidence.monad.settlementAttestation.transaction.explorerUrl,
    },
    redactions: rainMonadEvidence.redactions,
    rawHref: "/evidence/rain-monad-testnet-2026-08-09.json",
    screenshotHref: "/evidence/rain-monad-testnet-2026-08-09.png",
  },
  {
    key: "rain-sandbox-2026-08-09",
    state: "archived",
    label: "Rain sandbox settlement record",
    recordedDate: rainSandboxEvidence.recordedDate,
    scenarioVersion: rainSandboxEvidence.scenarioVersion,
    provider: rainSandboxEvidence.provider,
    environment: rainSandboxEvidence.environment,
    realMoneyMoved: rainSandboxEvidence.realMoneyMoved,
    runKey: rainSandboxEvidence.runKey,
    ledger: {
      name: rainSandboxEvidence.fundingBoundary.ledger,
      simulated: rainSandboxEvidence.fundingBoundary.simulated,
      reservedCents: rainSandboxEvidence.fundingBoundary.reservedCents,
      capturedCents: rainSandboxEvidence.fundingBoundary.capturedCents,
      releasedCents: rainSandboxEvidence.fundingBoundary.releasedCents,
    },
    payments: rainSandboxEvidence.payments,
    guardrail: rainSandboxEvidence.guardrail,
    chain: {
      name: "Monad",
      status: rainSandboxEvidence.monad.status,
      mode: rainSandboxEvidence.monad.mode,
      testnetTransactionClaimed:
        rainSandboxEvidence.monad.testnetTransactionClaimed,
    },
    redactions: rainSandboxEvidence.redactions,
    rawHref: "/evidence/rain-sandbox-2026-08-09.json",
    screenshotHref: "/evidence/rain-sandbox-2026-08-09.png",
  },
];

const currentRecord = evidenceRecords.find(
  (record) => record.state === "current",
);
const publishedRecords = [...evidenceRecords].sort((left, right) =>
  left.state === right.state ? 0 : left.state === "current" ? -1 : 1,
);

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function money(cents: number) {
  return dollars.format(cents / 100);
}

function humanDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function CurrentSlot({ record }: { record?: EvidenceRecord }) {
  if (!record) {
    return (
      <aside className={styles.currentSlot} aria-labelledby="current-slot-title">
        <div className={styles.slotHeader}>
          <span>
            <CircleDashed size={14} aria-hidden="true" />
            Current verification slot
          </span>
          <strong>Not published</strong>
        </div>
        <div className={styles.slotBody}>
          <span className={styles.slotIndex}>00</span>
          <div>
            <h2 id="current-slot-title">
              No Rain + Monad Testnet record is published here yet.
            </h2>
            <p>
              The archived Rain sandbox record below is the highest verified
              claim on this page. It does not prove an onchain Testnet
              transaction.
            </p>
          </div>
        </div>
        <dl className={styles.slotMatrix}>
          <div>
            <dt>Rain</dt>
            <dd>Archived sandbox proof below</dd>
          </div>
          <div>
            <dt>Monad</dt>
            <dd>Local-only; no Testnet transaction claimed</dd>
          </div>
        </dl>
      </aside>
    );
  }

  return (
    <aside className={styles.currentSlot} aria-labelledby="current-slot-title">
      <div className={styles.slotHeader}>
        <span>
          <Fingerprint size={14} aria-hidden="true" />
          Current verification slot
        </span>
        <strong className={styles.verified}>Published</strong>
      </div>
      <div className={styles.slotBody}>
        <span className={styles.slotIndex}>01</span>
        <div>
          <h2 id="current-slot-title">{record.label}</h2>
          <p>
            {record.payments.length} settlement records · {record.chain.name}{" "}
            {record.chain.status.replaceAll("_", " ")}
          </p>
        </div>
      </div>
      <a className={styles.slotLink} href={`#record-${record.key}`}>
        Inspect current record <ArrowRight size={14} aria-hidden="true" />
      </a>
    </aside>
  );
}

function EvidenceRecordCard({ record }: { record: EvidenceRecord }) {
  const reconciles =
    record.ledger.reservedCents ===
    record.ledger.capturedCents + record.ledger.releasedCents;
  const hasTestnetProof = record.chain.testnetTransactionClaimed;

  return (
    <article className={styles.recordCard} id={`record-${record.key}`}>
      <header className={styles.recordHeader}>
        <div>
          <span className={styles.archiveBadge}>{record.state} record</span>
          <p>
            <time dateTime={record.recordedDate}>
              {humanDate(record.recordedDate)}
            </time>{" "}
            · {record.scenarioVersion}
          </p>
        </div>
        <div className={styles.recordIdentity}>
          <span>Run key</span>
          <code>{record.runKey}</code>
        </div>
      </header>

      <div className={styles.recordTitleRow}>
        <div>
          <p className={styles.overline}>Verified boundary / 01</p>
          <h3>{record.label}</h3>
        </div>
        <div className={styles.recordFlags} aria-label="Record boundaries">
          <span>{record.provider} sandbox only</span>
          <span>No real money</span>
          <span>Simulated fixture ledger</span>
        </div>
      </div>

      <dl className={styles.metrics}>
        <div>
          <dt>Settled records</dt>
          <dd>{record.payments.length}</dd>
          <small>Exact provider IDs retained</small>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{money(record.ledger.capturedCents)}</dd>
          <small>Sandbox transaction total</small>
        </div>
        <div>
          <dt>Released</dt>
          <dd>{money(record.ledger.releasedCents)}</dd>
          <small>Fixture balance returned</small>
        </div>
        <div className={styles.metricWarning}>
          <dt>Real money moved</dt>
          <dd>{record.realMoneyMoved ? "Yes" : "No"}</dd>
          <small>Provider environment: {record.environment}</small>
        </div>
      </dl>

      <section className={styles.ledgerSection} aria-labelledby={`${record.key}-ledger`}>
        <div className={styles.subhead}>
          <div>
            <span>01 / Fixture reconciliation</span>
            <h4 id={`${record.key}-ledger`}>The ledger closes exactly.</h4>
          </div>
          <span className={reconciles ? styles.pass : styles.fail}>
            {reconciles ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
            {reconciles ? "Reconciled" : "Mismatch"}
          </span>
        </div>
        <div className={styles.equation} aria-label={`${money(record.ledger.reservedCents)} reserved equals ${money(record.ledger.capturedCents)} captured plus ${money(record.ledger.releasedCents)} released`}>
          <div>
            <span>Reserved</span>
            <strong>{money(record.ledger.reservedCents)}</strong>
          </div>
          <b aria-hidden="true">=</b>
          <div>
            <span>Captured</span>
            <strong>{money(record.ledger.capturedCents)}</strong>
          </div>
          <b aria-hidden="true">+</b>
          <div>
            <span>Released</span>
            <strong>{money(record.ledger.releasedCents)}</strong>
          </div>
        </div>
        <p className={styles.boundaryNote}>
          <LockKeyhole size={14} aria-hidden="true" />
          This is a simulated {record.ledger.name} fixture ledger. Rain records
          the sandbox payment actions; Rain does not custody or validate this
          displayed buyer balance.
        </p>
      </section>

      <section className={styles.transactionSection} aria-labelledby={`${record.key}-transactions`}>
        <div className={styles.subhead}>
          <div>
            <span>02 / Payment evidence</span>
            <h4 id={`${record.key}-transactions`}>Three exact settlement IDs.</h4>
          </div>
          <span className={styles.providerLabel}>{record.provider} / {record.environment}</span>
        </div>
        <ol className={styles.transactionList}>
          {record.payments.map((payment, index) => (
            <li key={payment.transactionId}>
              <span className={styles.transactionIndex}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.transactionBuyer}>
                <span>Fixture buyer</span>
                <strong>{payment.buyerId}</strong>
              </div>
              <div className={styles.transactionId}>
                <span>Rain transaction ID</span>
                <code>{payment.transactionId}</code>
              </div>
              <strong className={styles.transactionAmount}>{money(payment.amountInCents)}</strong>
              <span className={styles.settledStatus}>
                <Check size={12} aria-hidden="true" /> {payment.status}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.guardrailSection} aria-labelledby={`${record.key}-guardrail`}>
        <div className={styles.guardrailIcon} aria-hidden="true">
          <ShieldAlert size={22} />
        </div>
        <div className={styles.guardrailCopy}>
          <p>03 / Negative control</p>
          <h4 id={`${record.key}-guardrail`}>Out-of-scope MCC declined.</h4>
          <span>
            The fixed attempt used merchant category code{" "}
            <strong>{record.guardrail.merchantCategoryCode}</strong> and returned
            the exact reason below.
          </span>
        </div>
        <dl className={styles.guardrailData}>
          <div>
            <dt>Rain transaction ID</dt>
            <dd><code>{record.guardrail.transactionId}</code></dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{record.guardrail.status}</dd>
          </div>
          <div>
            <dt>Exact decline reason</dt>
            <dd><code>{record.guardrail.reason}</code></dd>
          </div>
        </dl>
      </section>

      <section className={styles.providerMatrix} aria-labelledby={`${record.key}-providers`}>
        <div className={styles.subhead}>
          <div>
            <span>04 / Provider boundary</span>
            <h4 id={`${record.key}-providers`}>
              {hasTestnetProof
                ? "Two bounded evidence rails."
                : "One provider proof. One explicit gap."}
            </h4>
          </div>
        </div>
        <div className={styles.providerGrid}>
          <div className={styles.rainProvider}>
            <span className={styles.providerNumber}>R / 01</span>
            <div>
              <p>Rain</p>
              <strong>Sandbox transaction evidence present</strong>
              <small>{record.payments.length} settled IDs + 1 scoped-card decline</small>
            </div>
            <span className={styles.provenTag}><Check size={12} aria-hidden="true" /> Proven in scope</span>
          </div>
          <div className={styles.monadProvider}>
            <span className={styles.providerNumber}>M / {hasTestnetProof ? "01" : "00"}</span>
            <div>
              <p>{record.chain.name}</p>
              <strong>
                {hasTestnetProof
                  ? "Testnet transaction evidence present"
                  : "Local proof only — not Testnet"}
              </strong>
              <small>
                Status: {record.chain.status.replaceAll("_", " ")} ·{" "}
                {hasTestnetProof
                  ? record.chain.transactionId ?? "transaction ID published in record"
                  : "no Testnet transaction claimed"}
              </small>
              {hasTestnetProof && record.chain.explorerHref ? (
                <a
                  className={styles.chainLink}
                  href={record.chain.explorerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open finalized attestation <ArrowUpRight size={11} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <span className={hasTestnetProof ? styles.provenTag : styles.gapTag}>
              {hasTestnetProof ? (
                <Check size={12} aria-hidden="true" />
              ) : (
                <CircleDashed size={12} aria-hidden="true" />
              )}
              {hasTestnetProof ? "Onchain proof" : "Not onchain"}
            </span>
          </div>
        </div>
      </section>

      <footer className={styles.recordFooter}>
        <p>
          Public artifact is sanitized. Card identifiers, last-four values, and
          all credentials are intentionally redacted.
        </p>
        <div>
          <a href={record.rawHref} target="_blank" rel="noopener noreferrer">
            <FileJson size={14} aria-hidden="true" /> Open raw JSON
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
          <a href={record.screenshotHref} target="_blank" rel="noopener noreferrer">
            <ImageIcon size={14} aria-hidden="true" /> Open captured result
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </article>
  );
}

export default function EvidencePage() {
  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#evidence-main">
        Skip to evidence
      </a>

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="POOL product home">
          <BrandMark />
          <span>POOL</span>
        </Link>
        <nav className={styles.nav} aria-label="Evidence navigation">
          <a href="#current">Current status</a>
          <a href="#live-verifier">Live verifier</a>
          <a href="#archive">{currentRecord ? "Proof records" : "Archived proof"}</a>
          <a href="#boundaries">Claim boundary</a>
        </nav>
        <span className={styles.publicBadge}>
          <LockKeyhole size={12} aria-hidden="true" /> Public · sanitized
        </span>
      </header>

      <div id="evidence-main">
        <section className={styles.hero} id="current" aria-labelledby="evidence-title">
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>
              <span>Evidence registry</span>
              <span>Source-bound / no hand-waving</span>
            </p>
            <h1 id="evidence-title">
              Verify the claim.<br />
              <em>Read the boundary.</em>
            </h1>
            <p className={styles.intro}>
              POOL publishes the exact identifiers behind its demo claims and
              says what each record cannot prove. The current record combines
              Rain sandbox IDs with finalized Monad Testnet ordering over the
              same simulated fixture ledger. Nothing here represents real
              money movement.
            </p>
            <ul className={styles.heroFlags} aria-label="Evidence guarantees">
              <li><Check size={13} aria-hidden="true" /> Exact IDs</li>
              <li><Check size={13} aria-hidden="true" /> Exact reconciliation</li>
              <li><Check size={13} aria-hidden="true" /> Explicit gaps</li>
            </ul>
          </div>
          <CurrentSlot record={currentRecord} />
        </section>

        <LiveEvidenceVerifier />

        <section className={styles.archiveSection} id="archive" aria-labelledby="archive-title">
          <div className={styles.sectionHeading}>
            <span>02 / Published verification</span>
            <div>
              <h2 id="archive-title">Proof records</h2>
              <p>
                Static, sanitized captures from bounded technical runs—not live
                account balances and not production payment claims.
              </p>
            </div>
            <span>
              {publishedRecords.length.toString().padStart(2, "0")} {publishedRecords.length === 1 ? "record" : "records"}
            </span>
          </div>
          {publishedRecords.map((record) => (
            <EvidenceRecordCard key={record.key} record={record} />
          ))}
        </section>

        <section className={styles.boundariesSection} id="boundaries" aria-labelledby="boundaries-title">
          <div className={styles.sectionHeading}>
            <span>03 / Claim boundary</span>
            <div>
              <h2 id="boundaries-title">What this record means</h2>
              <p>A precise claim is stronger than an oversized one.</p>
            </div>
          </div>
          <div className={styles.boundaryGrid}>
            <article className={styles.provesCard}>
              <span><Check size={14} aria-hidden="true" /> This record proves</span>
              <ul>
                <li>Three Rain sandbox transactions reached settled status.</li>
                <li>The fixture ledger reconciles reserved funds into capture plus release.</li>
                <li>A merchant-category control produced the exact scoped-card decline reason.</li>
                <li>The published copy removes card data and credentials.</li>
              </ul>
            </article>
            <article className={styles.doesNotProveCard}>
              <span><X size={14} aria-hidden="true" /> This record does not prove</span>
              <ul>
                <li>Production payment processing or movement of real money.</li>
                <li>Buyer custody, deposits, or bank-account balances.</li>
                <li>That Monad independently verified Rain, custody, or the simulated buyer ledger.</li>
                <li>Independent audit, merchant demand, or product-market fit.</li>
              </ul>
            </article>
          </div>
        </section>

        <footer className={styles.pageFooter}>
          <div>
            <Link href="/" className={styles.brand} aria-label="POOL product home">
              <BrandMark />
              <span>POOL</span>
            </Link>
            <p>Demand organizes itself. Evidence stays bounded.</p>
          </div>
          <nav aria-label="Evidence footer navigation">
            <Link href="/">Product workspace</Link>
            <Link href="/demo">Technical walkthrough</Link>
            <a href="#current">Back to top</a>
          </nav>
        </footer>
      </div>
    </main>
  );
}
