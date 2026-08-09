"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  ExternalLink,
  Gamepad2,
  Headphones,
  Home,
  House,
  Info,
  Laptop,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Users,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import {
  PRODUCT_SEED_VERSION,
  PRODUCT_WORKSPACE_SCHEMA_VERSION,
  ProductDomainError,
  assertProductWorkspaceInvariant,
  createCanonicalProductWorkspace,
  createResetProductWorkspace,
  evaluateProductPoolFunding,
  evaluateProductExecutionWindow,
  productExecutionSchedule,
  reduceProductWorkspace,
  type PoolMembership,
  type PoolMembershipEnvelope,
  type ProductActivityEntry,
  type ProductCategory,
  type ProductListing,
  type ProductPool,
  type ProductWorkspace,
} from "@/lib/product";
import type { ProductIntentRun } from "@/lib/agent/product-intent";
import { minimumConsumerDeliveryDays } from "@/lib/market/consumer";

import styles from "../product.module.css";

export type ProductWorkspaceView =
  | "home"
  | "explore"
  | "wallet"
  | "orders"
  | "beta"
  | "pool";

type ProductWorkspaceProps = {
  view: ProductWorkspaceView;
  poolId?: string;
};

type ModalState =
  | { kind: "fund"; suggestedCents?: number }
  | {
      kind: "intent";
      productId?: string;
      quickText?: string;
      decisionReceipt?: ProductIntentRun;
    }
  | { kind: "join"; poolId: string }
  | { kind: "leave"; membershipId: string }
  | { kind: "settle"; membershipId: string }
  | { kind: "reset" }
  | null;

const STORAGE_KEY = "pool-product-workspace-v1";
const DAY_MS = 86_400_000;
const DEFAULT_SEED = createCanonicalProductWorkspace();

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const shortDateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

function cents(value: number) {
  return money.format(value / 100);
}

function compactCents(value: number) {
  return compactMoney.format(value / 100);
}

/**
 * Re-renders on an interval so time-sensitive affordances (notably the exit
 * cutoff) stop being offered on a tab that has been left open. Returns 0 until
 * mounted so server and client markup agree.
 */
function useNow(intervalMs = 30_000) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const id = window.setInterval(onStoreChange, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs],
  );
  // The snapshot is bucketed to the tick so repeated reads within one interval
  // are referentially stable, which useSyncExternalStore requires.
  const getSnapshot = useCallback(
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

/**
 * A commitment may only be released while the pool is still forming and the
 * published cutoff has not passed. This mirrors the `pool/leave` domain rule so
 * the UI never offers an action the reducer will reject.
 */
function canLeavePool(pool: ProductPool, now: number) {
  if (pool.status !== "forming") return false;
  if (now === 0) return true;
  return now < Date.parse(pool.cutoffAt);
}

/**
 * The merchant market opens only after the published commitment window has
 * closed. A zero snapshot is the server/hydration state, so it intentionally
 * keeps settlement unavailable until the browser has a trustworthy clock.
 */
function marketWindowPhase(pool: ProductPool, now: number) {
  if (now === 0) return "waiting_for_cutoff" as const;
  try {
    return evaluateProductExecutionWindow(pool, now).status;
  } catch {
    return "unavailable" as const;
  }
}

function canRunMarket(pool: ProductPool, now: number) {
  if (
    pool.status !== "forming" &&
    pool.status !== "locked" &&
    pool.status !== "bidding"
  ) {
    return false;
  }
  // This only controls the affordance. Both APIs independently re-evaluate the
  // same canonical boundaries using server time before any side effect.
  return marketWindowPhase(pool, now) === "open";
}

/**
 * Product pools collect every funded commitment submitted during their fixed
 * window. The percentage below is time elapsed, never enrollment progress.
 */
function commitmentWindowProgress(pool: ProductPool, now: number) {
  if (now === 0) return 0;
  const openedAt = Date.parse(pool.createdAt);
  const closesAt = Date.parse(pool.cutoffAt);
  if (!Number.isFinite(openedAt) || !Number.isFinite(closesAt) || closesAt <= openedAt) {
    return 0;
  }
  return Math.min(100, Math.max(0, ((now - openedAt) / (closesAt - openedAt)) * 100));
}

function commitmentWindowDays(pool: ProductPool) {
  const duration = Date.parse(pool.cutoffAt) - Date.parse(pool.createdAt);
  return Number.isFinite(duration) && duration > 0
    ? Math.max(1, Math.round(duration / DAY_MS))
    : 14;
}

function poolEligibility(pool: ProductPool) {
  const funding = evaluateProductPoolFunding({
    pool,
    aggregateFundedUnitCount: pool.committedUnitCount,
  });
  return {
    eligible: funding.hasMetMinimum,
    remaining: funding.unitsNeeded,
    label:
      funding.hasMetMinimum
        ? `${pool.minimumCommittedUnitCount}-unit minimum met`
        : `${funding.unitsNeeded} more funded unit${funding.unitsNeeded === 1 ? "" : "s"} to qualify`,
  };
}

/**
 * Local-time greeting. Callers must only use this after hydration, because the
 * server and the visitor's browser can sit in different time zones.
 */
function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function createId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function isCompatibleWorkspace(value: unknown): value is ProductWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProductWorkspace>;
  if (
    candidate.schemaVersion !== PRODUCT_WORKSPACE_SCHEMA_VERSION ||
    candidate.seedVersion !== PRODUCT_SEED_VERSION ||
    typeof candidate.revision !== "number" ||
    !candidate.owner ||
    !candidate.products ||
    !candidate.pools ||
    !candidate.balances ||
    !candidate.treasury ||
    typeof candidate.treasury.spendingPowerCents !== "number" ||
    !candidate.intents ||
    !candidate.memberships ||
    !Array.isArray(candidate.activity)
  ) {
    return false;
  }

  const ownerId = candidate.owner.id;
  const ownerBalance = candidate.balances[ownerId];
  if (
    typeof ownerId !== "string" ||
    !ownerId ||
    !ownerBalance ||
    !Number.isSafeInteger(ownerBalance.totalDepositedCents) ||
    !Number.isSafeInteger(ownerBalance.availableCents) ||
    !Number.isSafeInteger(ownerBalance.reservedCents) ||
    Object.keys(candidate.products).length === 0 ||
    Object.keys(candidate.pools).length === 0 ||
    Object.values(candidate.pools).some(
      (pool) => !pool || !candidate.products?.[pool.productId],
    )
  ) {
    return false;
  }

  try {
    return assertProductWorkspaceInvariant(candidate as ProductWorkspace);
  } catch {
    return false;
  }
}

