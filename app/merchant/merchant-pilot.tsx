"use client";

import {
  Check,
  Fingerprint,
  Gavel,
  LoaderCircle,
  LockKeyhole,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import styles from "./merchant.module.css";

type PilotCheck = {
  code: string;
  label: string;
  passed: boolean;
  detail: string;
};

type PilotResponse = {
  status: "eligible" | "rejected" | "invalid_request";
  code?: string;
  message: string;
  mode?: string;
  serverPinned?: {
    rfpId: string;
    rfpVersion: number;
    committedQuantity: number;
    supplierProfile: string;
  };
  offer?: {
    unitPriceCents: number;
    grossOrderValueCents: number;
    deliveryDate: string;
    warrantyMonths: number;
    termsFingerprint: string;
  };
  checks?: PilotCheck[];
  financialAuthorization: "not_requested";
  externalWrites: false;
  aggregateOrderPlaced: false;
  providerBoundary: {
    rain: "not_contacted";
    monad: "not_contacted";
    orderSystem: "not_contacted";
  };
};

type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "complete"; result: PilotResponse }
  | { kind: "failed"; message: string };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export default function MerchantPilot({
  committedQuantity,
  endpoint,
  actionHeader,
}: {
  committedQuantity: number;
  endpoint: string;
  actionHeader: { name: string; value: string };
}) {
  const [unitPrice, setUnitPrice] = useState("389.00");
  const [deliveryDays, setDeliveryDays] = useState("7");
  const [warrantyMonths, setWarrantyMonths] = useState("36");
  const [submission, setSubmission] = useState<SubmissionState>({ kind: "idle" });

  const grossValue = useMemo(() => {
    const price = Number(unitPrice);
    return Number.isFinite(price) && price > 0
      ? Math.round(price * 100) * committedQuantity
      : 0;
  }, [committedQuantity, unitPrice]);

  async function submitPilotBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unitPriceCents = Math.round(Number(unitPrice) * 100);
    const normalizedDelivery = Number(deliveryDays);
    const normalizedWarranty = Number(warrantyMonths);
    if (
      !Number.isSafeInteger(unitPriceCents) ||
      unitPriceCents < 1 ||
      !Number.isSafeInteger(normalizedDelivery) ||
      !Number.isSafeInteger(normalizedWarranty)
    ) {
      setSubmission({
        kind: "failed",
        message: "Enter a valid price, whole delivery days, and whole warranty months.",
      });
      return;
    }

    setSubmission({ kind: "submitting" });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          [actionHeader.name]: actionHeader.value,
        },
        body: JSON.stringify({
          unitPriceCents,
          deliveryDays: normalizedDelivery,
          warrantyMonths: normalizedWarranty,
        }),
      });
      const result = (await response.json()) as PilotResponse;
      if (!response.ok) {
        throw new Error(result.message || "The fixture evaluation did not complete.");
      }
      setSubmission({ kind: "complete", result });
    } catch (error) {
      setSubmission({
        kind: "failed",
        message:
          error instanceof Error
            ? error.message
            : "The fixture evaluation did not complete.",
      });
    }
  }

  return (
    <section className={styles.bidWorkbench} aria-labelledby="pilot-bid-title">
      <div className={styles.workbenchHeader}>
        <div>
          <span>02 / DRY-RUN THE CONTRACT</span>
          <h2 id="pilot-bid-title">Test your terms against the blinded fixture.</h2>
        </div>
        <div className={styles.zeroWriteChip}>
          <LockKeyhole size={13} aria-hidden="true" /> Zero external writes
        </div>
      </div>

      <div className={styles.workbenchGrid}>
        <form className={styles.bidForm} onSubmit={submitPilotBid}>
          <div className={styles.formIntro}>
            <Gavel size={18} aria-hidden="true" />
            <div>
              <strong>Prequalified sandbox supplier</strong>
              <span>Identity, RFP version, and all {committedQuantity} units are server-pinned.</span>
            </div>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="pilot-unit-price">
              <span>Unit price</span>
              <div className={styles.inputShell}>
                <i aria-hidden="true">$</i>
                <input
                  id="pilot-unit-price"
                  name="unitPrice"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  required
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(event.target.value)}
                />
                <em>/ unit</em>
              </div>
            </label>

            <label className={styles.field} htmlFor="pilot-delivery-days">
              <span>Delivery</span>
              <div className={styles.inputShell}>
                <input
                  id="pilot-delivery-days"
                  name="deliveryDays"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="30"
                  step="1"
                  required
                  value={deliveryDays}
                  onChange={(event) => setDeliveryDays(event.target.value)}
                />
                <em>days</em>
              </div>
            </label>

            <label className={styles.field} htmlFor="pilot-warranty-months">
              <span>Warranty</span>
              <div className={styles.inputShell}>
                <input
                  id="pilot-warranty-months"
                  name="warrantyMonths"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="120"
                  step="1"
                  required
                  value={warrantyMonths}
                  onChange={(event) => setWarrantyMonths(event.target.value)}
                />
                <em>months</em>
              </div>
            </label>
          </div>

          <div className={styles.grossPreview} aria-live="polite">
            <span>Illustrative gross order value</span>
            <strong>{money.format(grossValue / 100)}</strong>
            <small>{committedQuantity} units × submitted price · shipping assumed included</small>
          </div>

          <button
            className={styles.submitButton}
            type="submit"
            disabled={submission.kind === "submitting"}
          >
            {submission.kind === "submitting" ? (
              <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
            ) : (
              <Gavel size={16} aria-hidden="true" />
            )}
            {submission.kind === "submitting" ? "Evaluating terms…" : "Evaluate fixture bid"}
          </button>
          <p className={styles.formBoundary}>
            This dry run cannot enroll a merchant, submit an offer, create an order, move money,
            or contact Rain or Monad.
          </p>
        </form>

        <div className={styles.resultPanel} aria-live="polite" aria-busy={submission.kind === "submitting"}>
          {submission.kind === "idle" ? (
            <div className={styles.resultEmpty}>
              <Fingerprint size={24} aria-hidden="true" />
              <span>DETERMINISTIC POLICY OUTPUT</span>
              <h3>No bid evaluated yet.</h3>
              <p>Submit terms to receive a private-policy verdict, checks, and an offer fingerprint.</p>
            </div>
          ) : submission.kind === "submitting" ? (
            <div className={styles.resultEmpty}>
              <LoaderCircle className={styles.spinner} size={24} aria-hidden="true" />
              <span>LOCAL SERVER EVALUATION</span>
              <h3>Checking the blinded fixture.</h3>
              <p>No provider or order system is being contacted.</p>
            </div>
          ) : submission.kind === "failed" ? (
            <div className={styles.resultError} role="alert">
              <X size={18} aria-hidden="true" />
              <div><strong>Evaluation unavailable</strong><p>{submission.message}</p></div>
            </div>
          ) : (
            <PilotResult result={submission.result} />
          )}
        </div>
      </div>
    </section>
  );
}

