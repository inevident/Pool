import type { Hex } from "viem";

import type { PreparedCoalitionCommitment } from "./commitment.ts";
import type { MonadFinalizedTransaction } from "./registry.ts";

export interface RuntimeMonadPreparation {
  readonly runKey: string;
  readonly commitment: PreparedCoalitionCommitment;
  readonly commitmentId: Hex;
  readonly commitmentTransaction: MonadFinalizedTransaction | null;
  readonly offerTransactions: readonly (MonadFinalizedTransaction | null)[];
  readonly preparedAt: string;
}

let runtimePreparation: RuntimeMonadPreparation | undefined;

export const getRuntimeMonadPreparation = () => runtimePreparation;

export const rememberRuntimeMonadPreparation = (
  preparation: RuntimeMonadPreparation,
) => {
  runtimePreparation = preparation;
  return preparation;
};

/** Test-only/reset hook; production callers should never clear an active proof. */
export const clearRuntimeMonadPreparation = () => {
  runtimePreparation = undefined;
};
