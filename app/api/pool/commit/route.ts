import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createCanonicalProductWorkspace,
  deriveSettlementOperationId,
  evaluateProductExecutionWindow,
  evaluateProductPoolFunding,
  poolMembershipEnvelopeSchema,
  ProductExecutionError,
  resolveMissedExecutionWindow,
  validateProductExecutionMembership,
} from "../../../../lib/product/server";
import {
  assertRateLimit,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "../../../../lib/agent/http";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    poolId: z.string().min(1).max(64),
    membership: poolMembershipEnvelopeSchema,
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
 * Product-page commitments remain local rehearsal data for this release. The
 * seeded coalition has no complete provider allocation set, so publishing an
 * aggregate Monad commitment would imply an executable order that does not
 * exist. The fixed /demo route retains the complete live proof.
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
      {
        status: "rejected",
        code: "untrusted_request",
        message: "Invalid commitment request.",
      },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await readLimitedJson(request, 4_096));
  } catch {
    return NextResponse.json(
      {
        status: "rejected",
        code: "invalid_membership_envelope",
        message: "Invalid product commitment payload.",
      },
      { status: 400, headers: noStoreHeaders },
    );
  }

  let execution: ReturnType<typeof validateProductExecutionMembership>;
  try {
    execution = validateProductExecutionMembership({
      workspace: createCanonicalProductWorkspace(),
      poolId: input.poolId,
      membership: input.membership,
    });
  } catch (error) {
    const executionError =
      error instanceof ProductExecutionError ? error : null;
    return NextResponse.json(
      {
        status: "rejected",
        code: executionError?.code ?? "invalid_membership_envelope",
        message: executionError?.message ?? "Invalid membership envelope.",
      },
      {
        status: executionError?.code === "pool_not_found" ? 404 : 409,
        headers: noStoreHeaders,
      },
    );
  }

  const executionWindow = evaluateProductExecutionWindow(execution.pool);
  if (executionWindow.status === "waiting_for_cutoff") {
    return NextResponse.json(
      {
        ...executionWindow,
        poolId: execution.pool.id,
        reservationState: "still_reserved",
        message:
          "Funded demand remains open until the published cutoff. No chain or provider action occurred.",
      },
      { status: 409, headers: noStoreHeaders },
    );
  }
  if (executionWindow.status === "closed") {
    const resolution = resolveMissedExecutionWindow(execution);
    return NextResponse.json(
      {
        ...resolution,
        poolId: execution.pool.id,
        cutoffAt: executionWindow.cutoffAt,
        bidClosesAt: executionWindow.bidClosesAt,
        serverTime: executionWindow.serverTime,
      },
      {
        status: 200,
        headers: noStoreHeaders,
      },
    );
  }

  const aggregateUnits = execution.aggregateUnits;
  const fundingStatus = evaluateProductPoolFunding({
    pool: execution.pool,
    aggregateFundedUnitCount: aggregateUnits,
  });
  if (!fundingStatus.hasMetMinimum) {
    return NextResponse.json(
      {
        status: "below_minimum",
        code: "minimum_funded_units_not_met",
        operationId: deriveSettlementOperationId(execution),
        poolId: execution.pool.id,
        aggregateUnits,
        minimumCommittedUnitCount: fundingStatus.minimumCommittedUnitCount,
        unitsNeeded: fundingStatus.unitsNeeded,
        reservationState: "release_available",
        releaseReason: "minimum_not_met",
        message:
          "The local pool is below its bidding minimum. No chain or provider action occurred, so the browser-local reservation is eligible for release.",
      },
      { headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    {
      status: "rehearsal_only",
      evidence: "rehearsal",
      code: "aggregate_provider_allocations_unavailable",
      operationId: deriveSettlementOperationId(execution),
      poolId: execution.pool.id,
      aggregateUnits,
      minimumCommittedUnitCount: fundingStatus.minimumCommittedUnitCount,
      aggregateOrderPlaced: false,
      reservationState: "still_reserved",
      message:
        "The product-page coalition has no complete provider allocation set. No Monad commitment, aggregate order, or Rain transaction was created; continue with the local mandate-aware rehearsal.",
    },
    { headers: noStoreHeaders },
  );
}
