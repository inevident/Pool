export type FundingCurrency = "USD";

export type ReservationState =
  | "active"
  | "frozen"
  | "settled"
  | "released"
  | "reconciliation_required";

export interface FundingAccount {
  readonly buyerId: string;
  readonly currency: FundingCurrency;
  readonly depositedCents: number;
  readonly availableCents: number;
  readonly reservedCents: number;
  readonly capturedCents: number;
  readonly withdrawnCents: number;
}

export interface FundsReservation {
  readonly id: string;
  readonly poolId: string;
  readonly intentId: string;
  readonly buyerId: string;
  readonly productSku: string;
  readonly quantity: number;
  readonly msrpUnitCents: number;
  readonly currency: FundingCurrency;
  readonly reservedCents: number;
  readonly capturedCents: number;
  readonly releasedCents: number;
  readonly state: ReservationState;
  readonly createdAt: string;
  readonly frozenAt?: string;
  readonly closedAt?: string;
}

interface FundingOperationRecord {
  readonly fingerprint: string;
  readonly reservationId?: string;
}

export interface FundingLedger {
  readonly accounts: Readonly<Record<string, FundingAccount>>;
  readonly reservations: Readonly<Record<string, FundsReservation>>;
  readonly idempotency: Readonly<Record<string, FundingOperationRecord>>;
}

export interface FundingMutationResult {
  readonly ledger: FundingLedger;
  readonly replayed: boolean;
  readonly reservation?: FundsReservation;
}

export class FundingInvariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FundingInvariantError";
    this.code = code;
  }
}

const requireMoney = (value: number, label: string, allowZero = false) => {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new FundingInvariantError(
      "INVALID_MONEY",
      `${label} must be ${allowZero ? "a non-negative" : "a positive"} integer number of cents.`,
    );
  }
};

const requireText = (value: string, label: string) => {
  if (!value.trim()) {
    throw new FundingInvariantError("INVALID_IDENTIFIER", `${label} is required.`);
  }
};

const requireIdempotencyKey = (value: string) => {
  requireText(value, "Idempotency key");
  if (value.length > 64) {
    throw new FundingInvariantError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency keys cannot exceed 64 characters.",
    );
  }
};

const fingerprint = (kind: string, value: Record<string, unknown>) =>
  JSON.stringify({ kind, ...value });

const reservationId = (poolId: string, intentId: string) =>
  `reserve:${poolId}:${intentId}`;

const getAccount = (ledger: FundingLedger, buyerId: string) =>
  ledger.accounts[buyerId] ?? {
    buyerId,
    currency: "USD" as const,
    depositedCents: 0,
    availableCents: 0,
    reservedCents: 0,
    capturedCents: 0,
    withdrawnCents: 0,
  };

const replay = (
  ledger: FundingLedger,
  idempotencyKey: string,
  operationFingerprint: string,
): FundingMutationResult | undefined => {
  requireIdempotencyKey(idempotencyKey);
  const prior = ledger.idempotency[idempotencyKey];
  if (!prior) return undefined;
  if (prior.fingerprint !== operationFingerprint) {
    throw new FundingInvariantError(
      "IDEMPOTENCY_CONFLICT",
      "This idempotency key was already used for a different funding operation.",
    );
  }
  return {
    ledger,
    replayed: true,
    ...(prior.reservationId
      ? { reservation: ledger.reservations[prior.reservationId] }
      : {}),
  };
};

const record = (
  ledger: FundingLedger,
  idempotencyKey: string,
  operationFingerprint: string,
  reservation?: FundsReservation,
): FundingLedger => ({
  ...ledger,
  idempotency: {
    ...ledger.idempotency,
    [idempotencyKey]: {
      fingerprint: operationFingerprint,
      ...(reservation ? { reservationId: reservation.id } : {}),
    },
  },
});

const withAccount = (ledger: FundingLedger, account: FundingAccount): FundingLedger => ({
  ...ledger,
  accounts: { ...ledger.accounts, [account.buyerId]: account },
});

const withReservation = (
  ledger: FundingLedger,
  reservation: FundsReservation,
): FundingLedger => ({
  ...ledger,
  reservations: { ...ledger.reservations, [reservation.id]: reservation },
});