function PilotResult({ result }: { result: PilotResponse }) {
  const eligible = result.status === "eligible";
  return (
    <div className={styles.resultComplete}>
      <div className={eligible ? styles.resultVerdictEligible : styles.resultVerdictRejected}>
        <span>{eligible ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}</span>
        <div>
          <small>BLINDED FIXTURE VERDICT</small>
          <h3>{eligible ? "Eligible for ranking" : "Terms rejected"}</h3>
        </div>
        <b>{result.mode?.replaceAll("_", " ") ?? "seller pilot fixture"}</b>
      </div>
      <p className={styles.resultMessage}>{result.message}</p>

      {result.offer ? (
        <div className={styles.resultMetrics}>
          <div><span>Gross value</span><strong>{money.format(result.offer.grossOrderValueCents / 100)}</strong></div>
          <div><span>Delivery date</span><strong>{result.offer.deliveryDate}</strong></div>
          <div><span>Warranty</span><strong>{result.offer.warrantyMonths} months</strong></div>
        </div>
      ) : null}

      <div className={styles.checkList}>
        {(result.checks ?? []).map((check, index) => (
          <div className={check.passed ? styles.checkPassed : styles.checkBlocked} key={check.code}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{check.label}</strong><p>{check.detail}</p></div>
            {check.passed ? <Check size={14} aria-label="Passed" /> : <X size={14} aria-label="Blocked" />}
          </div>
        ))}
      </div>

      {result.offer ? (
        <div className={styles.fingerprint}>
          <Fingerprint size={14} aria-hidden="true" />
          <div><span>Offer terms fingerprint</span><code>{result.offer.termsFingerprint}</code></div>
        </div>
      ) : null}

      <dl className={styles.boundaryGrid}>
        <div><dt>Financial authorization</dt><dd>{result.financialAuthorization}</dd></div>
        <div><dt>External writes</dt><dd>{String(result.externalWrites)}</dd></div>
        <div><dt>Aggregate order</dt><dd>{String(result.aggregateOrderPlaced)}</dd></div>
        <div><dt>Rain / Monad</dt><dd>{result.providerBoundary.rain} / {result.providerBoundary.monad}</dd></div>
      </dl>
    </div>
  );
}
