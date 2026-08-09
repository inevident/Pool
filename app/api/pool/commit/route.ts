import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSeededProductWorkspace } from "../../../../lib/product/index";
import {
  buildProductPoolCommitment,
  productReservationSet,
} from "../../../../lib/monad/product-commitment";
import {
  commitCoalitionOnMonad,
  getMonadWriteConfiguration,
  MonadRegistryError,
  verifyMonadOperatorReadiness,
} from "../../../../lib/monad/server";
import { monadExplorerTransactionUrl } from "../../../../lib/monad/registry";
import { canExecuteLiveDemo } from "../../../../lib/security/demo-access";
import {
  assertRateLimit,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";

export const dynamic = "force-dynamic";

/** Sellers get a bounded window to respond once demand is committed. */
const BID_WINDOW_MS = 60 * 60 * 1_000;

const requestSchema = z
  .object({
    poolId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(20),
    confirmation: z.literal("commit-funded-demand"),
  })
  .strict();

function isTrustedRequest(request: NextRequest) {
  if (request.headers.get("x-pool-demo-action") !== "commit-funded-demand") {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return (
      requestUrl.protocol === originUrl.protocol &&
      requestUrl.host === originUrl.host
    );
  } catch {
    return false;
  }
}

/**
 * Commits a product pool's funded demand to Monad Testnet before any seller can
 * bid.
 *
 * This is the causal half of the proof: the registry timestamps the funding root
 * and public terms, so POOL cannot later claim demand was funded earlier, larger,
 * or on different terms than the sellers actually competed against. It publishes
 * hashes only — no buyer ceiling and no merchant floor reaches the chain.
 */
export async function POST(request: NextRequest) {
  try {
    assertRateLimit(request, "pool-commit", { maxRequests: 6, windowMs: 60_000 });
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { status: "rate_limited", message: error.message },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    throw error;
  }

  if (!isTrustedRequest(request)) {
    return NextResponse.json(
      { status: "rejected", message: "Invalid commitment request." },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await readLimitedJson(request, 1_024));
  } catch {
    return NextResponse.json(
      { status: "rejected", message: "Invalid commitment payload." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const configuration = getMonadWriteConfiguration();
  if (!configuration.ready) {
    // Partial or invalid configuration is blocked rather than downgraded, so a
    // half-configured deployment can never quietly present a local proof as a
    // chain proof.
    const blocked = configuration.issues.length > 0;
    return NextResponse.json(
      {
        status: blocked ? "blocked" : "not_configured",
        network: "Monad Testnet",
        message: blocked
          ? "Monad configuration is incomplete or invalid; no commitment was written."
          : "Monad is not configured. The market will run without an on-chain commitment.",
        issues: configuration.issues,
      },
      { status: blocked ? 503 : 200, headers: noStoreHeaders },
    );
  }

  if (!canExecuteLiveDemo(request)) {
    return NextResponse.json(
      { status: "rejected", message: "Live chain writes are locked." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const catalog = createSeededProductWorkspace();
  const pool = catalog.pools[input.poolId];
  if (!pool) {
    return NextResponse.json(
      { status: "rejected", message: "Unknown pool." },
      { status: 404, headers: noStoreHeaders },
    );
  }
  const product = catalog.products[pool.productId];

  const frozenAt = new Date();
  const reservations = productReservationSet({
    pool,
    product,
    buyerId: catalog.owner.id,
    buyerIntentId: `${pool.id}-live-intent`,
    buyerQuantity: input.quantity,
  });

  try {
    await verifyMonadOperatorReadiness();

    const commitment = buildProductPoolCommitment({
      pool,
      product,
      reservations,
      frozenAt: frozenAt.toISOString(),
      bidClosesAt: new Date(frozenAt.getTime() + BID_WINDOW_MS).toISOString(),
    });

    // Writes, then re-reads finalized state before reporting success.
    const result = await commitCoalitionOnMonad(commitment);

    return NextResponse.json(
      {
        status: "committed",
        network: "Monad Testnet",
        chainId: 10_143,
        commitmentId: result.commitmentId,
        fundingRoot: commitment.fundingRoot,
        termsHash: commitment.termsHash,
        unitCount: commitment.unitCount,
        reservedCents: Number(commitment.reservedCents),
        bidClosesAt: new Date(
          Number(commitment.bidClosesAt) * 1_000,
        ).toISOString(),
        committedAt: new Date(Number(result.committedAt) * 1_000).toISOString(),
        replayed: result.replayed,
        transactionHash: result.transaction?.hash ?? null,
        explorerUrl: result.transaction
          ? monadExplorerTransactionUrl(result.transaction.hash)
          : null,
        message: result.replayed
          ? "This coalition was already committed; finalized state was verified without a duplicate write."
          : "Funded demand is committed and finalized. Sellers may now bid.",
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        network: "Monad Testnet",
        code:
          error instanceof MonadRegistryError ? error.code : "MONAD_COMMIT_FAILED",
        message:
          error instanceof MonadRegistryError
            ? error.message
            : "The Monad commitment did not finalize.",
      },
      { status: 502, headers: noStoreHeaders },
    );
  }
}
