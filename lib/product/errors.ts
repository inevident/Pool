export type ProductExecutionRejectionCode =
  | "pool_not_found"
  | "product_not_found"
  | "membership_pool_mismatch"
  | "membership_buyer_mismatch"
  | "membership_not_active"
  | "membership_reservation_mismatch"
  | "membership_joined_after_cutoff"
  | "intent_identity_mismatch"
  | "intent_price_incompatible"
  | "intent_deadline_incompatible"
  | "pool_schedule_invalid";

export class ProductExecutionError extends Error {
  readonly code: ProductExecutionRejectionCode;

  constructor(code: ProductExecutionRejectionCode, message: string) {
    super(message);
    this.name = "ProductExecutionError";
    this.code = code;
  }
}