function isProductIntentRun(value: unknown): value is ProductIntentRun {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProductIntentRun>;
  return (
    (candidate.status === "ready_for_review" ||
      candidate.status === "needs_clarification" ||
      candidate.status === "blocked") &&
    (candidate.mode === "openai_responses" ||
      candidate.mode === "deterministic_fallback") &&
    typeof candidate.traceId === "string" &&
    typeof candidate.rawIntent === "string" &&
    Boolean(candidate.extraction) &&
    Boolean(candidate.decision) &&
    Array.isArray(candidate.trace)
  );
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const categoryMeta: Record<
  ProductCategory,
  { label: string; Icon: LucideIcon; color: string }
> = {
  audio: { label: "Audio", Icon: Headphones, color: styles.glyphLime },
  gaming: { label: "Gaming", Icon: Gamepad2, color: styles.glyphPurple },
  computing: { label: "Computing", Icon: Laptop, color: styles.glyphBlue },
  home: { label: "Home", Icon: House, color: styles.glyphOrange },
};

function ProductGlyph({ product, size = 21 }: { product: ProductListing; size?: number }) {
  const { Icon, color } = categoryMeta[product.category];
  return (
    <span className={classNames(styles.productGlyph, color)} aria-hidden="true">
      <Icon size={size} strokeWidth={1.7} />
    </span>
  );
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

function activeMembershipForPool(workspace: ProductWorkspace, poolId: string) {
  return Object.values(workspace.memberships).find(
    (membership) =>
      membership.poolId === poolId && membership.status === "active",
  );
}

function productForMembership(
  workspace: ProductWorkspace,
  membership: PoolMembership,
) {
  const pool = workspace.pools[membership.poolId];
  return pool ? workspace.products[pool.productId] : undefined;
}

function statusLabel(pool: ProductPool) {
  switch (pool.status) {
    case "forming":
      return "Forming";
    case "locked":
      return "Commitments locked";
    case "bidding":
      return "Merchant bidding";
    case "ordered":
      return "Order placed";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

function activityImpact(entry: ProductActivityEntry) {
  if (entry.kind === "sandbox.deposit_recorded") {
    return Number(entry.metadata.amountCents ?? 0);
  }
  if (entry.kind === "pool.joined") {
    return -Number(entry.metadata.reservedCents ?? 0);
  }
  if (
    entry.kind === "pool.left" ||
    entry.kind === "pool.reservation_released"
  ) {
    return Number(entry.metadata.releasedCents ?? 0);
  }
  return 0;
}

function activityIcon(entry: ProductActivityEntry) {
  if (entry.kind === "sandbox.deposit_recorded") return ArrowDownLeft;
  if (entry.kind === "pool.joined") return LockKeyhole;
  if (
    entry.kind === "pool.left" ||
    entry.kind === "pool.reservation_released"
  ) {
    return ArrowUpRight;
  }
  if (entry.kind === "intent.created") return Sparkles;
  return Zap;
}

function poolHref(pool: ProductPool) {
  return `/pools/${encodeURIComponent(pool.id)}`;
}

export default function ProductWorkspaceApp({
  view,
  poolId,
}: ProductWorkspaceProps) {
  const [workspace, setWorkspace] = useState<ProductWorkspace>(DEFAULT_SEED);
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [quickIntent, setQuickIntent] = useState("");
  const [productAgentRun, setProductAgentRun] =
    useState<ProductIntentRun | null>(null);
  const [productAgentError, setProductAgentError] = useState<string | null>(null);
  const [productAgentLoading, setProductAgentLoading] = useState(false);
  const productAgentRequestRef = useRef<AbortController | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      let nextWorkspace: ProductWorkspace | null = null;
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (isCompatibleWorkspace(parsed)) nextWorkspace = parsed;
        }
      } catch {
        nextWorkspace = null;
      }

      if (!nextWorkspace) {
        nextWorkspace = createCanonicalProductWorkspace();
      }
      setWorkspace(nextWorkspace);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      // The workspace remains functional for this browser session when storage is blocked.
    }
  }, [hydrated, workspace]);

  // Replace the offline fixture ceiling with the team's real Rain sandbox
  // spending power. A failed or locked read leaves the labeled local ceiling in
  // place rather than inventing a number.
  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/rain/balance", {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = (await response.json()) as {
          source: "rain-sandbox" | "local";
          spendingPowerCents: number | null;
          creditLimitCents: number | null;
          postedChargesCents: number | null;
          pendingChargesCents: number | null;
        };
        if (body.source !== "rain-sandbox") return;
        if (!Number.isSafeInteger(body.spendingPowerCents)) return;

        setWorkspace((current) => {
          // Re-syncing after a settlement is how the rail's own numbers are
          // shown moving; skip only when nothing actually changed.
          if (
            current.treasury.source === "rain-sandbox" &&
            current.treasury.spendingPowerCents === body.spendingPowerCents &&
            current.treasury.postedChargesCents === body.postedChargesCents
          ) {
            return current;
          }
          try {
            return reduceProductWorkspace(current, {
              type: "treasury/sync",
              source: "rain-sandbox",
              spendingPowerCents: body.spendingPowerCents ?? 0,
              creditLimitCents: body.creditLimitCents ?? 0,
              postedChargesCents: body.postedChargesCents ?? 0,
              pendingChargesCents: body.pendingChargesCents ?? 0,
              activityId: createId("activity-treasury"),
              at: new Date().toISOString(),
            });
          } catch {
            // A ceiling below existing credits is rejected by the domain; the
            // workspace keeps its current, still-reconciling treasury.
            return current;
          }
        });
      } catch {
        // Offline or blocked: the labeled local ceiling stands.
      }
    })();
    return () => controller.abort();
  }, [hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!modal) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  useEffect(
    () => () => {
      productAgentRequestRef.current?.abort();
    },
    [],
  );

  const balance = workspace.balances[workspace.owner.id];
  const pools = useMemo(() => Object.values(workspace.pools), [workspace.pools]);
  const activeMemberships = useMemo(
    () =>
      Object.values(workspace.memberships).filter(
        (membership) => membership.status === "active",
      ),
    [workspace.memberships],
  );
  const openIntents = useMemo(
    () =>
      Object.values(workspace.intents).filter((intent) => intent.status === "open"),
    [workspace.intents],
  );
  const potentialSavings = activeMemberships.reduce((total, membership) => {
    const pool = workspace.pools[membership.poolId];
    const product = pool ? workspace.products[pool.productId] : undefined;
    if (!pool || !product) return total;
    return (
      total +
      Math.max(0, product.msrpUnitCents - pool.estimatedUnitPriceCents) *
        membership.quantity
    );
  }, 0);

  function showError(error: unknown) {
    setToast(
      error instanceof ProductDomainError || error instanceof Error
        ? error.message
        : "That action could not be completed.",
    );
  }

  async function interpretProductIntent(rawIntent: string) {
    const intent = rawIntent.trim();
    setQuickIntent(intent);
    setProductAgentError(null);
    setProductAgentRun(null);
    productAgentRequestRef.current?.abort();
    const controller = new AbortController();
    productAgentRequestRef.current = controller;
    setProductAgentLoading(true);

    try {
      const response = await fetch("/api/agent/product-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pool-agent-action": "interpret-product-intent",
        },
        cache: "no-store",
        body: JSON.stringify({ intent }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : "The buyer intent agent could not interpret this request.";
        throw new Error(message);
      }
      if (!isProductIntentRun(body)) {
        throw new Error("The buyer intent agent returned an invalid decision receipt.");
      }
      setProductAgentRun(body);
    } catch (error) {
      if (controller.signal.aborted) return;
      setProductAgentError(
        error instanceof Error
          ? error.message
          : "The buyer intent agent could not interpret this request.",
      );
    } finally {
      if (productAgentRequestRef.current === controller) {
        productAgentRequestRef.current = null;
        setProductAgentLoading(false);
      }
    }
  }

  function updateQuickIntent(value: string) {
    setQuickIntent(value);
    setProductAgentRun(null);
    setProductAgentError(null);
  }

  function openQuickIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void interpretProductIntent(quickIntent);
  }

  function resetWorkspace() {
    const next = createResetProductWorkspace(workspace);
    setWorkspace(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Reset still applies in memory when browser storage is unavailable.
    }
    setModal(null);
    setToast("Product sandbox reset. No external account or payment was touched.");
  }

  const navItems: Array<{
    href: string;
    label: string;
    view: ProductWorkspaceView;
    Icon: LucideIcon;
    count?: number;
  }> = [
    { href: "/", label: "Home", view: "home", Icon: Home },
    { href: "/explore", label: "Discover", view: "explore", Icon: Compass },
    {
      href: "/orders",
      label: "Commitments",
      view: "orders",
      Icon: ShoppingBag,
      count: activeMemberships.length || undefined,
    },
    { href: "/wallet", label: "Wallet", view: "wallet", Icon: WalletCards },
    { href: "/beta", label: "Mobile Preview", view: "beta", Icon: Smartphone },
  ];

  return (
    <div className={styles.productApp}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} aria-label="POOL product home">
          <BrandMark />
          <span>POOL</span>
        </Link>
        <span className={styles.sandboxLabel}>Product sandbox</span>

        <nav className={styles.primaryNav} aria-label="Product navigation">
          {navItems.map((item) => {
            const active = item.view === view || (view === "pool" && item.view === "explore");
            return (
              <Link
                href={item.href}
                className={classNames(styles.navLink, active && styles.navLinkActive)}
                aria-current={active ? "page" : undefined}
                key={item.href}
              >
                <item.Icon size={16} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.count ? <span className={styles.navCount}>{item.count}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarSpacer} />
        <section className={styles.sidebarWallet} aria-label="Available test balance">
          <span>Available test balance</span>
          <strong>{compactCents(balance?.availableCents ?? 0)}</strong>
          <small>{compactCents(balance?.reservedCents ?? 0)} reserved</small>
          <button type="button" onClick={() => setModal({ kind: "fund" })}>
            <Plus size={13} /> Add test funds
          </button>
        </section>

        <Link className={styles.proofLink} href="/demo">
          <Zap size={14} />
          <span>Rain + Monad proof</span>
          <ExternalLink size={11} />
        </Link>

        <div className={styles.userBlock}>
          <span className={styles.avatar}>AM</span>
          <span>
            <strong>{workspace.owner.displayName}</strong>
            <small>Sandbox buyer · 18+</small>
          </span>
        </div>
      </aside>

      <header className={styles.mobileHeader}>
        <Link href="/" className={styles.mobileBrand} aria-label="POOL product home">
          <BrandMark />
          <span>POOL</span>
        </Link>
        <div className={styles.mobileBalance}>
          <span>Available</span>
          <strong>{cents(balance?.availableCents ?? 0)}</strong>
        </div>
      </header>

      <main className={styles.main}>
        {view === "home" ? (
          <DashboardView
            workspace={workspace}
            balance={balance}
            pools={pools}
            activeMemberships={activeMemberships}
            openIntentCount={openIntents.length}
            potentialSavings={potentialSavings}
            hydrated={hydrated}
            quickIntent={quickIntent}
            setQuickIntent={updateQuickIntent}
            openQuickIntent={openQuickIntent}
            interpretProductIntent={interpretProductIntent}
            productAgentRun={productAgentRun}
            productAgentError={productAgentError}
            productAgentLoading={productAgentLoading}
            setModal={setModal}
          />
        ) : null}

        {view === "explore" ? (
          <ExploreView
            workspace={workspace}
            pools={pools}
            setModal={setModal}
          />
        ) : null}

        {view === "wallet" ? (
          <WalletView
            workspace={workspace}
            balance={balance}
            setModal={setModal}
          />
        ) : null}

        {view === "orders" ? (
          <OrdersView
            workspace={workspace}
            activeMemberships={activeMemberships}
            setModal={setModal}
          />
        ) : null}

        {view === "beta" ? <BetaView workspace={workspace} /> : null}

        {view === "pool" ? (
          <PoolDetailView
            workspace={workspace}
            poolId={poolId}
            setModal={setModal}
          />
        ) : null}
      </main>

      <nav className={styles.mobileNav} aria-label="Mobile product navigation">
        {navItems.map((item) => {
          const active = item.view === view || (view === "pool" && item.view === "explore");
          return (
            <Link
              href={item.href}
              className={active ? styles.mobileNavActive : undefined}
              aria-current={active ? "page" : undefined}
              key={item.href}
            >
              <item.Icon size={17} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {modal ? (
        <ProductModal
          modal={modal}
          workspace={workspace}
          closeButtonRef={closeButtonRef}
          setModal={setModal}
          setWorkspace={setWorkspace}
          setToast={setToast}
          showError={showError}
          resetWorkspace={resetWorkspace}
        />
      ) : null}

      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          <CheckCircle2 size={16} />
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  );
}

type SharedViewProps = {
  workspace: ProductWorkspace;
  setModal: (modal: ModalState) => void;
};

function DashboardView({
  workspace,
  balance,
  pools,
  activeMemberships,
  openIntentCount,
  potentialSavings,
  hydrated,
  quickIntent,
  setQuickIntent,
  openQuickIntent,
  interpretProductIntent,
  productAgentRun,
  productAgentError,
  productAgentLoading,
  setModal,
}: SharedViewProps & {
  balance: ProductWorkspace["balances"][string];
  pools: ProductPool[];
  activeMemberships: PoolMembership[];
  openIntentCount: number;
  potentialSavings: number;
  hydrated: boolean;
  quickIntent: string;
  setQuickIntent: (value: string) => void;
  openQuickIntent: (event: FormEvent<HTMLFormElement>) => void;
  interpretProductIntent: (intent: string) => Promise<void>;
  productAgentRun: ProductIntentRun | null;
  productAgentError: string | null;
  productAgentLoading: boolean;
}) {
  const recentActivity = [...workspace.activity].reverse().slice(0, 5);
  const intents = Object.values(workspace.intents).slice(-4).reverse();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.pageEyebrow}>Buyer workspace</span>
          <h1>
            {hydrated ? greetingFor(new Date()) : "Welcome back"},{" "}
            {workspace.owner.displayName.split(" ")[0]}.
          </h1>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setModal({ kind: "fund" })}
          >
            <Plus size={15} /> Add test funds
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setModal({ kind: "intent" })}
          >
            <Sparkles size={15} /> New buying intent
          </button>
        </div>
      </header>

      <section className={styles.dashboardGrid} aria-label="Buyer overview">
        <div className={styles.intentCard}>
          <span className={styles.intentKicker}>Patient purchasing</span>
          <h2>
            What are you willing to <em>wait for?</em>
          </h2>
          <form className={styles.quickIntent} onSubmit={openQuickIntent}>
            <label className={styles.quickIntentLabel} htmlFor="quick-intent">
              What do you want to buy?
            </label>
            <div className={styles.quickIntentControl}>
              <input
                id="quick-intent"
                value={quickIntent}
                onChange={(event) => setQuickIntent(event.target.value)}
                placeholder="e.g. 1 Sony XM6 under $400; I can wait 30 days"
                minLength={12}
                maxLength={500}
                aria-describedby="quick-intent-boundary"
                required
              />
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={productAgentLoading}
              >
                {productAgentLoading ? "Interpreting…" : "Run buyer agent"}{" "}
                <ArrowRight size={14} />
              </button>
            </div>
            <small id="quick-intent-boundary" className={styles.agentBoundary}>
              Interpretation only · no account lookup, reservation, or money movement
            </small>
          </form>
          <div className={styles.exampleRow} aria-label="Example purchases">
            {[
              {
                label: "Sony XM6",
                intent: "I want 1 Sony XM6 under $400 and can wait 30 days.",
              },
              {
                label: "Steam Deck OLED",
                intent: "I want 1 Steam Deck OLED under $520 and can wait 30 days.",
              },
              {
                label: "MacBook Air M4",
                intent: "I want 1 MacBook Air M4 under $950 and can wait 30 days.",
              },
              {
                label: "Dyson Airwrap",
                intent: "I want 1 Dyson Airwrap under $550 and can wait 30 days.",
              },
            ].map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => {
                    setQuickIntent(example.intent);
                    void interpretProductIntent(example.intent);
                  }}
                >
                  {example.label}
                </button>
              ))}
          </div>
          <div className={styles.agentReceiptSlot} aria-live="polite">
            {productAgentError ? (
              <div className={styles.agentError} role="alert">
                <Info size={14} />
                <span>{productAgentError}</span>
              </div>
            ) : null}
            {productAgentRun ? (
              <ProductAgentReceipt
                run={productAgentRun}
                onReview={
                  productAgentRun.status === "ready_for_review" &&
                  productAgentRun.match
                    ? () =>
                        setModal({
                          kind: "intent",
                          productId: productAgentRun.match!.productId,
                          quickText: productAgentRun.rawIntent,
                          decisionReceipt: productAgentRun,
                        })
                    : undefined
                }
              />
            ) : null}
          </div>
        </div>

        <aside className={styles.balancePanel} aria-label="Test balance summary">
          <div className={styles.balanceTop}>
            <span className={styles.panelLabel}>Available to commit</span>
            <strong className={styles.balanceAmount}>{cents(balance.availableCents)}</strong>
            <div className={styles.balanceSubline}><strong>Test USD</strong></div>
          </div>
          <div className={styles.balanceBreakdown}>
            <div>
              <span>Reserved</span>
              <strong>{cents(balance.reservedCents)}</strong>
              <small>{activeMemberships.length} active</small>
            </div>
            <div>
              <span>Deposited</span>
              <strong>{cents(balance.totalDepositedCents)}</strong>
              <small>Test funds</small>
            </div>
          </div>
          <div className={styles.balanceActions}>
            <button type="button" onClick={() => setModal({ kind: "fund" })}>
              <Plus size={13} /> Add funds
            </button>
            <Link href="/wallet">
              Activity <ChevronRight size={12} />
            </Link>
          </div>
        </aside>

        <div className={styles.summaryStrip}>
          <SummaryMetric
            label="Active commitments"
            value={String(activeMemberships.length)}
            hint="Fully reserved"
          />
          <SummaryMetric
            label="Potential savings"
            value={cents(potentialSavings)}
            hint="At current price estimates"
          />
          <SummaryMetric
            label="Open intents"
            value={String(openIntentCount)}
            hint="Awaiting match"
          />
          <SummaryMetric
            label="Pools recruiting"
            value={String(pools.filter((pool) => pool.status === "forming").length)}
            hint="Fixed two-week windows"
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="active-pools-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="active-pools-title">Your active commitments</h2>
            <p>Every commitment is backed by a full-MSRP test reservation.</p>
          </div>
          <Link href="/orders">View all <ArrowRight size={11} /></Link>
        </div>
        {activeMemberships.length ? (
          <CommitmentList
            workspace={workspace}
            memberships={activeMemberships}
            setModal={setModal}
          />
        ) : (
          <EmptyState
            Icon={LockKeyhole}
            title="No money locked yet"
            description="Fund your test balance and join a forming pool. POOL will reserve the full MSRP and keep the exit cutoff explicit."
            actionLabel="Explore group buys"
            href="/explore"
          />
        )}
      </section>

      <section className={styles.section} aria-labelledby="popular-pools-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="popular-pools-title">Popular group buys</h2>
            <p>
              Each pool accepts every funded join through its two-week cutoff. The
              minimum only determines whether merchant bidding can open.
            </p>
          </div>
          <Link href="/explore">Discover all <ArrowRight size={11} /></Link>
        </div>
        <div className={styles.poolGrid}>
          {pools.slice(0, 3).map((pool, index) => (
            <PoolCard
              key={pool.id}
              workspace={workspace}
              pool={pool}
              featured={index === 0}
              setModal={setModal}
            />
          ))}
        </div>
      </section>

      {intents.length ? (
        <section className={styles.section} aria-labelledby="intent-list-title">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="intent-list-title">Your buying intents</h2>
              <p>Structured demand saved in this browser workspace.</p>
            </div>
            <button className={styles.quietButton} onClick={() => setModal({ kind: "intent" })}>
              <Plus size={12} /> Create another
            </button>
          </div>
          <IntentList workspace={workspace} />
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="recent-activity-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="recent-activity-title">Recent activity</h2>
            <p>Append-only events from this versioned product sandbox.</p>
          </div>
          <Link href="/wallet">Full ledger <ArrowRight size={11} /></Link>
        </div>
        <ActivityLedger activity={recentActivity} />
      </section>
    </>
  );
}

const agentStageLabels: Record<
  ProductIntentRun["trace"][number]["stage"],
  string
