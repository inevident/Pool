import {
  deriveSettlementOperationId,
  type ValidatedProductExecution,
} from "./execution.ts";

export type MissedExecutionWindowResolution = {
  readonly status: "execution_window_missed";
  readonly code: "bid_window_closed";
  readonly operationId: string;
  readonly reservedCents: number;
  readonly reservationState: "release_available";
  readonly releaseReason: "execution_window_missed";
  readonly providerOperationState: "impossible_by_design";
  readonly resolutionBasis: "product_rehearsal_only";
  readonly message: string;
};

/**
 * Resolves a missed execution window without guessing about historical money
 * movement.
 *
 * Product commit and settle routes are categorically rehearsal-only in every
 * environment: they import no provider/chain client and cannot create an
 * external operation. That immutable route posture—not mutable deployment
 * configuration—is the proof that the browser-local reservation can release.
 */
export function resolveMissedExecutionWindow(
  execution: ValidatedProductExecution,
): MissedExecutionWindowResolution {
  return Object.freeze({
    status: "execution_window_missed" as const,
    code: "bid_window_closed" as const,
    operationId: deriveSettlementOperationId(execution),
    reservedCents: execution.buyerReservedCents,
    reservationState: "release_available" as const,
    releaseReason: "execution_window_missed" as const,
    providerOperationState: "impossible_by_design" as const,
    resolutionBasis: "product_rehearsal_only" as const,
    message:
      "The product rehearsal window expired. These product routes cannot contact Rain or Monad in any environment, so no external operation exists and the browser-local reservation is eligible for release.",
  });
}
