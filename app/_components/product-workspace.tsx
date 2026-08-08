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
  createSeededProductWorkspace,
  reduceProductWorkspace,
  type PoolMembership,
  type ProductActivityEntry,
  type ProductCategory,
  type ProductListing,
  type ProductPool,
  type ProductWorkspace,
} from "@/lib/product";

import styles from "../product.module.css";

export type ProductWorkspaceView =
  | "home"
  | "explore"
  | "wallet"
  | "orders"
  | "pool";

type ProductWorkspaceProps = {
  view: ProductWorkspaceView;
  poolId?: string;
};

type ModalState =
  | { kind: "fund"; suggestedCents?: number }
  | { kind: "intent"; productId?: string; quickText?: string }
  | { kind: "join"; poolId: string }
  | { kind: "leave"; membershipId: string }
  | { kind: "settle"; membershipId: string }
  | { kind: "reset" }
  | null;

const STORAGE_KEY = "pool-product-workspace-v1";
const DAY_MS = 86_400_000;
const DEFAULT_SEED = createSeededProductWorkspace();

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
 * Local-time greeting. Callers must only use this after hydration, because the
 * server and the visitor's browser can sit in different time zones.
 */
function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Compact provider identifier for display; never a substitute for the full id. */
function shortId(value?: string) {
  if (!value) return "—";
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
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
  if (entry.kind === "pool.left") {
    return Number(entry.metadata.releasedCents ?? 0);
  }
  return 0;
}