export const createFundingLedger = (): FundingLedger => ({
  accounts: {},
  reservations: {},
  idempotency: {},
});

export function assertFundingLedgerInvariant(ledger: FundingLedger) {
  for (const account of Object.values(ledger.accounts)) {
    requireMoney(account.depositedCents, "Deposited balance", true);
    requireMoney(account.availableCents, "Available balance", true);
    requireMoney(account.reservedCents, "Reserved balance", true);
    requireMoney(account.capturedCents, "Captured balance", true);
    requireMoney(account.withdrawnCents, "Withdrawn balance", true);
    const accounted =
      account.availableCents +
      account.reservedCents +
      account.capturedCents +
      account.withdrawnCents;
    if (accounted !== account.depositedCents) {
      throw new FundingInvariantError(
        "ACCOUNT_NOT_RECONCILED",
        `Account ${account.buyerId} does not reconcile to its cleared deposits.`,
      );
    }

    const openReservations = Object.values(ledger.reservations)
      .filter(
        (reservation) =>
          reservation.buyerId === account.buyerId &&
          ["active", "frozen", "reconciliation_required"].includes(
            reservation.state,
          ),
      )
      .reduce((total, reservation) => total + reservation.reservedCents, 0);
    if (openReservations !== account.reservedCents) {
      throw new FundingInvariantError(
        "RESERVATIONS_NOT_RECONCILED",
        `Account ${account.buyerId} does not reconcile to its open reservations.`,
      );
    }
  }
  return true;
}

export function depositFunds(
  input: {
    buyerId: string;
    amountCents: number;
    currency: FundingCurrency;
    idempotencyKey: string;
  },
  ledger: FundingLedger,
): FundingMutationResult {
  requireText(input.buyerId, "Buyer ID");
  requireMoney(input.amountCents, "Deposit");
  const operationFingerprint = fingerprint("deposit", input);
  const prior = replay(ledger, input.idempotencyKey, operationFingerprint);
  if (prior) return prior;

  const current = getAccount(ledger, input.buyerId);
  if (current.currency !== input.currency) {
    throw new FundingInvariantError(
      "CURRENCY_MISMATCH",
      "Deposits must use the account currency.",
    );
  }
  const account: FundingAccount = {
    ...current,
    depositedCents: current.depositedCents + input.amountCents,
    availableCents: current.availableCents + input.amountCents,
  };
  const next = record(
    withAccount(ledger, account),
    input.idempotencyKey,
    operationFingerprint,
  );
  assertFundingLedgerInvariant(next);
  return { ledger: next, replayed: false };
}

export function withdrawAvailableFunds(
  input: {
    buyerId: string;
    amountCents: number;
    currency: FundingCurrency;
    idempotencyKey: string;
  },
  ledger: FundingLedger,
): FundingMutationResult {
  requireText(input.buyerId, "Buyer ID");
  requireMoney(input.amountCents, "Withdrawal");
  const operationFingerprint = fingerprint("withdraw", input);
  const prior = replay(ledger, input.idempotencyKey, operationFingerprint);
  if (prior) return prior;

  const current = getAccount(ledger, input.buyerId);
  if (current.currency !== input.currency) {
    throw new FundingInvariantError(
      "CURRENCY_MISMATCH",
      "Withdrawals must use the account currency.",
    );
  }
  if (current.availableCents < input.amountCents) {
    throw new FundingInvariantError(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      "Reserved funds cannot be withdrawn or reused.",
    );
  }
  const account: FundingAccount = {
    ...current,
    availableCents: current.availableCents - input.amountCents,
    withdrawnCents: current.withdrawnCents + input.amountCents,
  };
  const next = record(
    withAccount(ledger, account),
    input.idempotencyKey,
    operationFingerprint,
  );
  assertFundingLedgerInvariant(next);
  return { ledger: next, replayed: false };
}

