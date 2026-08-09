import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

import styles from "./product.module.css";

export default function NotFound() {
  return (
    <main className={styles.systemPage}>
      <section className={styles.systemCard}>
        <span className={styles.emptyIcon}><Compass size={20} /></span>
        <span className={styles.pageEyebrow}>404 · Pool not found</span>
        <h1>This buying pool is not in the current workspace.</h1>
        <p>
          It may have expired or belong to another sandbox version. Browse the current
          sample market to find an active group buy.
        </p>
        <Link href="/explore" className={styles.primaryButton}>
          Discover group buys <ArrowRight size={13} />
        </Link>
      </section>
    </main>
  );
}
