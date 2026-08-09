import { createHash } from "node:crypto";

export interface RainAuthorizedAllocation {
  readonly buyerId: string;
  readonly transactionId: string;
}

export interface RainSettledAllocation {
  readonly buyerId: string;
  readonly transactionId: string;
}

export interface RainCompensationAttempt {
  readonly buyerId: string;
  readonly transactionId: string;
  readonly idempotencyKey: string;
  readonly reversed: boolean;
}

/**
 * Provider keys stay stable without embedding an unbounded caller identifier.
 * The run key is server-derived and the buyer digest is deterministic.
 */
export function demoCompensationIdempotencyKey(
  runKey: string,
  buyerId: string,
) {
  const buyerDigest = createHash("sha256")
    .update(buyerId, "utf8")
    .digest("hex")
    .slice(0, 12);
  return `${runKey}-c-${buyerDigest}`;
}

/**
 * Reverses every authorization that is not represented in settled provider
 * evidence. Settled allocations are never reversed; a failed reversal is
 * surfaced so the caller can keep the simulated reservation locked for
 * reconciliation instead of claiming a clean rollback.
 */
export async function compensateUnsettledRainAuthorizations(input: {
  readonly runKey: string;
  readonly authorized: readonly RainAuthorizedAllocation[];
  readonly settled: readonly RainSettledAllocation[];
  readonly reverse: (request: {
    transactionId: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
}): Promise<readonly RainCompensationAttempt[]> {
  const settledBuyers = new Set(input.settled.map((entry) => entry.buyerId));
  const attempts: RainCompensationAttempt[] = [];

  for (const authorization of input.authorized) {
    if (settledBuyers.has(authorization.buyerId)) continue;
    const idempotencyKey = demoCompensationIdempotencyKey(
      input.runKey,
      authorization.buyerId,
    );
    try {
      await input.reverse({
        transactionId: authorization.transactionId,
        idempotencyKey,
      });
      attempts.push({ ...authorization, idempotencyKey, reversed: true });
    } catch {
      attempts.push({ ...authorization, idempotencyKey, reversed: false });
    }
  }

  return Object.freeze(attempts.map((attempt) => Object.freeze(attempt)));
}

export function rainCompensationRequiresReconciliation(input: {
  readonly settledCount: number;
  readonly attempts: readonly RainCompensationAttempt[];
}) {
  return (
    input.settledCount > 0 ||
    input.attempts.some((attempt) => !attempt.reversed)
  );
}
