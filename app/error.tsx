"use client";

import Link from "next/link";
import { RefreshCcw, ShieldAlert } from "lucide-react";

import styles from "./product.module.css";

export default function ProductError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.systemPage}>
      <section className={styles.systemCard}>
        <span className={styles.emptyIcon}><ShieldAlert size={20} /></span>
        <span className={styles.pageEyebrow}>Workspace interrupted</span>
        <h1>POOL could not render this product state.</h1>
        <p>
          No external payment was triggered. Retry the current view or return to the
          buyer home; your compatible local workspace remains on this device.
        </p>
        <div className={styles.headerActions}>
          <button type="button" className={styles.primaryButton} onClick={reset}>
            <RefreshCcw size={13} /> Try again
          </button>
          <Link href="/" className={styles.secondaryButton}>Buyer home</Link>
        </div>
      </section>
    </main>
  );
}