export function joinPool(
  input: {
    poolId: string;
    intentId: string;
    buyerId: string;
    productSku: string;
    quantity: number;
    msrpUnitCents: number;
    currency: FundingCurrency;
    idempotencyKey: string;
    now: string;
  },
  ledger: FundingLedger,
): FundingMutationResult {
  requireText(input.poolId, "Pool ID");
  requireText(input.intentId, "Intent ID");
  requireText(input.buyerId, "Buyer ID");
  requireText(input.productSku, "Product SKU");
  requireMoney(input.quantity, "Quantity");
  requireMoney(input.msrpUnitCents, "MSRP");
  const operationFingerprint = fingerprint("join", input);
  const prior = replay(ledger, input.idempotencyKey, operationFingerprint);
  if (prior) return prior;

  const id = reservationId(input.poolId, input.intentId);
  if (ledger.reservations[id]) {
    throw new FundingInvariantError(
      "INTENT_ALREADY_RESERVED",
      "This buying intent already has a reservation for the pool.",
    );
  }
  if (
    Object.values(ledger.reservations).some(
      (reservation) =>
        reservation.intentId === input.intentId &&
        ["active", "frozen", "reconciliation_required"].includes(
          reservation.state,
        ),
    )
  ) {
    throw new FundingInvariantError(
      "INTENT_ALREADY_COMMITTED",
      "One buying intent cannot commit the same funds to multiple pools.",
    );
  }

  const requiredCents = input.quantity * input.msrpUnitCents;
  requireMoney(requiredCents, "MSRP reservation");
  const current = getAccount(ledger, input.buyerId);
  if (current.currency !== input.currency) {
    throw new FundingInvariantError(
      "CURRENCY_MISMATCH",
      "The reservation currency must match the account.",
    );
  }
  if (current.availableCents < requiredCents) {
    throw new FundingInvariantError(
      "INSUFFICIENT_CLEARED_BALANCE",
      "The buyer must have at least MSRP × quantity available before joining.",
    );
  }

  const reservation: FundsReservation = {
    id,
    poolId: input.poolId,
    intentId: input.intentId,
    buyerId: input.buyerId,
    productSku: input.productSku,
    quantity: input.quantity,
    msrpUnitCents: input.msrpUnitCents,
    currency: input.currency,
    reservedCents: requiredCents,
    capturedCents: 0,
    releasedCents: 0,
    state: "active",
    createdAt: input.now,
  };
  const account: FundingAccount = {
    ...current,
    availableCents: current.availableCents - requiredCents,
    reservedCents: current.reservedCents + requiredCents,
  };
  let next = withReservation(withAccount(ledger, account), reservation);
  next = record(next, input.idempotencyKey, operationFingerprint, reservation);
  assertFundingLedgerInvariant(next);
  return { ledger: next, replayed: false, reservation };
}

export function freezeReservation(
  input: { reservationId: string; idempotencyKey: string; now: string },
  ledger: FundingLedger,
): FundingMutationResult {
  const operationFingerprint = fingerprint("freeze", input);
  const prior = replay(ledger, input.idempotencyKey, operationFingerprint);
  if (prior) return prior;
  const current = ledger.reservations[input.reservationId];
  if (!current) {
    throw new FundingInvariantError("RESERVATION_NOT_FOUND", "Reservation not found.");
  }
  if (current.state !== "active") {
    throw new FundingInvariantError(
      "RESERVATION_NOT_ACTIVE",
      "Only an active reservation can cross the commitment cutoff.",
    );
  }
  const reservation: FundsReservation = {
    ...current,
    state: "frozen",
    frozenAt: input.now,
  };
  let next = withReservation(ledger, reservation);
  next = record(next, input.idempotencyKey, operationFingerprint, reservation);
  assertFundingLedgerInvariant(next);
  return { ledger: next, replayed: false, reservation };
}

export function leavePool(
  input: { reservationId: string; idempotencyKey: string; now: string },
  ledger: FundingLedger,
): FundingMutationResult {
  const operationFingerprint = fingerprint("leave", input);
  const prior = replay(ledger, input.idempotencyKey, operationFingerprint);
  if (prior) return prior;
  const current = ledger.reservations[input.reservationId];
  if (!current) {
    throw new FundingInvariantError("RESERVATION_NOT_FOUND", "Reservation not found.");
  }
  if (current.state !== "active") {
    throw new FundingInvariantError(
      "COMMITMENT_CUTOFF_PASSED",
      "Leaving is allowed only before the accepted-offer commitment cutoff.",
    );
  }
  const currentAccount = getAccount(ledger, current.buyerId);
  const reservation: FundsReservation = {
    ...current,
    state: "released",
    releasedCents: current.reservedCents,
    closedAt: input.now,
  };
  const account: FundingAccount = {
    ...currentAccount,
    availableCents: currentAccount.availableCents + current.reservedCents,
    reservedCents: currentAccount.reservedCents - current.reservedCents,
  };
  let next = withReservation(withAccount(ledger, account), reservation);
  next = record(next, input.idempotencyKey, operationFingerprint, reservation);
  assertFundingLedgerInvariant(next);
  return { ledger: next, replayed: false, reservation };
}