> = {
  natural_language: "Natural language",
  catalog_match: "Catalog match",
  mandate_checks: "Mandate checks",
  review: "Review",
};

function ProductAgentReceipt({
  run,
  onReview,
}: {
  run: ProductIntentRun;
  onReview?: () => void;
}) {
  const passedChecks = run.decision.checks.filter((check) => check.passed).length;
  const receiptStatus =
    run.status === "ready_for_review"
      ? "Ready for review"
      : run.status === "blocked"
        ? "Blocked safely"
        : "Needs clarification";

  return (
    <section
      className={classNames(
        styles.agentReceipt,
        run.status !== "ready_for_review" && styles.agentReceiptBlocked,
      )}
      aria-label="Buyer intent agent decision receipt"
    >
      <header className={styles.agentReceiptHeader}>
        <span>
          <Sparkles size={13} /> Decision receipt
        </span>
        <div>
          <strong>{receiptStatus}</strong>
          <small>
            {run.mode === "openai_responses"
              ? "Protected AI extraction"
              : "Deterministic catalog parser"}
          </small>
        </div>
      </header>

      <p className={styles.agentSource}>“{run.rawIntent}”</p>

      <ol className={styles.agentFlow}>
        {run.trace.map((step) => (
          <li key={step.stage} data-status={step.status} title={step.detail}>
            <span>{step.status === "blocked" ? "!" : step.status === "pending" ? "4" : "✓"}</span>
            <small>{agentStageLabels[step.stage]}</small>
          </li>
        ))}
      </ol>

      <div className={styles.agentMandateGrid}>
        <div>
          <span>Catalog match</span>
          <strong>
            {run.match
              ? `${run.match.productBrand} ${run.match.productName}`
              : "No single match"}
          </strong>
          <small>{run.match ? run.match.poolId : "Clarify the product"}</small>
        </div>
        <div>
          <span>Private mandate</span>
          <strong>
            {run.extraction.quantity ?? "—"} unit
            {run.extraction.quantity === 1 ? "" : "s"} ·{" "}
            {run.extraction.maxUnitPriceCents === null
              ? "no max"
              : `${cents(run.extraction.maxUnitPriceCents)} max`}
          </strong>
          <small>
            {run.extraction.patienceDays === null
              ? "Wait window missing"
              : `${run.extraction.patienceDays}-day patience window`}
          </small>
        </div>
        <div>
          <span>Mandate checks</span>
          <strong>
            {passedChecks}/{run.decision.checks.length} passed
          </strong>
          <small>
            {run.match
              ? `${cents(run.match.estimatedUnitPriceCents)} estimated pool price`
              : "No pool economics evaluated"}
          </small>
        </div>
        <div>
          <span>MSRP coverage if joined later</span>
          <strong>
            {run.decision.requiredMsrpCoverageCents === null
              ? "Not calculable"
              : cents(run.decision.requiredMsrpCoverageCents)}
          </strong>
          <small>Not requested during interpretation</small>
        </div>
      </div>

      {run.decision.clarifications.length ? (
        <ul className={styles.agentClarifications}>
          {run.decision.clarifications.map((clarification) => (
            <li key={clarification}>{clarification}</li>
          ))}
        </ul>
      ) : null}

      <footer className={styles.agentReceiptFooter}>
        <span>
          financialAuthorization: <strong>not_requested</strong> · interpretation
          moved <strong>$0</strong>
        </span>
        {onReview ? (
          <button type="button" onClick={onReview}>
            Review mandate <ArrowRight size={12} />
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className={styles.summaryMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function ExploreView({ workspace, pools, setModal }: SharedViewProps & { pools: ProductPool[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ProductCategory>("all");
  const [sort, setSort] = useState<"popular" | "savings" | "deadline">("popular");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...pools]
      .filter((pool) => {
        const product = workspace.products[pool.productId];
        return (
          product &&
          (category === "all" || product.category === category) &&
          (!normalizedQuery ||
            `${product.brand} ${product.name} ${product.description}`
              .toLowerCase()
              .includes(normalizedQuery))
        );
      })
      .sort((a, b) => {
        if (sort === "deadline") return Date.parse(a.cutoffAt) - Date.parse(b.cutoffAt);
        if (sort === "savings") {
          const productA = workspace.products[a.productId];
          const productB = workspace.products[b.productId];
          return (
            productB.msrpUnitCents -
            b.estimatedUnitPriceCents -
            (productA.msrpUnitCents - a.estimatedUnitPriceCents)
          );
        }
        return b.committedUnitCount - a.committedUnitCount;
      });
  }, [category, pools, query, sort, workspace.products]);

  return (
    <>
      <header className={styles.viewTitle}>
        <div>
          <span className={styles.pageEyebrow}>Sample market</span>
          <h1>Discover funded group buys.</h1>
          <p>
            Compare estimated prices, funded demand, and fixed two-week deadlines.
            Joining moves the full MSRP from available to reserved; every funded buyer
            can join until cutoff, even after the minimum is met.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => setModal({ kind: "intent" })}
        >
          <Sparkles size={15} /> Declare what you want
        </button>
      </header>

      <div className={styles.filterBar} aria-label="Group buy filters">
        <label className={styles.searchControl}>
          <Search size={15} />
          <span className="sr-only">Search group buys</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products or brands"
          />
        </label>
        <select
          className={styles.filterSelect}
          value={category}
          onChange={(event) => setCategory(event.target.value as "all" | ProductCategory)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          <option value="audio">Audio</option>
          <option value="gaming">Gaming</option>
          <option value="computing">Computing</option>
          <option value="home">Home</option>
        </select>
        <select
          className={styles.filterSelect}
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          aria-label="Sort group buys"
        >
          <option value="popular">Most committed</option>
          <option value="savings">Highest savings</option>
          <option value="deadline">Closing soon</option>
        </select>
      </div>

      {filtered.length ? (
        <div className={styles.exploreGrid}>
          {filtered.map((pool) => (
            <PoolCard
              key={pool.id}
              workspace={workspace}
              pool={pool}
              featured={pool.id === "pool-sony-xm6-august"}
              setModal={setModal}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          Icon={Search}
          title="No matching sample pools"
          description="Try a different category or declare a buying intent so POOL knows what demand to organize next."
          actionLabel="Create buying intent"
          onAction={() => setModal({ kind: "intent" })}
        />
      )}
    </>
  );
}

function PoolCard({
  workspace,
  pool,
  featured,
  setModal,
}: SharedViewProps & { pool: ProductPool; featured?: boolean }) {
  const now = useNow();
  const product = workspace.products[pool.productId];
  const membership = activeMembershipForPool(workspace, pool.id);
  const windowProgress = commitmentWindowProgress(pool, now);
  const windowDays = commitmentWindowDays(pool);
  const eligibility = poolEligibility(pool);
  const joinIsOpen = canLeavePool(pool, now);
  const savings = Math.max(0, product.msrpUnitCents - pool.estimatedUnitPriceCents);

  return (
    <article className={classNames(styles.poolCard, featured && styles.poolCardFeatured)}>
      <div className={styles.poolCardTop}>
        <ProductGlyph product={product} />
        <span className={styles.statusChip}>{statusLabel(pool)}</span>
      </div>
      <h3>
        <Link href={poolHref(pool)} aria-label={`Review ${product.brand} ${product.name} group-buy terms`}>
          {product.brand} {product.name}
        </Link>
      </h3>
      <p className={styles.poolSubtitle}>{product.description}</p>
      <div className={styles.priceRow}>
        <div>
          <span>Estimated group price</span>
          <strong>{cents(pool.estimatedUnitPriceCents)}</strong>
          <small>MSRP {cents(product.msrpUnitCents)}</small>
        </div>
        <small className={styles.savingsText}>
          {cents(savings)}
          <br />potential savings
        </small>
      </div>
      <div className={styles.progressBlock}>
        <div className={styles.progressCopy}>
          <span><strong>{pool.committedUnitCount}</strong> funded units</span>
          <span className={eligibility.eligible ? styles.eligibilityMet : undefined}>
            {eligibility.label}
          </span>
        </div>
        <div
          className={styles.progressTrack}
          aria-label={`${Math.round(windowProgress)}% of the ${windowDays}-day commitment window elapsed`}
        >
          <span style={{ width: `${windowProgress}%` }} />
        </div>
        <div className={styles.windowCopy}>
          <span>{windowDays}-day commitment window</span>
          <span>Closes {shortDate.format(new Date(pool.cutoffAt))}</span>
        </div>
      </div>
      <div className={styles.poolCardFooter}>
        <span><Clock3 size={11} /> No enrollment cap before cutoff</span>
        {membership ? (
          <Link className={classNames(styles.cardAction, styles.cardActionJoined)} href={poolHref(pool)}>
            View <ChevronRight size={11} />
          </Link>
        ) : (
          <button
            type="button"
            className={styles.cardAction}
            disabled={!joinIsOpen}
            onClick={() => setModal({ kind: "join", poolId: pool.id })}
          >
            {joinIsOpen ? "Reserve & join" : "Window closed"}{" "}
            <ChevronRight size={11} />
          </button>
        )}
      </div>
    </article>
  );
}

function CommitmentList({
  workspace,
  memberships,
  setModal,
}: SharedViewProps & { memberships: PoolMembership[] }) {
  const now = useNow();
  return (
    <div className={styles.commitmentList}>
      {memberships.map((membership) => {
        const pool = workspace.pools[membership.poolId];
        const product = productForMembership(workspace, membership);
        if (!pool || !product) return null;
        const marketIsOpen = canRunMarket(pool, now);
        const marketPhase = marketWindowPhase(pool, now);
        const cutoffLabel = shortDate.format(new Date(pool.cutoffAt));
        return (
          <div className={styles.commitmentRow} key={membership.id}>
            <div className={styles.rowIdentity}>
              <ProductGlyph product={product} size={17} />
              <div>
                <strong>{product.brand} {product.name}</strong>
                <small>{membership.quantity} unit{membership.quantity === 1 ? "" : "s"} · {statusLabel(pool)}</small>
              </div>
            </div>
            <div className={styles.rowMetric}>
              <span>Reserved</span>
              <strong>{cents(membership.reservedCents)}</strong>
            </div>
            <div className={styles.rowMetric}>
              <span>Funded demand</span>
              <strong>{pool.committedUnitCount} units · {poolEligibility(pool).label}</strong>
            </div>
            <div className={styles.rowMetric}>
              <span>Two-week cutoff</span>
              <strong>{shortDate.format(new Date(pool.cutoffAt))}</strong>
            </div>
            <div className={styles.rowAction}>
              <Link href={poolHref(pool)}>Details</Link>
              {membership.status === "active" ? (
                marketIsOpen ? (
                  <button type="button" onClick={() => setModal({ kind: "settle", membershipId: membership.id })}>
                    Run market
                  </button>
                ) : marketPhase === "closed" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setModal({ kind: "settle", membershipId: membership.id })
                    }
                  >
                    Resolve missed window
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title={`Merchant bidding opens after ${cutoffLabel}`}
                  >
                    Bidding opens {cutoffLabel}
                  </button>
                )
              ) : null}
              {canLeavePool(pool, now) && membership.status === "active" ? (
                <button type="button" onClick={() => setModal({ kind: "leave", membershipId: membership.id })}>
                  Leave
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IntentList({ workspace }: { workspace: ProductWorkspace }) {
  return (
    <div className={styles.intentList}>
      {Object.values(workspace.intents)
        .slice()
        .reverse()
        .map((intent) => {
          const product = workspace.products[intent.productId];
          return (
            <div className={styles.intentItem} key={intent.id}>
              <div className={styles.intentDescription}>
                <strong>{product.brand} {product.name}</strong>
                <small>Created {shortDateTime.format(new Date(intent.createdAt))}</small>
              </div>
              <div className={styles.rowMetric}>
                <span>Quantity</span>
                <strong>{intent.quantity}</strong>
              </div>
              <div className={styles.rowMetric}>
                <span>Max price</span>
                <strong>{cents(intent.targetUnitPriceCents)}</strong>
              </div>
              <div className={styles.rowMetric}>
                <span>Valid until</span>
                <strong>{shortDate.format(new Date(intent.expiresAt))}</strong>
              </div>
              <span className={styles.intentState}>{intent.status}</span>
            </div>
          );
        })}
    </div>
  );
}

function WalletView({ workspace, balance, setModal }: SharedViewProps & {
  balance: ProductWorkspace["balances"][string];
}) {
  const activity = [...workspace.activity].reverse();
  return (
    <>
      <header className={styles.viewTitle}>
        <div>
          <span className={styles.pageEyebrow}>Test balance</span>
          <h1>Know what is free and what is committed.</h1>
          <p>
            This browser-local ledger makes the funding rule tangible. It is not a bank
            account, stored value, stablecoin wallet, or insured deposit.
          </p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => setModal({ kind: "fund" })}>
          <Plus size={15} /> Add test funds
        </button>
      </header>

      <section className={styles.walletHero} aria-label="Sandbox balance">
        <div className={styles.walletMain}>
          <span>Total test balance</span>
          <strong>{cents(balance.totalDepositedCents)}</strong>
          <small>Version {workspace.schemaVersion} · saved only on this device</small>
        </div>
        <div className={styles.walletMetric}>
          <span>Available</span>
          <strong>{cents(balance.availableCents)}</strong>
          <small>Can be committed</small>
        </div>
        <div className={styles.walletMetric}>
          <span>Reserved</span>
          <strong>{cents(balance.reservedCents)}</strong>
          <small>Locked by active pools</small>
        </div>
        <div className={styles.walletMetric}>
          <span>Captured</span>
          <strong>{cents(balance.capturedCents)}</strong>
          <small>Spent by settled orders</small>
        </div>
      </section>

      <section className={styles.walletHero} aria-label="Payment rail capacity">
        <div className={styles.walletMain}>
          <span>
            {workspace.treasury.source === "rain-sandbox"
              ? "Shared Rain sandbox team capacity — not buyer funds"
              : "Offline ceiling (Rain unavailable)"}
          </span>
          <strong>{cents(workspace.treasury.spendingPowerCents)}</strong>
          <small>
            {workspace.treasury.source === "rain-sandbox"
              ? `Read-only provider ceiling from GET /issuing/balances${
                  workspace.treasury.syncedAt
                    ? ` · read ${shortDate.format(new Date(workspace.treasury.syncedAt))}`
                    : ""
                }`
              : "Labeled local fixture · not a Rain figure"}
          </small>
        </div>
        <div className={styles.walletMetric}>
          <span>Shared rail credit limit</span>
          <strong>{cents(workspace.treasury.creditLimitCents)}</strong>
          <small>Total sandbox capacity</small>
        </div>
        <div className={styles.walletMetric}>
          <span>Shared rail posted charges</span>
          <strong>{cents(workspace.treasury.postedChargesCents)}</strong>
          <small>Settled on the rail</small>
        </div>
      </section>

      <div className={styles.walletDisclosure}>
        <Info size={15} />
        <span>
          {workspace.treasury.source === "rain-sandbox" ? (
            <>
              <strong>Capacity reference only:</strong> this shared team sandbox figure is
              not buyer custody, backing, or an available balance. POOL uses it only as a
              conservative ceiling on browser-local test credits. Reading that ceiling is
              the only Rain call the product workspace makes — no card, ACH, wire, crypto,
              or Monad transaction occurs here, and no real money moves.
            </>
          ) : (
            <>
              <strong>Product sandbox:</strong> Rain is unreachable or locked, so “Add funds”
              is bounded by a labeled local ceiling. No ACH, card, wire, crypto, Rain, or
              Monad transaction occurs on this surface.
            </>
          )}
        </span>
      </div>

      <section className={styles.section} aria-labelledby="ledger-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="ledger-title">Activity ledger</h2>
            <p>Deposits, intent creation, reservations, and releases in revision order.</p>
          </div>
          <button className={styles.quietButton} type="button" onClick={() => setModal({ kind: "reset" })}>
            <RefreshCcw size={12} /> Reset sandbox
          </button>
        </div>
        <ActivityLedger activity={activity} />
      </section>
    </>
  );
}

function ActivityLedger({ activity }: { activity: ProductActivityEntry[] }) {
  return (
    <div className={styles.ledger}>
      <div className={styles.ledgerHeader}>
        <span>Event</span>
        <span>Date</span>
        <span>Available impact</span>
        <span>Revision</span>
      </div>
      {activity.map((entry) => {
        const Icon = activityIcon(entry);
        const impact = activityImpact(entry);
        return (
          <div className={styles.ledgerRow} key={entry.id}>
            <div className={styles.ledgerEvent}>
              <span className={styles.ledgerIcon}><Icon size={13} /></span>
              <div>
                <strong>{entry.summary}</strong>
                <small>{entry.kind.replaceAll(".", " · ")}</small>
              </div>
            </div>
            <span className={styles.ledgerDate}>{shortDateTime.format(new Date(entry.at))}</span>
            <span className={impact >= 0 ? styles.moneyPositive : styles.moneyNegative}>
              {impact === 0 ? "—" : `${impact > 0 ? "+" : "−"}${cents(Math.abs(impact))}`}
            </span>
            <span className={styles.ledgerBalance}>REV {String(entry.workspaceRevision).padStart(3, "0")}</span>
          </div>
        );
      })}
    </div>
  );
}

function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className={styles.phoneFrame} aria-label={label}>
      <div className={styles.phoneIsland} />
      <div className={styles.phoneStatus}><span>9:41</span><span>● ᯤ ▰</span></div>
      <div className={styles.phoneScreen}>{children}</div>
    </div>
  );
}

function PhoneBrand({ title }: { title?: string }) {
  return (
    <div className={styles.phoneBrand}>
      <span className={styles.phonePool}><BrandMark /> POOL</span>
      {title ? <strong>{title}</strong> : <span className={styles.phoneAvatar}>AM</span>}
    </div>
  );
}

function PhoneTabs({ active }: { active: "home" | "discover" | "wallet" }) {
  return (
    <div className={styles.phoneTabs}>
      <span className={active === "home" ? styles.phoneTabActive : undefined}><Home size={15} />Home</span>
      <span className={active === "discover" ? styles.phoneTabActive : undefined}><Compass size={15} />Discover</span>
      <span className={active === "wallet" ? styles.phoneTabActive : undefined}><WalletCards size={15} />Wallet</span>
    </div>
  );
}

function BetaView({ workspace }: { workspace: ProductWorkspace }) {
  const now = useNow();
  const pools = Object.values(workspace.pools);
  const featuredPool = workspace.pools["pool-sony-xm6-august"] ?? pools[0];
  const featuredProduct = featuredPool
    ? workspace.products[featuredPool.productId]
    : undefined;
  const commitmentPool =
    workspace.pools["pool-steam-deck-oled-august"] ?? pools[1] ?? featuredPool;
  const commitmentProduct = commitmentPool
    ? workspace.products[commitmentPool.productId]
    : undefined;
  const balance = workspace.balances[workspace.owner.id];

  if (!featuredPool || !featuredProduct || !commitmentPool || !commitmentProduct) {
    return null;
  }

  const windowDays = commitmentWindowDays(featuredPool);
  const windowProgress = commitmentWindowProgress(featuredPool, now);
  const eligibility = poolEligibility(featuredPool);
  const previewPools = pools.slice(0, 3);
  const featuredMembership = Object.values(workspace.memberships).find(
    (membership) =>
      membership.poolId === featuredPool.id && membership.status === "active",
  );
  const FeaturedIcon = categoryMeta[featuredProduct.category].Icon;
  const CommitmentIcon = categoryMeta[commitmentProduct.category].Icon;

  return (
    <div className={styles.betaPage}>
      <section className={styles.betaHero}>
        <div className={styles.betaHeroCopy}>
          <span className={styles.betaBadge}><span /> Mobile preview</span>
          <h1>Coming soon<br />{" "}to <em>mobile.</em></h1>
          <p>Patient purchasing with fixed windows, fully funded commitments, and no enrollment caps.</p>
          <a href="#mobile-preview" className={styles.betaCta}>Preview the app <ArrowRight size={15} /></a>
        </div>
        <div className={styles.betaHeroPhones}>
          <PhoneFrame label="POOL mobile discover screen">
            <PhoneBrand />
            <div className={styles.phoneGreeting}><small>GOOD AFTERNOON, ALEX</small><h3>Find your next<br /><em>better price.</em></h3></div>
            <div className={styles.phoneSearch}><Search size={13} /> What are you looking for?</div>
            <div className={styles.phoneSectionTitle}><strong>Popular pools</strong><span>See all</span></div>
            <div className={styles.phoneProductCard}>
              <span className={styles.phoneProductIcon}><FeaturedIcon size={28} /></span>
              <small>{featuredProduct.brand.toUpperCase()}</small><strong>{featuredProduct.name}</strong>
              <div><b>{compactCents(featuredPool.estimatedUnitPriceCents)}</b><span>{featuredPool.committedUnitCount} funded units</span></div>
            </div>
            <PhoneTabs active="home" />
          </PhoneFrame>
          <PhoneFrame
            label={
              featuredMembership
                ? "POOL mobile active commitment screen"
                : "POOL mobile commitment preview screen"
            }
          >
            <PhoneBrand title={featuredMembership ? "Active pool" : "Pool preview"} />
            <div className={styles.phoneCommitHero}><span><FeaturedIcon size={40} /></span><small>{featuredProduct.brand.toUpperCase()}</small><h3>{featuredProduct.name}</h3><p>{featuredProduct.description}</p></div>
            <div className={styles.phoneProgress}>
              <div><strong>{featuredPool.committedUnitCount}</strong><span>funded units</span></div>
              <div><strong>{compactCents(featuredPool.estimatedUnitPriceCents)}</strong><span>estimated price</span></div>
              <i aria-label={`${Math.round(windowProgress)}% of the ${windowDays}-day commitment window elapsed`}>
                <b style={{ width: `${windowProgress}%` }} />
              </i>
              <small>{Math.round(windowProgress)}% of {windowDays}-day window elapsed · {featuredPool.minimumCommittedUnitCount}-unit eligibility floor {eligibility.eligible ? "met" : "pending"} · no enrollment cap</small>
            </div>
            <div className={styles.phoneReserve}>
              <span>{featuredMembership ? "YOUR COMMITMENT" : "EXAMPLE COMMITMENT"}</span>
              <strong>
                {featuredMembership
                  ? `${cents(featuredMembership.reservedCents)} reserved`
                  : `${cents(featuredProduct.msrpUnitCents)} full-MSRP coverage`}
              </strong>
              <small>
                {featuredMembership
                  ? `Release available until ${shortDate.format(new Date(featuredPool.cutoffAt))}`
                  : "Review before reserving · no funds are locked in this preview"}
              </small>
            </div>
            <Link className={styles.phoneButton} href={poolHref(featuredPool)}>
              {featuredMembership ? "View commitment" : "Review group buy"} <ChevronRight size={13} />
            </Link>
            <PhoneTabs active="discover" />
          </PhoneFrame>
        </div>
      </section>

      <section className={styles.betaStatement}>
        <span>POOL IN YOUR POCKET</span>
        <h2>Discover together.<br />Commit with confidence.</h2>
      </section>

      <section className={styles.betaFeature} id="mobile-preview">
        <div className={styles.betaFeatureCopy}><span>01 · DISCOVER</span><h2>See the buying power building.</h2><p>Browse active pools, compare estimated prices and funded units, and see the eligibility floor without mistaking it for a cap.</p></div>
        <PhoneFrame label="POOL mobile pool discovery list">
          <PhoneBrand title="Discover" />
          <div className={styles.phoneSearch}><Search size={13} /> Search products</div>
          <div className={styles.phoneChips}><b>For you</b><span>Audio</span><span>Gaming</span></div>
          {previewPools.map((pool) => {
            const product = workspace.products[pool.productId];
            if (!product) return null;
            const ItemIcon = categoryMeta[product.category].Icon;
            return <div className={styles.phoneListItem} key={pool.id}><span><ItemIcon size={20} /></span><div><small>{statusLabel(pool).toUpperCase()}</small><strong>{product.brand} {product.name}</strong><p>{pool.committedUnitCount} funded units · {pool.minimumCommittedUnitCount}-unit floor</p></div><b>{compactCents(pool.estimatedUnitPriceCents)}</b></div>;
          })}
          <PhoneTabs active="discover" />
        </PhoneFrame>
      </section>

      <section className={classNames(styles.betaFeature, styles.betaFeatureReverse)}>
        <PhoneFrame label="POOL mobile commitment confirmation">
          <PhoneBrand title="Join pool" />
          <div className={styles.phoneCommitHero}><span><CommitmentIcon size={38} /></span><small>{commitmentProduct.brand.toUpperCase()}</small><h3>{commitmentProduct.name}</h3><p>{commitmentProduct.description}</p></div>
          <div className={styles.phoneJoinFacts}><div><span>Reserve today</span><strong>{cents(commitmentProduct.msrpUnitCents)}</strong></div><div><span>Estimated price</span><strong>{cents(commitmentPool.estimatedUnitPriceCents)}</strong></div><div><span>Exit cutoff</span><strong>{shortDate.format(new Date(commitmentPool.cutoffAt))}</strong></div></div>
          <div className={styles.phoneFine}><ShieldCheck size={15} /><span>Your full amount is reserved. You can leave before the cutoff.</span></div>
          <Link className={styles.phoneButton} href={poolHref(commitmentPool)}>
            Review {cents(commitmentProduct.msrpUnitCents)} reservation
          </Link>
          <PhoneTabs active="discover" />
        </PhoneFrame>
        <div className={styles.betaFeatureCopy}><span>02 · COMMIT</span><h2>Every number, clear before you join.</h2><p>Estimated price, reserved amount, eligibility floor, and exit date stay visible—no checkout surprises.</p></div>
      </section>

      <section className={styles.betaFeature}>
        <div className={styles.betaFeatureCopy}><span>03 · TRACK</span><h2>Your purchasing power, at a glance.</h2><p>Follow reserved funds and active commitments without digging through transaction history.</p></div>
        <PhoneFrame label="POOL mobile wallet screen">
          <PhoneBrand title="Wallet" />
          <div className={styles.phoneWallet}><small>AVAILABLE TO COMMIT</small><strong>{cents(balance?.availableCents ?? 0)}</strong><Link className={styles.phoneWalletAction} href="/wallet"><Plus size={12} /> Add test funds</Link></div>
          <div className={styles.phoneWalletStats}><div><span>Reserved</span><strong>{cents(balance?.reservedCents ?? 0)}</strong></div><div><span>Captured</span><strong>{cents(balance?.capturedCents ?? 0)}</strong></div></div>
          <div className={styles.phoneSectionTitle}><strong>Recent activity</strong><span>View all</span></div>
          <div className={styles.phoneActivity}><span><LockKeyhole size={15} /></span><div><strong>Fixed-window policy</strong><small>{windowDays} days · no enrollment cap</small></div><b>ON</b></div>
          <div className={styles.phoneActivity}><span><ArrowDownLeft size={15} /></span><div><strong>Product sandbox</strong><small>Local fixture · no real money</small></div><b>REV {workspace.revision}</b></div>
          <PhoneTabs active="wallet" />
        </PhoneFrame>
      </section>

      <section className={styles.betaFooter}><span><BrandMark /> POOL MOBILE</span><h2>Worth the wait.</h2><p>The POOL mobile experience is coming soon.</p><Link href="/explore">Explore today’s pools <ArrowRight size={14} /></Link></section>
    </div>
  );
}

function OrdersView({ workspace, activeMemberships, setModal }: SharedViewProps & {
  activeMemberships: PoolMembership[];
}) {
  const resolvedMemberships = Object.values(workspace.memberships).filter(
    (membership) =>
      membership.status === "left" || membership.status === "released",
  );
  return (
    <>
      <header className={styles.viewTitle}>
        <div>
          <span className={styles.pageEyebrow}>Commitments & orders</span>
          <h1>Your purchases, from commitment to delivery.</h1>
        </div>
        <Link href="/explore" className={styles.primaryButton}>
          <Compass size={15} /> Find a group buy
        </Link>
      </header>

      <section aria-labelledby="current-commitments-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="current-commitments-title">Current commitments</h2>
            <p>
              Every funded buyer can join or release during the two-week window. Meeting
              the minimum never closes enrollment early.
            </p>
          </div>
        </div>
        {activeMemberships.length ? (
          <CommitmentList
            workspace={workspace}
            memberships={activeMemberships}
            setModal={setModal}
          />
        ) : (
          <EmptyState
            Icon={ShoppingBag}
            title="No active commitments"
            description="Join a sample group buy to reserve MSRP and see the commitment appear here."
            actionLabel="Discover pools"
            href="/explore"
          />
        )}
      </section>

      <section className={styles.section} aria-labelledby="resolved-orders-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="resolved-orders-title">Resolved orders</h2>
            <p>No production orders are created by this browser sandbox.</p>
          </div>
          <Link href="/demo">See settlement proof <ExternalLink size={10} /></Link>
        </div>
        <div className={styles.orderList}>
          {resolvedMemberships.length ? (
            resolvedMemberships.map((membership) => {
              const product = productForMembership(workspace, membership);
              if (!product) return null;
              const outcomeRelease = membership.release;
              return (
                <div className={styles.orderCard} key={membership.id}>
                  <div className={styles.rowIdentity}>
                    <ProductGlyph product={product} size={17} />
                    <div>
                      <strong>{product.brand} {product.name}</strong>
                      <small>
                        {outcomeRelease
                          ? outcomeRelease.reason === "minimum_not_met"
                            ? "Window closed below the funded minimum"
                            : outcomeRelease.reason === "no_acceptable_offer"
                              ? "No acceptable merchant offer"
                              : outcomeRelease.reason === "authorization_declined"
                                ? "Purchase authorization declined"
                                : "Execution window expired without provider access"
                          : "Commitment closed before cutoff"}
                      </small>
                    </div>
                  </div>
                  <div className={styles.rowMetric}>
                    <span>Released</span>
                    <strong>{cents(membership.reservedCents)}</strong>
                  </div>
                  <div className={styles.rowMetric}>
                    <span>Closed</span>
                    <strong>
                      {outcomeRelease
                        ? shortDate.format(new Date(outcomeRelease.releasedAt))
                        : membership.leftAt
                          ? shortDate.format(new Date(membership.leftAt))
                          : "—"}
                    </strong>
                  </div>
                  <span className={styles.orderStatus}>Released</span>
                </div>
              );
            })
          ) : (
            <EmptyState
              Icon={PackageCheck}
              title="No resolved product orders yet"
              description="The product workspace does not fabricate purchases. Use the technical walkthrough to inspect a complete simulated negotiation and sandbox settlement."
              actionLabel="Open technical proof"
              href="/demo"
            />
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="lifecycle-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="lifecycle-title">What happens when the two-week window closes?</h2>
            <p>The production deliverable follows an explicit, failure-aware order lifecycle.</p>
          </div>
        </div>
        <div className={styles.detailPanel}>
          <div className={styles.termsList}>
            {[
              ["01", "The window closes", "All funded commitments submitted by the published cutoff form the final demand."],
              ["02", "Eligibility is checked", "A 10-unit minimum opens merchant bidding; it is never a target or enrollment cap."],
              ["03", "Merchants compete", "Qualified sellers bid privately for the complete funded order."],
              ["04", "Winner is verified", "Price, inventory, delivery, and buyer policy must all pass."],
              ["05", "Capture and release", "Only the winning price is captured; the difference returns as savings."],
              ["06", "Fulfillment", "Production orders require shipping, returns, disputes, and reconciliation."],
            ].map(([step, title, detail]) => (
              <div className={styles.termRow} key={step}>
                <span>{step}</span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function PoolDetailView({ workspace, poolId, setModal }: SharedViewProps & { poolId?: string }) {
  // Called before the early return so hook order stays stable across renders.
  const now = useNow();
  const pool = poolId ? workspace.pools[poolId] : undefined;
  if (!pool) {
    return (
      <EmptyState
        Icon={Compass}
        title="That sample pool was not found"
        description="It may belong to a different product workspace version. Browse the current group buys instead."
        actionLabel="Back to discover"
        href="/explore"
      />
    );
  }
  const product = workspace.products[pool.productId];
  const membership = activeMembershipForPool(workspace, pool.id);
  const settledMembership = Object.values(workspace.memberships).find(
    (entry) => entry.poolId === pool.id && entry.status === "settled",
  );
  const releasedMembership = Object.values(workspace.memberships).find(
    (entry) => entry.poolId === pool.id && entry.status === "released",
  );
  const windowProgress = commitmentWindowProgress(pool, now);
  const windowDays = commitmentWindowDays(pool);
  const eligibility = poolEligibility(pool);
  const marketIsOpen = canRunMarket(pool, now);
  const marketPhase = marketWindowPhase(pool, now);
  const leaveIsOpen = canLeavePool(pool, now);
  const cutoffLabel = shortDate.format(new Date(pool.cutoffAt));
  const savings = product.msrpUnitCents - pool.estimatedUnitPriceCents;
  const balance = workspace.balances[workspace.owner.id];
  return (
    <>
      <Link href="/explore" className={styles.quietButton}>
        <ArrowRight size={12} style={{ transform: "rotate(180deg)" }} /> Back to discover
      </Link>
      <section className={styles.poolDetailHero}>
        <div className={styles.poolDetailTop}>
          <div>
            <span className={styles.statusChip}>{statusLabel(pool)} · Product sandbox</span>
            <h1>{product.brand} {product.name}</h1>
            <p>
              {product.description} Funded commitments remain open for the full
              two-week window. The displayed price is a non-binding pool target until
              a qualified merchant offer wins.
            </p>
          </div>
          <div className={styles.poolDetailAction}>
            {membership ? (
              <>
                {marketIsOpen ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => setModal({ kind: "settle", membershipId: membership.id })}
                  >
                    <Zap size={14} /> Run the market
                  </button>
                ) : marketPhase === "closed" ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() =>
                      setModal({ kind: "settle", membershipId: membership.id })
                    }
                  >
                    <RefreshCcw size={14} /> Resolve missed window
                  </button>
                ) : (
                  <button className={styles.secondaryButton} type="button" disabled>
                    <Clock3 size={14} />
                    Bidding opens {cutoffLabel}
                  </button>
                )}
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={!leaveIsOpen}
                  onClick={() => setModal({ kind: "leave", membershipId: membership.id })}
                >
                  Release commitment
                </button>
              </>
            ) : settledMembership ? (
              <button className={styles.secondaryButton} type="button" disabled>
                Order settled
              </button>
            ) : releasedMembership ? (
              <button className={styles.secondaryButton} type="button" disabled>
                Reservation released
              </button>
            ) : (
              <button
                className={styles.primaryButton}
                type="button"
                disabled={pool.status !== "forming" || !leaveIsOpen}
                onClick={() => setModal({ kind: "join", poolId: pool.id })}
              >
                Reserve {cents(product.msrpUnitCents)} & join
              </button>
            )}
            <small>
              {membership
                ? marketIsOpen
                  ? "The commitment window is closed. Final demand can now enter sealed merchant bidding."
                  : marketPhase === "closed"
                    ? "The one-hour bid window has closed. The reservation remains locked pending an explicit resolution."
                    : `Merchant bidding opens only after the window closes on ${cutoffLabel}. You can leave before then.`
                : settledMembership
                  ? `Captured ${cents(settledMembership.settlement?.capturedCents ?? 0)} · released ${cents(settledMembership.settlement?.releasedCents ?? 0)}.`
                  : releasedMembership?.release
                    ? `${cents(releasedMembership.release.releasedCents)} returned after the no-purchase outcome.`
                  : `${cents(balance.availableCents)} currently available.`}
            </small>
          </div>
        </div>
        <div className={styles.poolFacts}>
          <PoolFact label="MSRP reserved" value={cents(product.msrpUnitCents)} hint="Per unit" />
          <PoolFact label="Target price" value={cents(pool.estimatedUnitPriceCents)} hint="Not a binding offer" />
          <PoolFact label="Potential savings" value={cents(savings)} hint={`${Math.round((savings / product.msrpUnitCents) * 100)}% per unit`} />
          <PoolFact label="Funded demand" value={`${pool.committedUnitCount} units`} hint={eligibility.label} />
          <PoolFact label="Pool closes" value={shortDate.format(new Date(pool.cutoffAt))} hint={`${windowDays}-day window · no cap`} />
        </div>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.detailPanel}>
          <div className={styles.detailPanelHeader}>
            <strong>Commitment terms</strong>
            <span>Review before joining</span>
          </div>
          <div className={styles.termsList}>
            {[
              ["01", "Full MSRP coverage", `${cents(product.msrpUnitCents)} per unit moves from available to reserved.`],
              ["02", "Open for two weeks", `Join or leave before ${shortDate.format(new Date(pool.cutoffAt))}; meeting the minimum never closes the pool early.`],
              ["03", "Minimum for eligibility", `${pool.minimumCommittedUnitCount} funded units are required to open bidding, but there is no enrollment target or cap.`],
              ["04", "Frozen during competition", "After cutoff, final funded demand remains locked while merchants submit sealed offers."],
              ["05", "No acceptable offer, no purchase", "POOL releases the full reservation if the pool cannot resolve within policy."],
              ["06", "Savings only after settlement", "The MSRP-to-winning-price difference becomes available after capture reconciles."],
            ].map(([step, title, detail]) => (
              <div className={styles.termRow} key={step}>
                <span>{step}</span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </div>
            ))}
          </div>
        </section>
        <aside className={styles.detailPanel}>
          <div className={styles.detailPanelHeader}>
            <strong>Two-week buying window</strong>
            <span>More funded demand can keep joining</span>
          </div>
          <div className={styles.pressureBody}>
            <div className={styles.pressureNumber}>
              <strong>{pool.committedUnitCount}</strong>
              <span>funded units so far · no enrollment cap</span>
            </div>
            <div className={styles.progressBlock}>
              <div className={styles.progressCopy}>
                <span><strong>{windowDays} days</strong> to collect funded demand</span>
                <span>{Math.round(windowProgress)}% elapsed</span>
              </div>
              <div
                className={styles.progressTrack}
                aria-label={`${Math.round(windowProgress)}% of the ${windowDays}-day commitment window elapsed`}
              >
                <span style={{ width: `${windowProgress}%` }} />
              </div>
              <div className={styles.windowCopy}>
                <span>Opened {shortDate.format(new Date(pool.createdAt))}</span>
                <span>Closes {shortDate.format(new Date(pool.cutoffAt))}</span>
              </div>
            </div>
            <div className={classNames(styles.windowEligibility, eligibility.eligible && styles.windowEligibilityMet)}>
              <span>{eligibility.eligible ? "Eligible for merchant bidding" : "Not eligible yet"}</span>
              <strong>{eligibility.label}</strong>
              <p>
                The minimum decides whether bidding opens after cutoff. It does not
                stop additional funded buyers from joining during the window.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function PoolFact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={styles.poolFact}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function EmptyState({
  Icon,
  title,
  description,
  actionLabel,
  href,
  onAction,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.emptyState}>
      <div>
        <span className={styles.emptyIcon}><Icon size={20} /></span>
        <h3>{title}</h3>
        <p>{description}</p>
        {href ? (
          <Link className={styles.primaryButton} href={href}>{actionLabel} <ArrowRight size={12} /></Link>
        ) : (
          <button className={styles.primaryButton} type="button" onClick={onAction}>{actionLabel} <ArrowRight size={12} /></button>
        )}
      </div>
    </div>
  );
}

function ProductModal({
  modal,
  workspace,
  closeButtonRef,
  setModal,
  setWorkspace,
  setToast,
  showError,
  resetWorkspace,
}: {
  modal: Exclude<ModalState, null>;
  workspace: ProductWorkspace;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  setModal: (modal: ModalState) => void;
  setWorkspace: (workspace: ProductWorkspace) => void;
  setToast: (toast: string | null) => void;
  showError: (error: unknown) => void;
  resetWorkspace: () => void;
}) {
  const titles: Record<Exclude<ModalState, null>["kind"], [string, string]> = {
    fund: ["Product sandbox", "Add test funds"],
    intent: ["Buying mandate", "Structure your intent"],
    join: ["Full-MSRP commitment", "Reserve funds and join"],
    leave: ["Before-cutoff exit", "Release your commitment"],
    settle: ["Sealed merchant market", "Run the market"],
    reset: ["Local workspace", "Reset product sandbox"],
  };
  const [eyebrow, title] = titles[modal.kind];

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModal(null);
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
      >
        <header className={styles.modalHeader}>
          <div>
            <span>{eyebrow}</span>
            <strong id="product-modal-title">{title}</strong>
          </div>
          <button ref={closeButtonRef} type="button" onClick={() => setModal(null)} aria-label="Close dialog">
            <X size={15} />
          </button>
        </header>
        {modal.kind === "fund" ? (
          <FundForm
            workspace={workspace}
            suggestedCents={modal.suggestedCents}
            setWorkspace={setWorkspace}
            setModal={setModal}
            setToast={setToast}
            showError={showError}
          />
        ) : null}
        {modal.kind === "intent" ? (
          <IntentForm
            workspace={workspace}
            initialProductId={modal.productId}
            quickText={modal.quickText}
            decisionReceipt={modal.decisionReceipt}
            setWorkspace={setWorkspace}
            setModal={setModal}
            setToast={setToast}
            showError={showError}
          />
        ) : null}
        {modal.kind === "join" ? (
          <JoinForm
            workspace={workspace}
            poolId={modal.poolId}
            setWorkspace={setWorkspace}
            setModal={setModal}
            setToast={setToast}
            showError={showError}
          />
        ) : null}
        {modal.kind === "leave" ? (
          <LeaveForm
            workspace={workspace}
            membershipId={modal.membershipId}
            setWorkspace={setWorkspace}
            setModal={setModal}
            setToast={setToast}
            showError={showError}
          />
        ) : null}
        {modal.kind === "settle" ? (
          <SettleForm
            workspace={workspace}
            membershipId={modal.membershipId}
            setWorkspace={setWorkspace}
            setModal={setModal}
            setToast={setToast}
            showError={showError}
          />
        ) : null}
        {modal.kind === "reset" ? (
          <>
            <div className={styles.modalBody}>
              <p className={styles.modalIntro}>
                This clears test funds, intents, commitments, and local activity on this
                device. No Rain, Monad, bank, card, or crypto operation will run.
              </p>
              <div className={styles.ruleBox}>
                <RefreshCcw size={15} />
                <span>The sandbox is recoverable only by rebuilding the interactions.</span>
              </div>
            </div>
            <footer className={styles.modalFooter}>
              <button className={styles.secondaryButton} type="button" onClick={() => setModal(null)}>Keep workspace</button>
              <button className={styles.dangerButton} type="button" onClick={resetWorkspace}>Reset sandbox</button>
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}

type ModalFormProps = {
  workspace: ProductWorkspace;
  setWorkspace: (workspace: ProductWorkspace) => void;
  setModal: (modal: ModalState) => void;
  setToast: (toast: string | null) => void;
  showError: (error: unknown) => void;
};

function FundForm({
  workspace,
  suggestedCents,
  setWorkspace,
  setModal,
  setToast,
  showError,
}: ModalFormProps & { suggestedCents?: number }) {
  const [amount, setAmount] = useState(
    suggestedCents ? (suggestedCents / 100).toFixed(2) : "500.00",
  );
  const treasury = workspace.treasury;
  const creditedCents = Object.values(workspace.balances).reduce(
    (sum, entry) => sum + entry.totalDepositedCents,
    0,
  );
  const headroomCents = Math.max(0, treasury.spendingPowerCents - creditedCents);
  const fromRain = treasury.source === "rain-sandbox";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    try {
      const next = reduceProductWorkspace(workspace, {
        type: "sandbox/deposit",
        buyerId: workspace.owner.id,
        amountCents,
        activityId: createId("activity-deposit"),
        at: new Date().toISOString(),
      });
      setWorkspace(next);
      setModal(null);
      setToast(`${cents(amountCents)} in test funds is now available to commit.`);
    } catch (error) {
      showError(error);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className={styles.modalBody}>
        <p className={styles.modalIntro}>
          Credit this workspace to exercise POOL’s funding and reservation rules.
          {fromRain
            ? " For demo hygiene, local credits are capped by a read-only shared Rain sandbox ceiling; they are not funded or backed by Rain."
            : " Rain is unavailable, so a labeled offline ceiling applies."}
          {" "}This does not move real money.
        </p>
        <div className={styles.field}>
          <label htmlFor="fund-amount">Amount in test USD</label>
          <input
            id="fund-amount"
            type="number"
            min="0.01"
            max={(headroomCents / 100).toFixed(2)}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
          <div className={styles.fieldHint}>
            {cents(headroomCents)} still creditable ·{" "}
            {fromRain
              ? "shared Rain sandbox ceiling · not buyer funds"
              : "labeled local ceiling"}
          </div>
        </div>
        <div className={styles.exampleRow}>
          {["250.00", "500.00", "1000.00", "2500.00"]
            .filter((preset) => Math.round(Number(preset) * 100) <= headroomCents)
            .map((preset) => (
            <button key={preset} type="button" onClick={() => setAmount(preset)}>{money.format(Number(preset))}</button>
          ))}
          {headroomCents > 0 && (
            <button
              type="button"
              onClick={() => setAmount((headroomCents / 100).toFixed(2))}
            >
              Max {money.format(headroomCents / 100)}
            </button>
          )}
        </div>
        <div className={styles.ruleBox}>
          <ShieldCheck size={15} />
          <span>
            <strong>Sandbox only.</strong>{" "}
            {fromRain
              ? `The browser-local credit is capped at Rain's read-only shared ${cents(treasury.spendingPowerCents)} sandbox ceiling. It is not provider-backed buyer money. No card, on-ramp, or Monad write occurs here.`
              : "No on-ramp, bank account, card, stablecoin, Rain request, or Monad write occurs."}
          </span>
        </div>
      </div>
      <footer className={styles.modalFooter}>
        <button className={styles.secondaryButton} type="button" onClick={() => setModal(null)}>Cancel</button>
        <button className={styles.primaryButton} type="submit"><Plus size={14} /> Add test funds</button>
      </footer>
    </form>
  );
}

function IntentForm({
  workspace,
  initialProductId,
  quickText,
  decisionReceipt,
  setWorkspace,
  setModal,
  setToast,
  showError,
}: ModalFormProps & {
  initialProductId?: string;
  quickText?: string;
  decisionReceipt?: ProductIntentRun;
}) {
  const products = Object.values(workspace.products);
  const inferredProductId = useMemo(() => {
    if (initialProductId) return initialProductId;
    const normalized = quickText?.toLowerCase() ?? "";
    if (normalized.includes("steam") || normalized.includes("game")) return "product-steam-deck-oled-512";
    if (normalized.includes("mac") || normalized.includes("laptop")) return "product-macbook-air-m4-13";
    if (normalized.includes("dyson") || normalized.includes("airwrap")) return "product-dyson-airwrap-id";
    return "product-sony-wh1000xm6";
  }, [initialProductId, quickText]);
  const [productId, setProductId] = useState(inferredProductId);
  const [quantity, setQuantity] = useState(
    decisionReceipt?.extraction.quantity
      ? String(decisionReceipt.extraction.quantity)
      : "1",
  );
  const [targetPrice, setTargetPrice] = useState(() => {
    if (decisionReceipt?.extraction.maxUnitPriceCents) {
      return (decisionReceipt.extraction.maxUnitPriceCents / 100).toFixed(2);
    }
    const pool = Object.values(workspace.pools).find((candidate) => candidate.productId === inferredProductId);
    return ((pool?.estimatedUnitPriceCents ?? workspace.products[inferredProductId]?.msrpUnitCents ?? 1) / 100).toFixed(2);
  });
  const [waitDays, setWaitDays] = useState(
    decisionReceipt?.extraction.patienceDays
      ? String(decisionReceipt.extraction.patienceDays)
      : "30",
  );
  const renderNow = useNow();
  const selectedProduct = workspace.products[productId];
  const matchingPool = Object.values(workspace.pools).find((pool) => pool.productId === productId);
  const requestedDeliverBy = new Date(
    renderNow + Number(waitDays) * DAY_MS,
  );
  const earliestModeledDelivery = matchingPool
    ? new Date(
        Date.parse(productExecutionSchedule(matchingPool).bidClosesAt) +
          minimumConsumerDeliveryDays() * DAY_MS,
      )
    : null;
  const matchingPoolCompatible =
    !matchingPool ||
    (Math.round(Number(targetPrice) * 100) >=
      matchingPool.estimatedUnitPriceCents &&
      (!earliestModeledDelivery || requestedDeliverBy >= earliestModeledDelivery));

  function changeProduct(nextProductId: string) {
    setProductId(nextProductId);
    const pool = Object.values(workspace.pools).find((candidate) => candidate.productId === nextProductId);
    setTargetPrice(((pool?.estimatedUnitPriceCents ?? workspace.products[nextProductId].msrpUnitCents) / 100).toFixed(2));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const createdAt = new Date();
    try {
      const next = reduceProductWorkspace(workspace, {
        type: "intent/create",
        buyerId: workspace.owner.id,
        productId,
        quantity: Number(quantity),
        targetUnitPriceCents: Math.round(Number(targetPrice) * 100),
        intentId: createId("intent"),
        activityId: createId("activity-intent"),
        at: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + Number(waitDays) * DAY_MS).toISOString(),
      });
      setWorkspace(next);
      setModal(null);
      setToast(
        matchingPool
          ? `Intent saved. A ${selectedProduct.brand} pool is ready to review.`
          : "Buying intent saved and ready for matching.",
      );
    } catch (error) {
      showError(error);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className={styles.modalBody}>
        <p className={styles.modalIntro}>
          {decisionReceipt
            ? "Confirm the structured mandate POOL will use for matching. The receipt below did not save anything or request funds; only your explicit Save creates a browser-local intent, and joining remains a later action."
            : "Enter the mandate POOL will use for matching. Only your explicit Save creates a browser-local intent; joining a pool and reserving test funds remain later actions."}
        </p>
        {decisionReceipt ? (
          <ProductAgentReceipt run={decisionReceipt} />
        ) : quickText ? (
          <div className={styles.ruleBox}><Sparkles size={15} /><span>Interpreted from: “{quickText}”</span></div>
        ) : null}
        <div className={styles.fieldGrid} style={{ marginTop: quickText ? 14 : 0 }}>
          <div className={classNames(styles.field, styles.fieldFull)}>
            <label htmlFor="intent-product">Matched product</label>
            <select id="intent-product" value={productId} onChange={(event) => changeProduct(event.target.value)}>
              {products.map((product) => <option key={product.id} value={product.id}>{product.brand} {product.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="intent-quantity">Quantity</label>
            <input id="intent-quantity" type="number" min="1" max="20" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="intent-price">Maximum unit price</label>
            <input id="intent-price" type="number" min="0.01" max="100000" step="0.01" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} required />
          </div>
          <div className={classNames(styles.field, styles.fieldFull)}>
            <label htmlFor="intent-window">How long can you wait?</label>
            <input
              id="intent-window"
              type="number"
              min="1"
              max="365"
              step="1"
              value={waitDays}
              onChange={(event) => setWaitDays(event.target.value)}
              required
            />
            <div className={styles.fieldHint}>Days from now · review and edit before saving</div>
          </div>
        </div>
        {matchingPool ? (
          <div
            className={
              matchingPoolCompatible ? styles.successBox : styles.errorBox
            }
          >
            <Users size={15} />
            <span>
              Matching sample pool found: {matchingPool.committedUnitCount} funded
              units; {poolEligibility(matchingPool).label}. It stays open through{" "}
              {shortDate.format(new Date(matchingPool.cutoffAt))}, with no enrollment cap.
              {earliestModeledDelivery
                ? ` Earliest modeled arrival is ${shortDate.format(earliestModeledDelivery)}; your mandate must allow at least that date and the pool's published price target.`
                : ""}
            </span>
          </div>
        ) : null}
      </div>
      <footer className={styles.modalFooter}>
        <button className={styles.secondaryButton} type="button" onClick={() => setModal(null)}>Cancel</button>
        <button className={styles.primaryButton} type="submit"><Check size={14} /> Save buying intent</button>
      </footer>
    </form>
  );
}

function JoinForm({
  workspace,
  poolId,
  setWorkspace,
  setModal,
  setToast,
  showError,
}: ModalFormProps & { poolId: string }) {
  const pool = workspace.pools[poolId];
  const product = workspace.products[pool.productId];
  const balance = workspace.balances[workspace.owner.id];
  const openIntent = Object.values(workspace.intents)
    .slice()
    .reverse()
    .find((intent) => intent.productId === product.id && intent.status === "open");
  const quantity = openIntent?.quantity ?? 1;
  const renderNow = useNow();
  const requiredCents = product.msrpUnitCents * quantity;
  const shortageCents = Math.max(0, requiredCents - balance.availableCents);
  const earliestModeledDelivery = new Date(
    Date.parse(productExecutionSchedule(pool).bidClosesAt) +
      minimumConsumerDeliveryDays() * DAY_MS,
  );
  const intendedDeliverBy = openIntent
    ? new Date(openIntent.expiresAt)
    : new Date(renderNow + 30 * DAY_MS);
  const intentCompatible =
    (!openIntent ||
      openIntent.targetUnitPriceCents >= pool.estimatedUnitPriceCents) &&
    intendedDeliverBy >= earliestModeledDelivery;

  function addShortage() {
    try {
      const next = reduceProductWorkspace(workspace, {
        type: "sandbox/deposit",
        buyerId: workspace.owner.id,
        amountCents: shortageCents,
        activityId: createId("activity-deposit"),
        at: new Date().toISOString(),
      });
      setWorkspace(next);
      setToast(`${cents(shortageCents)} in test funds added. You can now reserve MSRP.`);
    } catch (error) {
      showError(error);
    }
  }

  function join() {
    try {
      const now = new Date();
      let next = workspace;
      let intent = openIntent;
      if (!intent) {
        const intentId = createId("intent");
        next = reduceProductWorkspace(next, {
          type: "intent/create",
          buyerId: workspace.owner.id,
          productId: product.id,
          quantity: 1,
          targetUnitPriceCents: pool.estimatedUnitPriceCents,
          intentId,
          activityId: createId("activity-intent"),
          at: now.toISOString(),
          expiresAt: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
        });
        intent = next.intents[intentId];
      }
      next = reduceProductWorkspace(next, {
        type: "pool/join",
        buyerId: workspace.owner.id,
        poolId: pool.id,
        intentId: intent.id,
        membershipId: createId("membership"),
        activityId: createId("activity-join"),
        at: now.toISOString(),
      });
      setWorkspace(next);
      setModal(null);
      setToast(`${cents(requiredCents)} reserved. You now count as funded demand.`);
    } catch (error) {
      showError(error);
    }
  }

  return (
    <>
      <div className={styles.modalBody}>
        <p className={styles.modalIntro}>
          POOL admits only funded demand. Review the exact amount and exit rule before
          locking your test balance.
        </p>
        <div className={styles.reservationBox}>
          <div className={styles.reservationProduct}>
            <ProductGlyph product={product} size={18} />
            <div><strong>{product.brand} {product.name}</strong><small>{quantity} unit{quantity === 1 ? "" : "s"} · {openIntent ? "Your saved intent" : "Instant default intent"}</small></div>
          </div>
          <div className={styles.reservationLine}><span>MSRP per unit</span><strong>{cents(product.msrpUnitCents)}</strong></div>
          <div className={styles.reservationLine}><span>Quantity</span><strong>× {quantity}</strong></div>
          <div className={classNames(styles.reservationLine, styles.reservationTotal)}><span>Required reservation</span><strong>{cents(requiredCents)}</strong></div>
          <div className={styles.reservationLine}><span>Available now</span><strong>{cents(balance.availableCents)}</strong></div>
          <div className={styles.reservationLine}>
            <span>Current funded demand</span>
            <strong>{pool.committedUnitCount} units · {poolEligibility(pool).label}</strong>
          </div>
          <div className={styles.reservationLine}>
            <span>Commitment window closes</span>
            <strong>{shortDate.format(new Date(pool.cutoffAt))}</strong>
          </div>
          <div className={styles.reservationLine}>
            <span>Earliest modeled arrival</span>
            <strong>{shortDate.format(earliestModeledDelivery)}</strong>
          </div>
          <div className={styles.reservationLine}>
            <span>Your deliver-by deadline</span>
            <strong>{shortDate.format(intendedDeliverBy)}</strong>
          </div>
        </div>
        {!intentCompatible ? (
          <div className={styles.errorBox}>
            <Info size={15} />
            <span>
              This saved mandate cannot join: its price ceiling or delivery deadline
              is incompatible with the pool. Update the intent before reserving funds.
            </span>
          </div>
        ) : shortageCents > 0 ? (
          <div className={styles.errorBox}>
            <Info size={15} />
            <span>You need {cents(shortageCents)} more in available test funds before this commitment can count.</span>
          </div>
        ) : (
          <div className={styles.successBox}>
            <ShieldCheck size={15} />
            <span>Coverage verified. Available will decrease by {cents(requiredCents)} and reserved will increase by the same amount.</span>
          </div>
        )}
        <div className={styles.ruleBox}>
          <Clock3 size={15} />
          <span>
            <strong>Two-week window:</strong> leave before{" "}
            {shortDate.format(new Date(pool.cutoffAt))} for an exact release. The{" "}
            {pool.minimumCommittedUnitCount}-unit minimum only gates bidding; funded
            joins remain open above it until cutoff. After cutoff, funds remain frozen
            while merchants compete.
          </span>
        </div>
      </div>
      <footer className={styles.modalFooter}>
        <button className={styles.secondaryButton} type="button" onClick={() => setModal(null)}>Not yet</button>
        {!intentCompatible ? (
          <button className={styles.primaryButton} type="button" disabled>
            Mandate incompatible
          </button>
        ) : shortageCents > 0 ? (
          <button className={styles.primaryButton} type="button" onClick={addShortage}><Plus size={14} /> Add exact shortage</button>
        ) : (
          <button className={styles.primaryButton} type="button" onClick={join}><LockKeyhole size={14} /> Reserve & join</button>
        )}
      </footer>
    </>
  );
}

function LeaveForm({
  workspace,
  membershipId,
  setWorkspace,
  setModal,
  setToast,
  showError,
}: ModalFormProps & { membershipId: string }) {
  const membership = workspace.memberships[membershipId];
  const pool = workspace.pools[membership.poolId];
  const product = workspace.products[pool.productId];

  function leave() {
    try {
      const next = reduceProductWorkspace(workspace, {
        type: "pool/leave",
        buyerId: workspace.owner.id,
        membershipId,
        activityId: createId("activity-leave"),
        at: new Date().toISOString(),
      });
      setWorkspace(next);
      setModal(null);
      setToast(`${cents(membership.reservedCents)} released back to your available test balance.`);
    } catch (error) {
      showError(error);
    }
  }

  return (
    <>
      <div className={styles.modalBody}>
        <p className={styles.modalIntro}>
          This pool is still forming, so the commitment can be released exactly once.
        </p>
        <div className={styles.reservationBox}>
          <div className={styles.reservationProduct}>
            <ProductGlyph product={product} size={18} />
            <div><strong>{product.brand} {product.name}</strong><small>{membership.quantity} committed unit{membership.quantity === 1 ? "" : "s"}</small></div>
          </div>
          <div className={styles.reservationLine}><span>Currently reserved</span><strong>{cents(membership.reservedCents)}</strong></div>
          <div className={classNames(styles.reservationLine, styles.reservationTotal)}><span>Returns to available</span><strong>{cents(membership.reservedCents)}</strong></div>
        </div>
        <div className={styles.ruleBox}>
          <Info size={15} />
          <span>The buying intent will close and your unit will stop contributing to this pool’s funded-demand count.</span>
        </div>
      </div>
      <footer className={styles.modalFooter}>
        <button className={styles.secondaryButton} type="button" onClick={() => setModal(null)}>Keep commitment</button>
        <button className={styles.dangerButton} type="button" onClick={leave}>Release {cents(membership.reservedCents)}</button>
      </footer>
    </>
  );
}

type PublicOffer = {
  merchantId: string;
  merchantName: string;
  unitPriceCents: number;
  deliveryDays: number;
  warrantyMonths: number;
};

type CommitResponse =
  | {
      status: "below_minimum";
      code: "minimum_funded_units_not_met";
      operationId: string;
      poolId: string;
      aggregateUnits: number;
      minimumCommittedUnitCount: number;
      unitsNeeded: number;
      reservationState: "release_available";
      releaseReason: "minimum_not_met";
      message: string;
    }
  | {
      status: "waiting_for_cutoff";
      code: "waiting_for_cutoff";
      poolId: string;
      cutoffAt: string;
      bidClosesAt: string;
      serverTime: string;
      remainingMs: number;
      reservationState: "still_reserved";
      message: string;
    }
  | {
      status: "execution_window_missed";
      code: "bid_window_closed";
      operationId: string;
      poolId: string;
      cutoffAt: string;
      bidClosesAt: string;
      serverTime: string;
      reservedCents: number;
      reservationState: "release_available";
      releaseReason: "execution_window_missed";
      providerOperationState: "impossible_by_design";
      resolutionBasis: "product_rehearsal_only";
      message: string;
    }
  | {
      status: "rehearsal_only" | "rejected" | "rate_limited";
      code?: string;
      reservationState?: "still_reserved" | "reconciliation_required";
      message: string;
    };

type SettleResponse =
  | {
      status: "modeled_quote";
      operationId: string;
      evidence: "rehearsal";
      code: "aggregate_provider_allocations_unavailable";
      aggregateOrderPlaced: false;
      reservationState: "release_available";
      releaseReason: "rehearsal_complete";
      aggregateUnits: number;
      volumeDiscountBps: number;
      quantity: number;
      reservedCents: number;
      modeledAllocationCents: number;
      modeledSavingsCents: number;
      unitPriceCents: number;
      msrpUnitCents: number;
      targetUnitPriceCents: number;
      buyerMaxUnitPriceCents: number;
      deliverBy: string | null;
      promisedDeliveryAt: string;
      offers: PublicOffer[];
      winner: PublicOffer;
      message: string;
    }
  | {
      status: "no_acceptable_offer";
      code: "no_acceptable_offer" | "buyer_mandate_not_met";
      operationId: string;
      aggregateUnits: number;
      reservedCents: number;
      unitsToClear: number | null;
      targetUnitPriceCents: number;
      offers: PublicOffer[];
      reservationState: "release_available";
      releaseReason: "no_acceptable_offer";
      message: string;
    }
  | {
      status: "below_minimum";
      code: "minimum_funded_units_not_met";
      operationId: string;
      poolId: string;
      aggregateUnits: number;
      minimumCommittedUnitCount: number;
      unitsNeeded: number;
      reservedCents: number;
      reservationState: "release_available";
      releaseReason: "minimum_not_met";
      message: string;
    }
  | {
      status: "waiting_for_cutoff";
      code: "waiting_for_cutoff";
      poolId: string;
      cutoffAt: string;
      bidClosesAt: string;
      serverTime: string;
      remainingMs: number;
      reservationState: "still_reserved";
      message: string;
    }
  | {
      status: "execution_window_missed";
      code: "bid_window_closed";
      operationId: string;
      poolId: string;
      cutoffAt: string;
      bidClosesAt: string;
      serverTime: string;
      reservedCents: number;
      reservationState: "release_available";
      releaseReason: "execution_window_missed";
      providerOperationState: "impossible_by_design";
      resolutionBasis: "product_rehearsal_only";
      message: string;
    }
  | {
      status: "failed" | "rejected" | "rate_limited";
      code?: string;
      compensated?: boolean;
      reservationState?: string;
      message: string;
    };

function executionMembershipEnvelope(
  membership: PoolMembership,
): PoolMembershipEnvelope {
  return {
    id: membership.id,
    poolId: membership.poolId,
    intentId: membership.intentId,
    buyerId: membership.buyerId,
    quantity: membership.quantity,
    reservedCents: membership.reservedCents,
    status: membership.status,
    joinedAt: membership.joinedAt,
  };
}

function sameExecutionMembership(
  current: PoolMembership | undefined,
  submitted: PoolMembershipEnvelope,
) {
  if (!current) return false;
  const candidate = executionMembershipEnvelope(current);
  return (
    candidate.id === submitted.id &&
    candidate.poolId === submitted.poolId &&
    candidate.intentId === submitted.intentId &&
    candidate.buyerId === submitted.buyerId &&
    candidate.quantity === submitted.quantity &&
    candidate.reservedCents === submitted.reservedCents &&
    candidate.status === submitted.status &&
    candidate.joinedAt === submitted.joinedAt
  );
}

function assertNeverResponse(value: never): never {
  throw new Error(`Unexpected API response: ${JSON.stringify(value)}`);
}

/**
 * Runs the product page's deterministic, mandate-aware market rehearsal.
 *
 * Every figure rendered here comes from the server response. The browser sends
 * its immutable local membership envelope; the server validates it against
 * catalog MSRP and derives the modeled operation id, clearing price, and local
 * allocation itself. This surface never contacts Rain or Monad.
 */
function SettleForm({
  workspace,
  membershipId,
  setWorkspace,
  setModal,
  setToast,
  showError,
}: ModalFormProps & { membershipId: string }) {
  const membership = workspace.memberships[membershipId];
  const pool = membership ? workspace.pools[membership.poolId] : undefined;
  const product = pool ? workspace.products[pool.productId] : undefined;
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<SettleResponse | null>(null);
  const now = useNow();
  const workspaceRef = useRef(workspace);
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  if (!membership || !pool || !product) {
    return (
      <div className={styles.modalBody}>
        <p className={styles.modalIntro}>That commitment is no longer available.</p>
      </div>
    );
  }

  // Captured after the guard above so the request closure cannot be typed
  // against a missing pool or membership.
  const activePool = pool;
  const activeMembership = membership;
  const resolvingExpiredWindow =
    marketWindowPhase(activePool, now) === "closed";

  async function run() {
    const submittedMembership = executionMembershipEnvelope(activeMembership);
    const latestAtStart = workspaceRef.current;
    const latestPool = latestAtStart.pools[activePool.id];
    const latestIntent = latestAtStart.intents[activeMembership.intentId];
    const latestMarketPhase = latestPool
      ? marketWindowPhase(latestPool, Date.now())
      : "unavailable";
    if (
      !sameExecutionMembership(
        latestAtStart.memberships[activeMembership.id],
        submittedMembership,
      ) ||
      submittedMembership.status !== "active" ||
      !latestPool ||
      !latestIntent ||
      latestIntent.status !== "joined" ||
      (latestMarketPhase !== "open" && latestMarketPhase !== "closed")
    ) {
      setModal(null);
      showError(
        new Error(
          "This settlement view became stale. Reopen the active commitment at or after the pool cutoff.",
        ),
      );
      return;
    }

    setRunning(true);
    setResult(null);
    try {
      const submittedIntent = {
        id: latestIntent.id,
        buyerId: latestIntent.buyerId,
        productId: latestIntent.productId,
        quantity: latestIntent.quantity,
        targetUnitPriceCents: latestIntent.targetUnitPriceCents,
        createdAt: latestIntent.createdAt,
        expiresAt: latestIntent.expiresAt,
        status: "joined" as const,
      };
      // Phase 1 validates the frozen local coalition. Product-page execution is
      // intentionally rehearsal-only until every seeded allocation has real
      // provider evidence; this request cannot write Monad or Rain.
      setStage(
        latestMarketPhase === "closed"
          ? "Asking the server to resolve the expired execution window…"
          : "Validating the local coalition for a mandate-aware rehearsal…",
      );
      const commitResponse = await fetch("/api/pool/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pool-demo-action": "commit-funded-demand",
        },
        cache: "no-store",
        body: JSON.stringify({
          poolId: activePool.id,
          membership: submittedMembership,
          confirmation: "commit-funded-demand",
        }),
      });
      const commitBody = (await commitResponse.json()) as CommitResponse;
      switch (commitBody.status) {
        case "rehearsal_only":
          break;
        case "below_minimum":
          setResult({
            ...commitBody,
            reservedCents: activeMembership.reservedCents,
          });
          return;
        case "execution_window_missed":
          setResult(commitBody);
          return;
        case "waiting_for_cutoff":
          setResult(commitBody);
          return;
        case "rejected":
        case "rate_limited":
          setResult({
            status: commitBody.status,
            code: commitBody.code,
            message: commitBody.message,
            reservationState: commitBody.reservationState ?? "still_reserved",
          });
          return;
        default:
          assertNeverResponse(commitBody);
      }

      setStage("Running the mandate-aware local merchant rehearsal…");
      const response = await fetch("/api/pool/settle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pool-demo-action": "settle-pool-order",
        },
        cache: "no-store",
        body: JSON.stringify({
          poolId: activePool.id,
          membership: submittedMembership,
          intent: submittedIntent,
          confirmation: "settle-pool-order",
        }),
      });
      const body = (await response.json()) as SettleResponse;
      setResult(body);

      switch (body.status) {
        case "modeled_quote": {
          // A modeled quote is display evidence only. It cannot consume the
          // reservation, create an order, or move browser-local balances. The
          // buyer must explicitly choose the no-purchase release below.
          break;
        }
        case "no_acceptable_offer":
        case "below_minimum":
        case "execution_window_missed":
        case "waiting_for_cutoff":
        case "failed":
        case "rejected":
        case "rate_limited":
          break;
        default:
          assertNeverResponse(body);
      }
    } catch (error) {
      showError(error);
    } finally {
      setStage(null);
      setRunning(false);
    }
  }

  const modeledQuote = result?.status === "modeled_quote" ? result : null;
  const declined = result?.status === "no_acceptable_offer" ? result : null;
  const executionWindowMissed =
    result?.status === "execution_window_missed" ? result : null;
  const belowMinimum = result?.status === "below_minimum" ? result : null;
  const failed =
    result &&
    result.status !== "modeled_quote" &&
    result.status !== "no_acceptable_offer" &&
    result.status !== "execution_window_missed" &&
    result.status !== "below_minimum"
      ? result
      : null;
  const releasableOutcome =
    modeledQuote ??
    belowMinimum ??
    declined ??
    executionWindowMissed;

  function releaseAfterOutcome() {
    if (!releasableOutcome) return;
    const submittedMembership = executionMembershipEnvelope(activeMembership);
    const latest = workspaceRef.current;
    if (
      !sameExecutionMembership(
        latest.memberships[activeMembership.id],
        submittedMembership,
      )
    ) {
      setModal(null);
      showError(
        new Error(
          "This commitment changed before its outcome release could be applied.",
        ),
      );
      return;
    }
    try {
      const next = reduceProductWorkspace(latest, {
        type: "pool/release_after_outcome",
        membershipId: activeMembership.id,
        buyerId: latest.owner.id,
        reason: releasableOutcome.releaseReason,
        operationId: releasableOutcome.operationId,
        activityId: createId("activity-outcome-release"),
        at:
          releasableOutcome.status === "execution_window_missed"
            ? releasableOutcome.serverTime
            : new Date().toISOString(),
      });
      setWorkspace(next);
      setModal(null);
      setToast(
        releasableOutcome.status === "modeled_quote"
          ? `${cents(activeMembership.reservedCents)} released locally. The modeled quote created no order or payment.`
          : `${cents(activeMembership.reservedCents)} released after the no-purchase outcome.`,
      );
    } catch (error) {
      showError(error);
    }
  }

  return (
    <>
      <div className={styles.modalBody}>
        {running && stage ? (
          <div className={styles.ruleBox} role="status" aria-live="polite">
            <Zap size={15} />
            <span>{stage}</span>
          </div>
        ) : null}
        {!result ? (
          <>
            <p className={styles.modalIntro}>
              {resolvingExpiredWindow
                ? "The product rehearsal window has expired. Because these product routes cannot contact Rain or Monad in any environment, the server can safely return the browser-local reservation for release."
                : "POOL replays a sealed, deterministic merchant market against this local funded-demand fixture and selects the cheapest modeled offer that satisfies your price and delivery mandate. This market rehearsal never places an aggregate order or contacts Rain or Monad."}
            </p>
            <div className={styles.reservationBox}>
              <div className={styles.reservationProduct}>
                <ProductGlyph product={product} size={18} />
                <div>
                  <strong>{product.brand} {product.name}</strong>
                  <small>
                    {membership.quantity} unit{membership.quantity === 1 ? "" : "s"} ·{" "}
                    {pool.committedUnitCount} funded units in this coalition
                  </small>
                </div>
              </div>
              <div className={styles.reservationLine}>
                <span>Your reservation</span>
                <strong>{cents(membership.reservedCents)}</strong>
              </div>
              <div className={styles.reservationLine}>
                <span>Published price target</span>
                <strong>{cents(pool.estimatedUnitPriceCents)} / unit</strong>
              </div>
              <div className={styles.reservationLine}>
                <span>Market eligibility</span>
                <strong>{poolEligibility(pool).label}</strong>
              </div>
            </div>
            <div className={styles.ruleBox}>
              <ShieldCheck size={15} />
              <span>
                The browser submits this commitment’s complete identity and reservation
                envelope plus its saved mandate. The server validates both against the
                canonical fixture, filters modeled bids by maximum price and promised
                delivery, and returns rehearsal evidence only. No aggregate order is
                placed.
              </span>
            </div>
          </>
        ) : null}

        {modeledQuote ? (
          <>
            <div className={styles.reservationBox}>
              <div className={styles.reservationProduct}>
                <ProductGlyph product={product} size={18} />
                <div>
                  <strong>{modeledQuote.winner.merchantName} won the modeled market</strong>
                  <small>
                    {cents(modeledQuote.unitPriceCents)} / unit ·{" "}
                    {modeledQuote.winner.deliveryDays}-day delivery ·{" "}
                    {modeledQuote.winner.warrantyMonths}-month warranty
                  </small>
                </div>
              </div>
              <div className={styles.reservationLine}>
                <span>Sealed bids at {modeledQuote.aggregateUnits} funded units</span>
                <strong>{(modeledQuote.volumeDiscountBps / 100).toFixed(0)}% volume tier</strong>
              </div>
              {modeledQuote.offers.map((offer) => (
                <div className={styles.reservationLine} key={offer.merchantId}>
                  <span>
                    {offer.merchantName}
                    {offer.merchantId === modeledQuote.winner.merchantId ? " · won" : ""}
                  </span>
                  <strong>{cents(offer.unitPriceCents)}</strong>
                </div>
              ))}
              <div className={styles.reservationLine}>
                <span>Your reservation remains locked</span>
                <strong>{cents(modeledQuote.reservedCents)}</strong>
              </div>
              <div className={styles.reservationLine}>
                <span>Modeled total at quote</span>
                <strong>{cents(modeledQuote.modeledAllocationCents)}</strong>
              </div>
              <div className={classNames(styles.reservationLine, styles.reservationTotal)}>
                <span>Modeled savings if a real order existed</span>
                <strong>{cents(modeledQuote.modeledSavingsCents)}</strong>
              </div>
            </div>

            <div className={styles.ruleBox}>
              <Info size={15} />
              <span>
                <strong>REHEARSAL · NO AGGREGATE ORDER PLACED.</strong> This quote did not
                mutate the browser-local reservation or create an order. No card was
                issued, no payment was authorized, and neither Rain nor Monad was
                contacted. Release the local reservation explicitly, or use the fixed
                Demo page for the complete three-allocation live proof.
              </span>
            </div>
          </>
        ) : null}

        {belowMinimum ? (
          <>
            <div className={styles.reservationBox}>
              <div className={styles.reservationProduct}>
                <ProductGlyph product={product} size={18} />
                <div>
                  <strong>Merchant bidding has not opened</strong>
                  <small>
                    {belowMinimum.aggregateUnits} funded units ·{" "}
                    {belowMinimum.unitsNeeded} more needed for eligibility
                  </small>
                </div>
              </div>
              <div className={styles.reservationLine}>
                <span>Minimum to open bidding</span>
                <strong>{belowMinimum.minimumCommittedUnitCount} funded units</strong>
              </div>
              <div className={classNames(styles.reservationLine, styles.reservationTotal)}>
                <span>Available for full release</span>
                <strong>{cents(belowMinimum.reservedCents)}</strong>
              </div>
            </div>
            <div className={styles.ruleBox}>
              <Info size={15} />
              <span>
                <strong>Eligibility outcome—not a failed payment.</strong>{" "}
                {belowMinimum.message} The minimum is not an enrollment target or cap:
                funded buyers may keep joining until the published cutoff. If the window
                closes below the minimum, POOL does not open merchant bidding or attempt
                a payment authorization.
              </span>
            </div>
          </>
        ) : null}

        {declined ? (
          <>
            <div className={styles.reservationBox}>
              <div className={styles.reservationProduct}>
                <ProductGlyph product={product} size={18} />
                <div>
                  <strong>No acceptable offer</strong>
                  <small>
                    {declined.aggregateUnits} funded units could not beat{" "}
                    {cents(declined.targetUnitPriceCents)} per unit
                  </small>
                </div>
              </div>
              {declined.offers.map((offer) => (
                <div className={styles.reservationLine} key={offer.merchantId}>
                  <span>{offer.merchantName}</span>
                  <strong>{cents(offer.unitPriceCents)}</strong>
                </div>
              ))}
              <div className={classNames(styles.reservationLine, styles.reservationTotal)}>
                <span>Available for full release</span>
                <strong>{cents(declined.reservedCents)}</strong>
              </div>
            </div>
            <div className={styles.ruleBox}>
              <Info size={15} />
              <span>
                {declined.code === "buyer_mandate_not_met"
                  ? "Merchant bids were filtered against the saved, server-validated maximum price and promised-delivery deadline before an award was chosen; none qualified."
                  : declined.unitsToClear === null
                  ? "No merchant can reach this pool's published price target at any modeled volume tier."
                  : `The offer model first reaches this price target at ${declined.unitsToClear} funded units. That describes volume pricing, not an enrollment target or cap.`}
                {" "}No payment authorization was attempted, so releasing this outcome
                cannot conflict with a purchase.
              </span>
            </div>
          </>
        ) : null}

        {executionWindowMissed ? (
          <>
            <div className={styles.reservationBox}>
              <div className={styles.reservationProduct}>
                <ProductGlyph product={product} size={18} />
                <div>
                  <strong>Execution window expired</strong>
                  <small>
                    Closed {shortDateTime.format(
                      new Date(executionWindowMissed.bidClosesAt),
                    )}
                  </small>
                </div>
              </div>
              <div className={styles.reservationLine}>
                <span>Provider operation state</span>
                <strong>Impossible by product-route design</strong>
              </div>
              <div className={classNames(styles.reservationLine, styles.reservationTotal)}>
                <span>Available for full release</span>
                <strong>{cents(executionWindowMissed.reservedCents)}</strong>
              </div>
            </div>
            <div className={styles.ruleBox}>
              <Info size={15} />
              <span>
                {executionWindowMissed.message} This release changes only the local
                product sandbox; it is not a custody or provider settlement claim.
              </span>
            </div>
          </>
        ) : null}

        {failed ? (
          <div className={styles.ruleBox}>
            <Info size={15} />
            <span>
              <strong>The settlement run did not complete.</strong> {failed.message}
              {failed.reservationState === "reconciliation_required"
                ? " Your reservation stays locked pending reconciliation; POOL does not release funds on an ambiguous provider result."
                : " Your reservation is unchanged and can be retried."}
            </span>
          </div>
        ) : null}
      </div>

      <footer className={styles.modalFooter}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => setModal(null)}
        >
          {releasableOutcome ? "Keep reserved" : result ? "Done" : "Cancel"}
        </button>
        {releasableOutcome ? (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={releaseAfterOutcome}
            disabled={running}
          >
            <ArrowUpRight size={14} /> Release {cents(activeMembership.reservedCents)}
          </button>
        ) : !modeledQuote && !belowMinimum && !declined ? (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={run}
            disabled={running}
          >
            {running
              ? resolvingExpiredWindow
                ? "Resolving window…"
                : "Running local rehearsal…"
              : result
                ? "Run again"
                : resolvingExpiredWindow
                  ? "Resolve window"
                  : "Run rehearsal"}
          </button>
        ) : null}
      </footer>
    </>
  );
}