function activityIcon(entry: ProductActivityEntry) {
  if (entry.kind === "sandbox.deposit_recorded") return ArrowDownLeft;
  if (entry.kind === "pool.joined") return LockKeyhole;
  if (entry.kind === "pool.left") return ArrowUpRight;
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
  // Bumped after a provider-side money movement so the rail figures re-read.
  const [treasuryNonce, setTreasuryNonce] = useState(0);
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
        nextWorkspace = createSeededProductWorkspace({ now: new Date().toISOString() });
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
  }, [hydrated, treasuryNonce]);

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

  const balance = workspace.balances[workspace.owner.id];
  const pools = useMemo(() => Object.values(workspace.pools), [workspace.pools]);
  const products = useMemo(
    () => Object.values(workspace.products),
    [workspace.products],
  );
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

  function openQuickIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = quickIntent.trim().toLowerCase();
    let productId = products[0]?.id;
    if (normalized.includes("steam") || normalized.includes("game")) {
      productId = "product-steam-deck-oled-512";
    } else if (
      normalized.includes("mac") ||
      normalized.includes("laptop") ||
      normalized.includes("computer")
    ) {
      productId = "product-macbook-air-m4-13";
    } else if (normalized.includes("dyson") || normalized.includes("airwrap")) {
      productId = "product-dyson-airwrap-id";
    } else if (
      normalized.includes("sony") ||
      normalized.includes("xm6") ||
      normalized.includes("headphone") ||
      normalized.includes("audio")
    ) {
      productId = "product-sony-wh1000xm6";
    }
    setModal({ kind: "intent", productId, quickText: quickIntent.trim() });
  }

  function resetWorkspace() {
    const next = createSeededProductWorkspace({ now: new Date().toISOString() });
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
            setQuickIntent={setQuickIntent}
            openQuickIntent={openQuickIntent}
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
          refreshTreasury={() => setTreasuryNonce((value) => value + 1)}
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
          <p>
            Tell POOL what you want and when you need it. We organize fully funded
            demand, then make merchants compete for the whole order.
          </p>
          <form className={styles.quickIntent} onSubmit={openQuickIntent}>
            <label className={styles.quickIntentLabel} htmlFor="quick-intent">
              Describe your next purchase
            </label>
            <div className={styles.quickIntentControl}>
              <input
                id="quick-intent"
                value={quickIntent}
                onChange={(event) => setQuickIntent(event.target.value)}
                placeholder="e.g. Sony XM6 headphones under $390, can wait 10 days"
              />
              <button type="submit" className={styles.primaryButton}>
                Structure intent <ArrowRight size={14} />
              </button>
            </div>
          </form>
          <div className={styles.exampleRow} aria-label="Example purchases">
            {["Sony XM6 headphones", "Steam Deck OLED", "MacBook Air M4"].map(
              (example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setQuickIntent(example);
                    setModal({ kind: "intent", quickText: example });
                  }}
                >
                  {example}
                </button>
              ),
            )}
          </div>
        </div>

        <aside className={styles.balancePanel} aria-label="Test balance summary">
          <div className={styles.balanceTop}>
            <span className={styles.panelLabel}>Available to commit</span>
            <strong className={styles.balanceAmount}>{cents(balance.availableCents)}</strong>
            <div className={styles.balanceSubline}>
              <span>{hydrated ? "Saved on this device" : "Loading saved workspace…"}</span>
              <strong>Test USD</strong>
            </div>
          </div>
          <div className={styles.balanceBreakdown}>
            <div>
              <span>Reserved</span>
              <strong>{cents(balance.reservedCents)}</strong>
              <small>{activeMemberships.length} active commitments</small>
            </div>
            <div>
              <span>Deposited</span>
              <strong>{cents(balance.totalDepositedCents)}</strong>
              <small>Sandbox credits only</small>
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
            hint="Full MSRP reserved"
          />
          <SummaryMetric
            label="Potential savings"
            value={cents(potentialSavings)}
            hint="At current pool targets"
          />
          <SummaryMetric
            label="Open intents"
            value={String(openIntentCount)}
            hint="Ready to match"
          />
          <SummaryMetric
            label="Pools recruiting"
            value={String(pools.filter((pool) => pool.status === "forming").length)}
            hint="Sample market"
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
            <p>Seeded opportunities for this product sandbox—not live merchant inventory.</p>
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
            Compare estimated prices, committed demand, and exit cutoffs. Joining moves
            the full MSRP from available to reserved; estimates are not binding offers.
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
  const product = workspace.products[pool.productId];
  const membership = activeMembershipForPool(workspace, pool.id);
  const progress = Math.min(100, (pool.committedUnitCount / pool.targetMemberCount) * 100);
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
          <span><strong>{pool.committedUnitCount}</strong> units committed</span>
          <span>{pool.targetMemberCount} target</span>
        </div>
        <div className={styles.progressTrack} aria-label={`${Math.round(progress)}% funded-demand progress`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className={styles.poolCardFooter}>
        <span><Clock3 size={11} /> Exit cutoff {shortDate.format(new Date(pool.cutoffAt))}</span>
        {membership ? (
          <Link className={classNames(styles.cardAction, styles.cardActionJoined)} href={poolHref(pool)}>
            View <ChevronRight size={11} />
          </Link>
        ) : (
          <button
            type="button"
            className={styles.cardAction}
            onClick={() => setModal({ kind: "join", poolId: pool.id })}
          >
            Reserve & join <ChevronRight size={11} />
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
              <span>Pool target</span>
              <strong>{pool.committedUnitCount}/{pool.targetMemberCount} units</strong>
            </div>
            <div className={styles.rowMetric}>
              <span>Exit cutoff</span>
              <strong>{shortDate.format(new Date(pool.cutoffAt))}</strong>
            </div>
            <div className={styles.rowAction}>
              <Link href={poolHref(pool)}>Details</Link>
              {membership.status === "active" ? (
                <button type="button" onClick={() => setModal({ kind: "settle", membershipId: membership.id })}>
                  Run market
                </button>
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
              ? "Rain sandbox spending power"
              : "Offline ceiling (Rain unavailable)"}
          </span>
          <strong>{cents(workspace.treasury.spendingPowerCents)}</strong>
          <small>
            {workspace.treasury.source === "rain-sandbox"
              ? `Live from GET /issuing/balances${
                  workspace.treasury.syncedAt
                    ? ` · read ${shortDate.format(new Date(workspace.treasury.syncedAt))}`
                    : ""
                }`
              : "Labeled local fixture · not a Rain figure"}
          </small>
        </div>
        <div className={styles.walletMetric}>
          <span>Rail credit limit</span>
          <strong>{cents(workspace.treasury.creditLimitCents)}</strong>
          <small>Total sandbox capacity</small>
        </div>
        <div className={styles.walletMetric}>
          <span>Already charged</span>
          <strong>{cents(workspace.treasury.postedChargesCents)}</strong>
          <small>Settled on the rail</small>
        </div>
      </section>

      <div className={styles.walletDisclosure}>
        <Info size={15} />
        <span>
          {workspace.treasury.source === "rain-sandbox" ? (
            <>
              <strong>Rail-bounded sandbox:</strong> credits on this surface cannot exceed
              Rain’s live sandbox spending power, read directly from the provider. Reading
              that ceiling is the only Rain call the product workspace makes — no card,
              ACH, wire, crypto, or Monad transaction occurs here, and no real money moves.
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

function OrdersView({ workspace, activeMemberships, setModal }: SharedViewProps & {
  activeMemberships: PoolMembership[];
}) {
  const leftMemberships = Object.values(workspace.memberships).filter(
    (membership) => membership.status === "left",
  );
  return (
    <>
      <header className={styles.viewTitle}>
        <div>
          <span className={styles.pageEyebrow}>Commitments & orders</span>
          <h1>From reserved demand to delivery.</h1>
          <p>
            Active reservations appear here immediately. Production fulfillment is not
            connected; the Rain + Monad walkthrough demonstrates the settlement rail separately.
          </p>
        </div>
        <Link href="/explore" className={styles.primaryButton}>
          <Compass size={15} /> Find a group buy
        </Link>
      </header>

      <section aria-labelledby="current-commitments-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="current-commitments-title">Current commitments</h2>
            <p>Recruiting memberships can still be released before their cutoff.</p>
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
          {leftMemberships.length ? (
            leftMemberships.map((membership) => {
              const product = productForMembership(workspace, membership);
              if (!product) return null;
              return (
                <div className={styles.orderCard} key={membership.id}>
                  <div className={styles.rowIdentity}>
                    <ProductGlyph product={product} size={17} />
                    <div>
                      <strong>{product.brand} {product.name}</strong>
                      <small>Commitment closed before cutoff</small>
                    </div>
                  </div>
                  <div className={styles.rowMetric}>
                    <span>Released</span>
                    <strong>{cents(membership.reservedCents)}</strong>
                  </div>
                  <div className={styles.rowMetric}>
                    <span>Closed</span>
                    <strong>{membership.leftAt ? shortDate.format(new Date(membership.leftAt)) : "—"}</strong>
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
            <h2 id="lifecycle-title">What happens after the pool fills?</h2>
            <p>The production deliverable follows an explicit, failure-aware order lifecycle.</p>
          </div>
        </div>
        <div className={styles.detailPanel}>
          <div className={styles.termsList}>
            {[
              ["01", "Commitments freeze", "Membership and MSRP reservations lock at the published cutoff."],
              ["02", "Merchants compete", "Qualified sellers bid privately for the complete funded order."],
              ["03", "Winner is verified", "Price, inventory, delivery, and buyer policy must all pass."],
              ["04", "Capture and release", "Only the winning price is captured; the difference returns as savings."],
              ["05", "Fulfillment", "Production orders require shipping, returns, disputes, and reconciliation."],
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
  const progress = Math.min(100, (pool.committedUnitCount / pool.targetMemberCount) * 100);
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
            <p>{product.description} The displayed price is a non-binding pool target until a qualified merchant offer wins.</p>
          </div>
          <div className={styles.poolDetailAction}>
            {membership ? (
              <>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => setModal({ kind: "settle", membershipId: membership.id })}
                >
                  <Zap size={14} /> Run the market
                </button>
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={!canLeavePool(pool, now)}
                  onClick={() => setModal({ kind: "leave", membershipId: membership.id })}
                >
                  Release commitment
                </button>
              </>
            ) : settledMembership ? (
              <button className={styles.secondaryButton} type="button" disabled>
                Order settled
              </button>
            ) : (
              <button className={styles.primaryButton} type="button" onClick={() => setModal({ kind: "join", poolId: pool.id })}>
                Reserve {cents(product.msrpUnitCents)} & join
              </button>
            )}
            <small>
              {membership
                ? "Freeze this coalition and make merchants compete for the order."
                : settledMembership
                  ? `Captured ${cents(settledMembership.settlement?.capturedCents ?? 0)} · released ${cents(settledMembership.settlement?.releasedCents ?? 0)}.`
                  : `${cents(balance.availableCents)} currently available.`}
            </small>
          </div>
        </div>
        <div className={styles.poolFacts}>
          <PoolFact label="MSRP reserved" value={cents(product.msrpUnitCents)} hint="Per unit" />
          <PoolFact label="Target price" value={cents(pool.estimatedUnitPriceCents)} hint="Not a binding offer" />
          <PoolFact label="Potential savings" value={cents(savings)} hint={`${Math.round((savings / product.msrpUnitCents) * 100)}% per unit`} />
          <PoolFact label="Funded demand" value={`${pool.committedUnitCount} / ${pool.targetMemberCount}`} hint="Committed units" />
          <PoolFact label="Exit cutoff" value={shortDate.format(new Date(pool.cutoffAt))} hint="Then funds freeze" />
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
              ["02", "Reversible while forming", `Leave before ${shortDate.format(new Date(pool.cutoffAt))} for an exact release.`],
              ["03", "Frozen during competition", "After cutoff, funded demand remains locked while merchants submit sealed offers."],
              ["04", "No acceptable offer, no purchase", "POOL releases the full reservation if the pool cannot resolve within policy."],
              ["05", "Savings only after settlement", "The MSRP-to-winning-price difference becomes available after capture reconciles."],
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
            <strong>Demand pressure</strong>
            <span>Sample market</span>
          </div>
          <div className={styles.pressureBody}>
            <div className={styles.pressureNumber}>
              <strong>{Math.round(progress)}%</strong>
              <span>of unit target</span>
            </div>
            <div className={styles.progressBlock}>
              <div className={styles.progressCopy}>
                <span><strong>{pool.committedUnitCount}</strong> funded units</span>
                <span>{pool.targetMemberCount} target</span>
              </div>
              <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
            </div>
            <div className={styles.pressureScale}>
              <div><span>Volume</span><i><span style={{ width: `${progress}%` }} /></i></div>
              <div><span>Urgency</span><i><span style={{ width: "42%" }} /></i></div>
              <div><span>Leverage</span><i><span style={{ width: `${Math.min(100, progress + 12)}%` }} /></i></div>
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
  refreshTreasury,
}: {
  modal: Exclude<ModalState, null>;
  workspace: ProductWorkspace;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  setModal: (modal: ModalState) => void;
  setWorkspace: (workspace: ProductWorkspace) => void;
  setToast: (toast: string | null) => void;
  showError: (error: unknown) => void;
  resetWorkspace: () => void;
  refreshTreasury: () => void;
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
            refreshTreasury={refreshTreasury}
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
            ? " Credits are capped by the payment rail’s real remaining spending power."
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
              ? "live Rain sandbox spending power"
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
              ? `Bounded by Rain's live ${cents(treasury.spendingPowerCents)} sandbox spending power. Reading that ceiling is the only Rain call; no card, on-ramp, or Monad write occurs here.`
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
  setWorkspace,
  setModal,
  setToast,
  showError,
}: ModalFormProps & { initialProductId?: string; quickText?: string }) {
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
  const [quantity, setQuantity] = useState("1");
  const [targetPrice, setTargetPrice] = useState(() => {
    const pool = Object.values(workspace.pools).find((candidate) => candidate.productId === inferredProductId);
    return ((pool?.estimatedUnitPriceCents ?? workspace.products[inferredProductId]?.msrpUnitCents ?? 1) / 100).toFixed(2);
  });
  const [waitDays, setWaitDays] = useState("14");
  const selectedProduct = workspace.products[productId];
  const matchingPool = Object.values(workspace.pools).find((pool) => pool.productId === productId);

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
          Confirm the structured mandate POOL will use for matching. This stays in your
          local product sandbox until you join a pool.
        </p>
        {quickText ? <div className={styles.ruleBox}><Sparkles size={15} /><span>Interpreted from: “{quickText}”</span></div> : null}
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
            <select id="intent-window" value={waitDays} onChange={(event) => setWaitDays(event.target.value)}>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
            </select>
          </div>
        </div>
        {matchingPool ? (
          <div className={styles.successBox}>
            <Users size={15} />
            <span>Matching sample pool found: {matchingPool.committedUnitCount} of {matchingPool.targetMemberCount} target units already committed.</span>
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
  const requiredCents = product.msrpUnitCents * quantity;
  const shortageCents = Math.max(0, requiredCents - balance.availableCents);

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
        </div>
        {shortageCents > 0 ? (
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
          <span><strong>Exit rule:</strong> leave before {shortDate.format(new Date(pool.cutoffAt))} for an exact release. After cutoff, funds remain frozen while merchants compete.</span>
        </div>
      </div>
      <footer className={styles.modalFooter}>
        <button className={styles.secondaryButton} type="button" onClick={() => setModal(null)}>Not yet</button>
        {shortageCents > 0 ? (
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
      status: "committed";
      network: string;
      chainId: number;
      commitmentId: string;
      fundingRoot: string;
      termsHash: string;
      unitCount: number;
      reservedCents: number;
      bidClosesAt: string;
      committedAt: string;
      replayed: boolean;
      transactionHash: string | null;
      explorerUrl: string | null;
      message: string;
    }
  | {
      status: "not_configured" | "blocked" | "failed" | "rejected" | "rate_limited";
      message: string;
    };

type SettleResponse =
  | {
      status: "cleared";
      evidence: "rain-sandbox" | "rehearsal";
      aggregateUnits: number;
      volumeDiscountBps: number;
      quantity: number;
      reservedCents: number;
      capturedCents: number;
      releasedCents: number;
      unitPriceCents: number;
      msrpUnitCents: number;
      targetUnitPriceCents: number;
      offers: PublicOffer[];
      winner: PublicOffer;
      message: string;
      monad?: {
        network: string;
        chainId: number;
        commitmentId: string;
        offerRegistration: {
          offerHash: string;
          replayed: boolean;
          transactionHash: string | null;
          explorerUrl: string | null;
        } | null;
        attestation: {
          status: "attested" | "attestation_pending";
          commitmentId: string;
          rainSettlementHash?: string;
          replayed?: boolean;
          transactionHash?: string | null;
          explorerUrl?: string | null;
          message?: string;
        } | null;
      } | null;
      rain?: {
        cardId: string;
        cardLast4: string;
        allowedMcc: string;
        blockedMccProof: { mcc: string; status: string; declinedReason: string };
        transactionId: string;
        settledAmountCents: number;
        idempotencyCached: boolean;
      };
    }
  | {
      status: "no_acceptable_offer";
      aggregateUnits: number;
      reservedCents: number;
      unitsToClear: number | null;
      targetUnitPriceCents: number;
      offers: PublicOffer[];
      message: string;
    }
  | {
      status: "failed" | "rejected" | "rate_limited";
      code?: string;
      compensated?: boolean;
      reservationState?: string;
      message: string;
    };

/**
 * Runs the sealed merchant market for a real commitment and, when Rain is
 * enabled, settles it on the provider.
 *
 * Every figure rendered here comes from the server response. The browser sends
 * only a pool id, a quantity, and an idempotency key, so it cannot influence the
 * clearing price or the captured amount.
 */
function SettleForm({
  workspace,
  membershipId,
  refreshTreasury,
  setWorkspace,
  setModal,
  setToast,
  showError,
}: ModalFormProps & { membershipId: string; refreshTreasury: () => void }) {
  const membership = workspace.memberships[membershipId];
  const pool = membership ? workspace.pools[membership.poolId] : undefined;
  const product = pool ? workspace.products[pool.productId] : undefined;
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<CommitResponse | null>(null);
  const [result, setResult] = useState<SettleResponse | null>(null);

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

  async function run() {
    setRunning(true);
    setResult(null);
    setCommitment(null);
    try {
      // Phase 1: commit funded demand on-chain. Sellers cannot bid until this
      // finalizes, which is what makes the ordering claim verifiable.
      setStage("Freezing coalition and committing funded demand to Monad…");
      let commitmentId: string | undefined;
      const commitResponse = await fetch("/api/pool/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pool-demo-action": "commit-funded-demand",
        },
        cache: "no-store",
        body: JSON.stringify({
          poolId: activePool.id,
          quantity: activeMembership.quantity,
          confirmation: "commit-funded-demand",
        }),
      });
      const commitBody = (await commitResponse.json()) as CommitResponse;
      setCommitment(commitBody);
      if (commitBody.status === "committed") {
        commitmentId = commitBody.commitmentId;
      } else if (commitBody.status === "blocked" || commitBody.status === "failed") {
        setResult({
          status: "failed",
          message: commitBody.message,
          reservationState: "still_reserved",
        });
        return;
      }

      setStage(
        commitmentId
          ? "Demand finalized on-chain. Opening the sealed merchant market…"
          : "Opening the sealed merchant market…",
      );
      const response = await fetch("/api/pool/settle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pool-demo-action": "settle-pool-order",
        },
        cache: "no-store",
        body: JSON.stringify({
          poolId: activePool.id,
          quantity: activeMembership.quantity,
          settlementId: crypto.randomUUID(),
          ...(commitmentId ? { commitmentId } : {}),
          confirmation: "settle-pool-order",
        }),
      });
      const body = (await response.json()) as SettleResponse;
      setResult(body);

      if (body.status === "cleared") {
        // Amounts come from the server; the reducer still refuses any capture
        // larger than the reservation it holds locally.
        const next = reduceProductWorkspace(workspace, {
          type: "pool/settle",
          membershipId: activeMembership.id,
          buyerId: workspace.owner.id,
          evidence: body.evidence,
          unitPriceCents: body.unitPriceCents,
          capturedCents: body.capturedCents,
          merchantName: body.winner.merchantName,
          ...(body.rain
            ? {
                rainTransactionId: body.rain.transactionId,
                rainCardLast4: body.rain.cardLast4,
              }
            : {}),
          activityId: createId("activity-settle"),
          at: new Date().toISOString(),
        });
        setWorkspace(next);
        setToast(
          `${cents(body.releasedCents)} released back to your available balance.`,
        );
        // Real provider money moved, so re-read Rain's own ceiling and charges.
        if (body.evidence === "rain-sandbox") refreshTreasury();
      }
    } catch (error) {
      showError(error);
    } finally {
      setStage(null);
      setRunning(false);
    }
  }

  const cleared = result?.status === "cleared" ? result : null;
  const declined = result?.status === "no_acceptable_offer" ? result : null;
  const failed =
    result && result.status !== "cleared" && result.status !== "no_acceptable_offer"
      ? result
      : null;

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
              POOL freezes this pool’s funded demand, sends one anonymized request to
              every eligible merchant, and awards the cheapest offer that clears the
              published target. Merchants never see each other’s bids or your maximum.
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
                <span>Published target</span>
                <strong>{cents(pool.estimatedUnitPriceCents)} / unit</strong>
              </div>
            </div>
            <div className={styles.ruleBox}>
              <ShieldCheck size={15} />
              <span>
                The browser sends only this pool’s id and your committed quantity. The
                server re-derives MSRP, the clearing price, and the captured amount from
                its own catalog.
              </span>
            </div>
          </>
        ) : null}

        {cleared ? (
          <>
            <div className={styles.reservationBox}>
              <div className={styles.reservationProduct}>
                <ProductGlyph product={product} size={18} />
                <div>
                  <strong>{cleared.winner.merchantName} won the order</strong>
                  <small>
                    {cents(cleared.unitPriceCents)} / unit ·{" "}
                    {cleared.winner.deliveryDays}-day delivery ·{" "}
                    {cleared.winner.warrantyMonths}-month warranty
                  </small>
                </div>
              </div>
              <div className={styles.reservationLine}>
                <span>Sealed bids at {cleared.aggregateUnits} funded units</span>
                <strong>{(cleared.volumeDiscountBps / 100).toFixed(0)}% volume tier</strong>
              </div>
              {cleared.offers.map((offer) => (
                <div className={styles.reservationLine} key={offer.merchantId}>
                  <span>
                    {offer.merchantName}
                    {offer.merchantId === cleared.winner.merchantId ? " · won" : ""}
                  </span>
                  <strong>{cents(offer.unitPriceCents)}</strong>
                </div>
              ))}
              <div className={styles.reservationLine}>
                <span>You reserved</span>
                <strong>{cents(cleared.reservedCents)}</strong>
              </div>
              <div className={styles.reservationLine}>
                <span>Captured</span>
                <strong>{cents(cleared.capturedCents)}</strong>
              </div>
              <div className={classNames(styles.reservationLine, styles.reservationTotal)}>
                <span>Released to you</span>
                <strong>{cents(cleared.releasedCents)}</strong>
              </div>
            </div>

            {cleared.rain ? (
              <div className={styles.ruleBox}>
                <ShieldCheck size={15} />
                <span>
                  <strong>Rain sandbox settled this order.</strong> Scoped card ••••
                  {cleared.rain.cardLast4} was issued for exactly{" "}
                  {cents(cleared.capturedCents)}, restricted to MCC{" "}
                  {cleared.rain.allowedMcc}. An off-policy MCC{" "}
                  {cleared.rain.blockedMccProof.mcc} attempt was{" "}
                  {cleared.rain.blockedMccProof.status} by the provider before any real
                  authorization ran. Transaction {shortId(cleared.rain.transactionId)}.
                  {cleared.rain.idempotencyCached
                    ? " This run replayed a cached idempotent response."
                    : ""}
                </span>
              </div>
            ) : (
              <div className={styles.ruleBox}>
                <Info size={15} />
                <span>
                  <strong>REHEARSAL · SIMULATED.</strong> The market cleared
                  deterministically, but Rain execution is disabled or locked, so no
                  provider transaction was created and no provider id is shown.
                </span>
              </div>
            )}

            {cleared.monad ? (
              <div className={styles.ruleBox}>
                <ShieldCheck size={15} />
                <span>
                  <strong>Monad Testnet proved the ordering.</strong> Funded demand was
                  committed and finalized <em>before</em> any merchant could bid
                  (commitment {shortId(cleared.monad.commitmentId)}), the winning sealed
                  offer was then registered against it, and the Rain transaction set was
                  bound to that exact offer afterwards. Buyer maximums and merchant floors
                  stayed off-chain behind hashes.
                  {cleared.monad.attestation?.status === "attestation_pending"
                    ? " The settlement attestation has not finalized yet, so no on-chain settlement claim is made."
                    : ""}
                  {cleared.monad.offerRegistration?.explorerUrl ? (
                    <>
                      {" "}
                      <a
                        href={cleared.monad.offerRegistration.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View offer registration
                      </a>
                    </>
                  ) : null}
                  {cleared.monad.attestation?.explorerUrl ? (
                    <>
                      {" · "}
                      <a
                        href={cleared.monad.attestation.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View settlement attestation
                      </a>
                    </>
                  ) : null}
                </span>
              </div>
            ) : commitment?.status === "not_configured" ? (
              <div className={styles.ruleBox}>
                <Info size={15} />
                <span>
                  <strong>No on-chain claim.</strong> Monad is not configured in this
                  environment, so the market ran without a commitment transaction. POOL
                  does not assert an ordering proof it cannot show.
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {commitment?.status === "committed" ? (
          <div className={styles.ruleBox}>
            <ShieldCheck size={15} />
            <span>
              <strong>Pre-bid commitment finalized.</strong> {commitment.unitCount} funded
              units ({cents(commitment.reservedCents)}) were committed to Monad Testnet at{" "}
              {commitment.committedAt}
              {commitment.replayed
                ? " (existing commitment verified, no duplicate write)"
                : ""}
              .{" "}
              {commitment.explorerUrl ? (
                <a href={commitment.explorerUrl} target="_blank" rel="noopener noreferrer">
                  View commitment transaction
                </a>
              ) : null}
            </span>
          </div>
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
                <span>Your reservation is untouched</span>
                <strong>{cents(declined.reservedCents)}</strong>
              </div>
            </div>
            <div className={styles.ruleBox}>
              <Info size={15} />
              <span>
                {declined.unitsToClear === null
                  ? "No merchant can reach this pool's published target at any volume tier."
                  : `Merchants reach the target at ${declined.unitsToClear} funded units. More funded demand unlocks a deeper volume tier — that is the entire mechanism.`}
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
          {result ? "Done" : "Cancel"}
        </button>
        {!cleared ? (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={run}
            disabled={running}
          >
            {running ? "Running sealed market…" : result ? "Run again" : "Run the market"}
          </button>
        ) : null}
      </footer>
    </>
  );
}