export function settleReservation(
  input: {
    reservationId: string;
    captureCents: number;
    idempotencyKey: string;
    now: string;
  },
  ledger: FundingLedger,
): FundingMutationResult {
  requireMoney(input.captureCents, "Capture");
  const operationFingerprint = fingerprint("settle", input);
  const prior = replay(ledger, input.idempotencyKey, operationFingerprint);
  if (prior) return prior;
  const current = ledger.reservations[input.reservationId];
  if (!current) {
    throw new FundingInvariantError("RESERVATION_NOT_FOUND", "Reservation not found.");
  }
  if (current.state !== "frozen") {
    throw new FundingInvariantError(
      "RESERVATION_NOT_FROZEN",
      "Settlement requires a reservation frozen at the commitment cutoff.",
    );
  }
  if (input.captureCents > current.reservedCents) {
    throw new FundingInvariantError(
      "CAPTURE_EXCEEDS_RESERVATION",
      "The negotiated capture cannot exceed the MSRP reservation.",
    );
  }
  const releasedCents = current.reservedCents - input.captureCents;
  const currentAccount = getAccount(ledger, current.buyerId);
  const reservation: FundsReservation = {
    ...current,
    state: "settled",
    capturedCents: input.captureCents,
    releasedCents,
    closedAt: input.now,
  };
  const account: FundingAccount = {
    ...currentAccount,
    availableCents: currentAccount.availableCents + releasedCents,
    reservedCents: currentAccount.reservedCents - current.reservedCents,
    capturedCents: currentAccount.capturedCents + input.captureCents,
  };
  let next = withReservation(withAccount(ledger, account), reservation);
  next = record(next, input.idempotencyKey, operationFingerprint, reservation);
  assertFundingLedgerInvariant(next);
  return { ledger: next, replayed: false, reservation };
}

export function markReconciliationRequired(
  input: { reservationId: string; idempotencyKey: string; now: string },
  ledger: FundingLedger,
): FundingMutationResult {
  const operationFingerprint = fingerprint("reconcile", input);
  const prior = replay(ledger, input.idempotencyKey, operationFingerprint);
  if (prior) return prior;
  const current = ledger.reservations[input.reservationId];
  if (!current) {
    throw new FundingInvariantError("RESERVATION_NOT_FOUND", "Reservation not found.");
  }
  if (current.state !== "frozen") {
    throw new FundingInvariantError(
      "RESERVATION_NOT_FROZEN",
      "Only a frozen reservation can enter reconciliation.",
    );
  }
  const reservation: FundsReservation = {
    ...current,
    state: "reconciliation_required",
  };
  let next = withReservation(ledger, reservation);
  next = record(next, input.idempotencyKey, operationFingerprint, reservation);
  assertFundingLedgerInvariant(next);
  return { ledger: next, replayed: false, reservation };
}

export const HERO_FUNDING_INPUTS = [
  {
    buyerId: "buyer-harbor",
    buyerName: "Harbor Labs",
    intentId: "intent-harbor",
    quantity: 3,
  },
  {
    buyerId: "buyer-patchwork",
    buyerName: "Patchwork AI",
    intentId: "intent-patchwork",
    quantity: 4,
  },
  {
    buyerId: "buyer-kernel",
    buyerName: "Kernel Works",
    intentId: "intent-kernel",
    quantity: 5,
  },
] as const;

const HERO_POOL_ID = "pool-dev-displays-001";
const HERO_PRODUCT_SKU = "DISPLAY-27-4K-IPS-USBC";
const HERO_MSRP_UNIT_CENTS = 47_900;
const HERO_DEAL_UNIT_CENTS = 38_900;

