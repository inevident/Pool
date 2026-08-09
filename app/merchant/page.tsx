import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  EyeOff,
  FileJson,
  LockKeyhole,
  ShieldCheck,
  Store,
} from "lucide-react";

import { sellerPilotContract } from "./contract";
import MerchantPilot from "./merchant-pilot";
import styles from "./merchant.module.css";

export const metadata: Metadata = {
  title: "Seller pilot sandbox — POOL",
  description:
    "Inspect POOL's blinded fixture RFP and dry-run seller terms without creating an order or contacting Rain or Monad.",
};

const wholeMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function MerchantPage() {
  const { artifact, rfp, bidContract } = sellerPilotContract;
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="POOL buyer product home">
          <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
          POOL
        </Link>
        <span className={styles.topbarMode}><Store size={13} aria-hidden="true" /> SELLER PILOT SANDBOX</span>
        <nav className={styles.topnav} aria-label="Seller pilot navigation">
          <Link href="/"><ArrowLeft size={13} aria-hidden="true" /> Buyer product</Link>
          <Link href="/demo">Technical proof <ArrowRight size={13} aria-hidden="true" /></Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="merchant-hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.pilotBadge}><span /> SELLER PILOT · SANDBOX FIXTURE</span>
            <p className={styles.heroIndex}>SUPPLY-SIDE CONTRACT / V1</p>
            <h1 id="merchant-hero-title">Price the order.<br />{" "}<em>Not the audience.</em></h1>
            <p className={styles.heroLead}>
              Inspect the public requirements, keep buyer economics private, and dry-run
              seller terms against one frozen group-buy fixture.
            </p>
          </div>
          <div className={styles.heroStats} aria-label="Seller pilot fixture summary">
            <div><span>SIMULATED RESERVED UNITS</span><strong>{rfp.committedQuantity}</strong><small>Server-pinned quantity</small></div>
            <div><span>MODELED MSRP COVERAGE</span><strong>{wholeMoney.format(rfp.demandEvidence.reservedCents / 100)}</strong><small>Fixture credits, not custody</small></div>
            <div><span>NUMERIC CEILINGS RETURNED</span><strong>0</strong><small>Repeated probes can infer policy bands</small></div>
            <div><span>EXTERNAL WRITES</span><strong>0</strong><small>No provider or order call</small></div>
          </div>
        </section>

        <section className={styles.truthNotice} aria-label="Seller pilot limitations">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>No live retailer is connected.</strong>
            <p>
              These 12 reservations are simulated, not custodied buyer money. Every response is
              non-binding and never creates an order, moves money, or contacts Rain or Monad.
              This is a product integration artifact—not merchant traction.
            </p>
          </div>
          <span>LIVE MERCHANTS · 0</span>
        </section>

        <section className={styles.rfpSection} aria-labelledby="public-rfp-title">
          <div className={styles.sectionHeading}>
            <div><span>01 / PUBLIC RFP</span><h2 id="public-rfp-title">Everything a seller may know.</h2></div>
            <div className={styles.contractActions}>
              <a href="/merchant/pool-seller-pilot-rfp-v1.json" download>
                <Download size={14} aria-hidden="true" /> Download RFP JSON
              </a>
              <a href={bidContract.endpoint} target="_blank" rel="noreferrer">
                <FileJson size={14} aria-hidden="true" /> Inspect API contract
              </a>
            </div>
          </div>

          <div className={styles.rfpGrid}>
            <article className={styles.rfpIdentity}>
              <div className={styles.cardKicker}><Store size={14} aria-hidden="true" /> OPEN FIXTURE RFP</div>
              <span className={styles.rfpId}>{rfp.id} · REV {rfp.version}</span>
              <h3>{rfp.title}</h3>
              <p>{rfp.product.label}</p>
              <div className={styles.quantityLock}>
                <strong>{rfp.committedQuantity}</strong>
                <span>UNITS<br />{" "}ALL OR NOTHING</span>
                <LockKeyhole size={18} aria-hidden="true" />
              </div>
              <small>{rfp.demandEvidence.description}</small>
            </article>

            <article className={styles.termCard}>
              <div className={styles.cardKicker}>PUBLIC PRODUCT REQUIREMENTS</div>
              <dl className={styles.termList}>
                <div><dt>SKU</dt><dd>{rfp.product.sku}</dd></div>
                <div><dt>Display</dt><dd>{rfp.product.specifications.diagonalInches}&quot; · {rfp.product.specifications.resolution} · {rfp.product.specifications.panelTechnology.toUpperCase()}</dd></div>
                <div><dt>Connectivity</dt><dd>{rfp.product.specifications.ports.map((port) => port.toUpperCase()).join(" · ")}</dd></div>
                <div><dt>USB-C power</dt><dd>{rfp.product.specifications.usbPowerDeliveryWatts}W</dd></div>
                <div><dt>VESA mount</dt><dd>{rfp.product.specifications.vesaMount ? "Required" : "Not required"}</dd></div>
                <div><dt>Public MSRP</dt><dd>{wholeMoney.format(rfp.product.publicMsrpUnitCents / 100)} / unit</dd></div>
              </dl>
            </article>

            <article className={styles.termCard}>
              <div className={styles.cardKicker}>FULFILLMENT ENVELOPE</div>
              <dl className={styles.termList}>
                <div><dt>Destination scope</dt><dd>{rfp.fulfillment.destinationScope}</dd></div>
                <div><dt>Country</dt><dd>{rfp.fulfillment.destinationCountry}</dd></div>
                <div><dt>Delivery</dt><dd>Within {rfp.fulfillment.deliveryWithinDays} days</dd></div>
                <div><dt>Warranty</dt><dd>{rfp.fulfillment.minimumWarrantyMonths}+ months</dd></div>
                <div><dt>Shipping</dt><dd>{rfp.fulfillment.shippingAssumption}</dd></div>
                <div><dt>Demand status</dt><dd>Simulated full-MSRP coverage</dd></div>
              </dl>
            </article>

            <article className={styles.privateCard}>
              <div className={styles.cardKicker}><EyeOff size={14} aria-hidden="true" /> DELIBERATELY WITHHELD</div>
              <h3>Literal values stay withheld.</h3>
              <p>
                Each response omits numeric ceilings. Because this public deterministic endpoint
                is repeatable, comparing verdicts can infer fixture eligibility bands; it is not a
                production privacy boundary.
              </p>
              <ul>
                {rfp.hiddenFromSeller.map((field) => <li key={field}><EyeOff size={12} aria-hidden="true" /> {field}</li>)}
              </ul>
            </article>
          </div>
        </section>

        <MerchantPilot
          committedQuantity={rfp.committedQuantity}
          endpoint={bidContract.endpoint}
          actionHeader={bidContract.actionHeader}
        />

        <section className={styles.evidenceBoundary} aria-labelledby="artifact-boundary-title">
          <div>
            <span>03 / EVIDENCE BOUNDARY</span>
            <h2 id="artifact-boundary-title">A testable contract.<br />{" "}Not manufactured validation.</h2>
          </div>
          <div className={styles.boundaryColumns}>
            <article>
              <strong>What this proves</strong>
              <ul>
                <li>A judge can inspect the RFP without literal numeric buyer ceilings in the payload.</li>
                <li>Quantity and fixture identity stay server-owned.</li>
                <li>Terms receive deterministic pass/reject checks and a fingerprint.</li>
                <li>The same response names its zero-write boundary.</li>
              </ul>
            </article>
            <article>
              <strong>What remains unproven</strong>
              <ul>
                <li>No retailer has validated pricing, operations, or willingness to participate.</li>
                <li>No bid is binding and no aggregate order is placed.</li>
                <li>Repeated probing can infer fixture policy bands; production privacy controls remain future work.</li>
                <li>Merchant identity, KYB, inventory feeds, tax, shipping, returns, and payouts are future work.</li>
                <li>Fixture reservations are not customer funds or custody.</li>
              </ul>
            </article>
          </div>
          <p>{artifact.statement}</p>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>POOL / SELLER PILOT SANDBOX</span>
        <p>Product integration artifact · no live retailer · no binding offer · no real money</p>
        <Link href="/demo">See the fixed technical proof <ArrowRight size={13} aria-hidden="true" /></Link>
      </footer>
    </div>
  );
}
