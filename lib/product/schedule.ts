import { ProductExecutionError } from "./errors.ts";
import {
  PRODUCT_POOL_BID_WINDOW_MS,
  type ProductPool,
} from "./types.ts";

export type ProductExecutionWindow =
  | {
      readonly status: "waiting_for_cutoff";
      readonly code: "waiting_for_cutoff";
      readonly cutoffAt: string;
      readonly bidClosesAt: string;
      readonly serverTime: string;
      readonly remainingMs: number;
    }
  | {
      readonly status: "open";
      readonly cutoffAt: string;
      readonly bidClosesAt: string;
      readonly serverTime: string;
      readonly remainingMs: number;
    }
  | {
      readonly status: "closed";
      readonly code: "bid_window_closed";
      readonly cutoffAt: string;
      readonly bidClosesAt: string;
      readonly serverTime: string;
      readonly remainingMs: 0;
    };

export interface ProductExecutionSchedule {
  readonly createdAt: string;
  readonly cutoffAt: string;
  readonly bidClosesAt: string;
}

/**
 * One canonical schedule derivation shared by browser affordances and server
 * execution. This module is deliberately browser-safe; provider commitment
 * and hashing code live behind the server-only product entry point.
 */
export function productExecutionSchedule(
  pool: ProductPool,
): ProductExecutionSchedule {
  const createdMs = Date.parse(pool.createdAt);
  const cutoffMs = Date.parse(pool.cutoffAt);
  if (
    !Number.isFinite(createdMs) ||
    !Number.isFinite(cutoffMs) ||
    cutoffMs <= createdMs
  ) {
    throw new ProductExecutionError(
      "pool_schedule_invalid",
      "The pool execution schedule is invalid.",
    );
  }
  return Object.freeze({
    createdAt: new Date(createdMs).toISOString(),
    cutoffAt: new Date(cutoffMs).toISOString(),
    bidClosesAt: new Date(cutoffMs + PRODUCT_POOL_BID_WINDOW_MS).toISOString(),
  });
}

/** Exact cutoff opens execution; exact bid close ends it. */
export function evaluateProductExecutionWindow(
  pool: ProductPool,
  nowMs: number = Date.now(),
): ProductExecutionWindow {
  const schedule = productExecutionSchedule(pool);
  const cutoffMs = Date.parse(schedule.cutoffAt);
  const bidClosesMs = Date.parse(schedule.bidClosesAt);
  if (!Number.isFinite(nowMs)) {
    throw new ProductExecutionError(
      "pool_schedule_invalid",
      "The execution clock is invalid.",
    );
  }
  const common = {
    cutoffAt: schedule.cutoffAt,
    bidClosesAt: schedule.bidClosesAt,
    serverTime: new Date(nowMs).toISOString(),
  };
  if (nowMs < cutoffMs) {
    return {
      status: "waiting_for_cutoff",
      code: "waiting_for_cutoff",
      ...common,
      remainingMs: cutoffMs - nowMs,
    };
  }
  if (nowMs >= bidClosesMs) {
    return {
      status: "closed",
      code: "bid_window_closed",
      ...common,
      remainingMs: 0,
    };
  }
  return {
    status: "open",
    ...common,
    remainingMs: bidClosesMs - nowMs,
  };
}