export function buildHeroFundingDemo() {
  let fundedLedger = createFundingLedger();
  for (const buyer of HERO_FUNDING_INPUTS) {
    fundedLedger = depositFunds(
      {
        buyerId: buyer.buyerId,
        amountCents: buyer.quantity * HERO_MSRP_UNIT_CENTS,
        currency: "USD",
        idempotencyKey: `hero-${buyer.buyerId}-deposit`,
      },
      fundedLedger,
    ).ledger;
  }

  let reservedLedger = fundedLedger;
  for (const buyer of HERO_FUNDING_INPUTS) {
    reservedLedger = joinPool(
      {
        poolId: HERO_POOL_ID,
        intentId: buyer.intentId,
        buyerId: buyer.buyerId,
        productSku: HERO_PRODUCT_SKU,
        quantity: buyer.quantity,
        msrpUnitCents: HERO_MSRP_UNIT_CENTS,
        currency: "USD",
        idempotencyKey: `hero-${buyer.buyerId}-join`,
        now: "2026-08-08T16:58:00.000Z",
      },
      reservedLedger,
    ).ledger;
  }

  let frozenLedger = reservedLedger;
  for (const buyer of HERO_FUNDING_INPUTS) {
    frozenLedger = freezeReservation(
      {
        reservationId: reservationId(HERO_POOL_ID, buyer.intentId),
        idempotencyKey: `hero-${buyer.buyerId}-freeze`,
        now: "2026-08-08T17:12:00.000Z",
      },
      frozenLedger,
    ).ledger;
  }

  let settledLedger = frozenLedger;
  for (const buyer of HERO_FUNDING_INPUTS) {
    settledLedger = settleReservation(
      {
        reservationId: reservationId(HERO_POOL_ID, buyer.intentId),
        captureCents: buyer.quantity * HERO_DEAL_UNIT_CENTS,
        idempotencyKey: `hero-${buyer.buyerId}-settle`,
        now: "2026-08-08T17:15:00.000Z",
      },
      settledLedger,
    ).ledger;
  }

  const frozenReservations = HERO_FUNDING_INPUTS.map((buyer) =>
    frozenLedger.reservations[reservationId(HERO_POOL_ID, buyer.intentId)],
  );
  const settledReservations = HERO_FUNDING_INPUTS.map((buyer) =>
    settledLedger.reservations[reservationId(HERO_POOL_ID, buyer.intentId)],
  );

  return {
    poolId: HERO_POOL_ID,
    productSku: HERO_PRODUCT_SKU,
    currency: "USD" as const,
    msrpUnitCents: HERO_MSRP_UNIT_CENTS,
    dealUnitCents: HERO_DEAL_UNIT_CENTS,
    buyers: HERO_FUNDING_INPUTS,
    fundedLedger,
    reservedLedger,
    frozenLedger,
    settledLedger,
    frozenReservations,
    settledReservations,
    summary: {
      totalDepositedCents: HERO_FUNDING_INPUTS.reduce(
        (total, buyer) => total + buyer.quantity * HERO_MSRP_UNIT_CENTS,
        0,
      ),
      totalReservedCents: frozenReservations.reduce(
        (total, reservation) => total + reservation.reservedCents,
        0,
      ),
      totalCapturedCents: settledReservations.reduce(
        (total, reservation) => total + reservation.capturedCents,
        0,
      ),
      totalReleasedCents: settledReservations.reduce(
        (total, reservation) => total + reservation.releasedCents,
        0,
      ),
      buyers: settledReservations.map((reservation) => ({
        buyerId: reservation.buyerId,
        intentId: reservation.intentId,
        reservationId: reservation.id,
        quantity: reservation.quantity,
        msrpUnitCents: reservation.msrpUnitCents,
        reservedCents: reservation.reservedCents,
        capturedCents: reservation.capturedCents,
        releasedCents: reservation.releasedCents,
        availableAfterCents:
          settledLedger.accounts[reservation.buyerId]?.availableCents ?? 0,
      })),
    },
  };
}

export const HERO_FUNDING = buildHeroFundingDemo();
