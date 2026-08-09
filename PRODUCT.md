# POOL product brief

## Product promise

POOL gives patient buyers a credible way to ask for a better price together.

Instead of clicking “buy now,” a buyer declares what they want, how long they can wait, and the most they are willing to pay. They reserve the item’s full MSRP, join compatible demand, and let merchants compete for the funded order. In the intended production lifecycle, a lower winning offer pays the merchant and releases the difference back to the buyer; the current product surface rehearses that outcome in a browser-local fixture ledger.

The central product insight is simple:

> Buyers trade urgency for leverage. Merchants trade margin for a larger, guaranteed order.

POOL is designed for adults making considered, non-urgent purchases such as electronics, furniture, travel gear, appliances, and other standardized goods where aggregate volume can improve merchant economics.

## Why full commitment matters

A waitlist or poll is not purchase demand. Merchants discount for a pool only when its members are able and committed to transact.

POOL therefore requires `MSRP × quantity` to be available before a buyer joins:

- `available` is funded balance that can still be withdrawn or committed.
- `reserved` is balance locked behind an active group-buy commitment.
- `spent` is the negotiated purchase amount after settlement.
- `released savings` is the difference between the reservation and the winning price.

Before a published commitment cutoff, leaving releases the reservation. After the pool freezes for merchant bidding, membership and funds remain locked until the pool resolves. These rules must be visible before every join action.

## Intended production journey

1. **Fund** — The buyer adds money and sees exactly what is available versus reserved.
2. **Declare** — They name a product, quantity, maximum price, and how long they can wait.
3. **Match** — POOL finds a compatible forming pool or starts a new one.
4. **Commit** — The buyer reviews the pool rules and reserves the full MSRP.
5. **Build demand for two weeks** — Every funded buyer may join during the fixed window; the product shows the actual funded quantity and the 10-unit viability minimum, never a target headcount.
6. **Freeze** — At the two-week cutoff, membership locks and POOL presents however many funded units committed. The minimum decides whether bidding may open; it does not cap enrollment.
7. **Compete** — Merchants privately submit volume offers without seeing competing bids.
8. **Resolve** — POOL accepts a policy-compliant winning offer or releases the full reservation if no acceptable offer exists.
9. **Settle** — The negotiated amount is captured and the difference is released as savings.
10. **Track** — The buyer follows fulfillment, receipt, delivery, returns, and any dispute from the order view.

The current repository implements the buyer-facing journey only through deterministic, mandate-aware merchant clearing after the published cutoff. Product commit and settle routes are rehearsal-only: they return a modeled quote or no-buy outcome, place no aggregate order, and cannot contact Rain or Monad in any environment. Browser-local state and fixture merchants keep this a product sandbox rather than a production commerce backend. The protected technical walkthrough at `/demo` is the only complete three-allocation provider proof.

## Deliverables that work now

### Repeat-use buyer workspace

The default route is a product home rather than a judge presentation. It surfaces:

- available, reserved, committed, and saved amounts;
- active group-buy commitments;
- relevant pools to discover;
- recent account and commitment activity;
- clear entry points to fund and declare a new intent.

### Structured buying intents

A buyer can create an intent with product requirements, quantity, price ceiling, and patience window. Intent creation produces visible product state instead of a decorative success screen.

### Full-MSRP-reserved pool membership

Joining a group buy checks full MSRP coverage and atomically transfers that amount from available to reserved. Duplicate joins and insufficient balances are rejected. Leaving a still-forming pool restores the exact reservation once.

Every seeded product pool is open for exactly 14 days. Ten funded units is the minimum required to proceed to merchant bidding, but there is no target count and no enrollment cap: commitments continue accumulating until the cutoff.

### Browser-persisted state

Workspace state is versioned and stored locally in the browser. It survives page reloads and can be reset for a clean rehearsal. The activity trail is append-only inside that sandbox state.

### Product navigation

| Route | Current deliverable |
| --- | --- |
| `/` | Buyer overview, primary actions, active commitments, discovery, and activity |
| `/explore` | Browse realistic seeded group buys and evaluate commitment terms |
| `/wallet` | Add test funds and inspect available, reserved, released, and spent movements |
| `/orders` | Review active commitments, exact releases, and the future fulfillment lifecycle without fabricating purchases |
| `/demo` | Run the protected fixed Rain + Monad market and three-allocation settlement proof |

### Deterministic commerce domain

Pure transitions enforce integer-cent accounting, sufficient funds, unique membership, exact release, settlement caps, and idempotency. Domain tests cover success and failure paths independently of the UI.

### Fixed-window rehearsal gate

The two-week commitment window is enforced, not merely described:

- Before cutoff, the UI keeps **Run market** unavailable and both rehearsal APIs reject before constructing the local merchant market.
- The exact cutoff opens a deterministic one-hour bid window. The exact end of that hour closes it.
- Missing the 10-unit minimum produces an expected no-market outcome. Because product routes cannot create an external operation, the server returns a stable terminal outcome that lets the browser release its local reservation exactly once.

### Server reconstruction for product rehearsal

The browser submits a strict membership envelope containing identity, pool, intent, quantity, reservation, status, and join time, plus the saved buying intent used for settlement. The server checks their structure, reconciles both to the server-owned fixture catalog, rebuilds `MSRP × quantity`, requires the seeded workspace owner and an active pre-cutoff membership, and calculates aggregate units itself.

From that validated input, the server evaluates fixture offers against the pool target and the buyer’s maximum unit price and delivery deadline. It returns either a modeled quote or a terminal no-buy reason. Even a qualifying quote leaves the full reservation untouched, reports `aggregateOrderPlaced: false`, and becomes eligible only for an explicit full local release; it never books a capture or creates an order/payment.

For a modeled quote, below-minimum, no-acceptable-offer, or expired-window outcome, the server derives a stable operation ID. `pool/release_after_outcome` stores that operation and reason, treats an exact retry as a no-op, and rejects a conflicting or duplicate release. The product does not rely on provider idempotency because these routes categorically perform no provider mutation.

These controls establish structural consistency for a local rehearsal. They do not turn the browser-local membership or mandate into an authenticated account record, prove custody, or replace a durable transactional database. Maximum price and deadline originate in browser state; they are validated and withheld from merchant responses, but remain forgeable without production identity and server-side storage. A production system must move this authority to authenticated server state and reconcile every external event against a double-entry ledger.

### Technical execution proof

The protected `/demo` route provides the only complete proof that the proposed product can connect a fixed full-MSRP-reserved fixture coalition to merchant competition and constrained execution:

- deterministic buyer and market policy;
- compatible-intent coalition formation;
- private merchant floors and quantity tiers;
- tamper-evident funding and offer commitments on Monad Testnet only when finalized explorer evidence is rendered;
- server-only Rain scoped-card authorization and settlement only when verified provider IDs are rendered;
- an enforced off-list MCC `7995` challenge that requires Rain’s exact `scoped_card_mcc_not_allowed` decline;
- three exact Rain sandbox settlement amounts plus fixture-ledger savings reconciliation;
- labeled rehearsal fallback when external integrations are unavailable.

## Sandbox boundaries

The product is deliberately honest about what is and is not live.

| Surface | Current reality | Not yet claimed |
| --- | --- | --- |
| Buyer balance | Versioned browser-local test ledger | Bank balance, stored value, stablecoin custody, or insured deposit |
| Add funds | Deterministic sandbox credit | ACH, wire, card, virtual account, or onchain on-ramp |
| Products and pools | Seeded fixtures for repeatable interaction | Live catalog, real merchant inventory, or binding public offer |
| Buying intent | Persistent local structured state | Authenticated, server-side mandate shared across devices |
| Reservation | Enforced by the sandbox domain | Legal escrow or production custody hold |
| Orders | Simulated product states | Merchant fulfillment, shipment, returns, taxes, or warranty service |
| Rain | Fixed `/demo` can create real event-sandbox records behind an explicit protected gate; the wider workspace may perform a separately gated balance read | Product commit/settle mutation, production card program, or buyer account ledger |
| Monad | Fixed `/demo` can use the Testnet commitment/offer/attestation workflow when configured | Product commit/settle mutation, mainnet settlement, proof of bank funds, or independent oracle truth |
| Identity | Fictional product personas | KYC/KYB, sanctions screening, age verification, or account recovery |

The app should never call the sandbox balance a real bank account, suggest that funds are insured, or imply that a testnet hash independently proves custody. External IDs shown in rehearsal mode must remain labeled **REHEARSAL · SIMULATED**.

## Buyer rules that must remain visible

- The buyer must be at least 18 and eligible for the eventual payment and custody program.
- Joining reserves full MSRP, not the expected discounted price.
- Available balance cannot be withdrawn below active reservations.
- A buyer may leave only before the stated commitment cutoff.
- A product pool accepts all funded commitments during its 14-day window; the 10-unit minimum is an eligibility floor, not a target or cap.
- Every product rehearsal ends without a purchase. A stable terminal outcome leaves the reservation untouched and lets the buyer release it in full exactly once. Ambiguous external outcomes in the fixed provider demo remain locked for reconciliation.
- Merchant bids remain private during competition.
- The final price, fees, taxes, delivery terms, return policy, and lock period require explicit confirmation before a production commitment.
- A partial external failure enters reconciliation; the UI must not claim an immediate refund until the ledger and rail agree.

## Merchant value proposition

POOL offers merchants a funded, time-bounded order rather than anonymous traffic. Merchants can accept a lower unit margin when volume, customer acquisition, payment policy, and fulfillment timing make the total order more attractive.

The intended market mechanism is a sealed competition:

- POOL publishes normalized product requirements, quantity, geography, and fulfillment window.
- It does not disclose individual buyer ceilings or competing merchant offers.
- Merchants submit price and fulfillment terms against the complete order.
- Deterministic policy rejects incomplete, stale, over-budget, or incompatible offers.
- The winning offer becomes immutable before any payment authorization.

Merchant onboarding and a production bidding console are launch deliverables, not features of the current buyer sandbox.

## Production launch gaps

### 1. Regulated money movement

- Select the legal and regulated custody model by launch jurisdiction.
- Integrate ACH/wire/card or stablecoin on-ramp and off-ramp providers.
- Provide authenticated virtual account or wallet routing only where supported by the partner program.
- Implement a durable double-entry ledger with pending, available, reserved, captured, released, disputed, and reconciled states.
- Reconcile provider webhooks and statements independently of browser or request success.
- Define safeguarding, disclosures, fees, withdrawal timing, and failure handling with counsel and partners.

### 2. Identity, risk, and account security

- Add authentication, verified email/phone, session management, and account recovery.
- Complete KYC/KYB, sanctions, fraud, age, and jurisdiction checks appropriate to each participant.
- Protect every state mutation with authorization, replay defense, rate limits, audit logs, and operational controls.
- Encrypt sensitive data and establish key rotation, retention, deletion, and incident response.

### 3. Durable product backend

- Move browser-local intents, balances, memberships, and activity to a transactional database.
- Add concurrency control so the same funds cannot be committed across devices or requests.
- Model pool cutoff, freeze, bidding, award, payment, fulfillment, cancellation, refund, return, and dispute state machines.
- Use durable jobs and idempotent webhooks for every external side effect.
- Add observability, alerting, reconciliation queues, admin review, and customer support tools.

### 4. Supply and fulfillment

- Onboard real merchants and verify inventory, pricing authority, fulfillment capacity, and return terms.
- Build the merchant RFP and sealed-bid workflow.
- Normalize products, variants, shipping regions, taxes, fees, warranties, and delivery promises.
- Establish order routing, shipment tracking, cancellation, return, refund, and dispute ownership.
- Prevent counterfeit, substitution, inventory, and concentration risk.

### 5. Production Rain program

- Obtain approval for the intended card and commerce use case.
- Replace hackathon sandbox identities with verified production entities and scoped authorization policy.
- Ingest webhooks into the durable ledger and reconcile authorization, reversal, clearing, and settlement states.
- Confirm MCC, card-lifetime buffer, dispute, refund, and merchant acceptance behavior for real orders.

### 6. Production Monad posture

- Decide which commitments materially benefit users or auditors before putting them onchain.
- Deploy only after contract review, testnet soak, key-management design, monitoring, and incident controls.
- Separate operator duties and use managed signing or a multisig where appropriate.
- Ship a disclosure and verification path that lets an authorized party reconcile offchain proofs with onchain roots.
- Keep private prices and mandates offchain; treat low-entropy commitment privacy as limited.

### 7. Legal and customer operations

- Define whether POOL, the merchant, or a payments partner is merchant of record.
- Publish binding terms for commitment, cutoff, failed pools, delivery, returns, refunds, and disputes.
- Complete consumer-protection, money-transmission, payments, privacy, tax, and marketing review.
- Provide accessible support, complaint escalation, and clear human intervention for financial exceptions.

## Product success measures

The useful measures are behavioral and economic, not demo clicks:

- percentage of declared intents that become fully funded commitments;
- time from first commitment to the 10-unit viability minimum, plus final funded quantity at the two-week cutoff;
- funded units per pool and commitment retention through cutoff;
- merchant participation and valid bids per frozen pool;
- realized buyer savings after fees and taxes;
- pool resolution, fulfillment, cancellation, refund, and dispute rates;
- repeat commitment rate and time to a second purchase;
- ledger reconciliation exceptions and time to resolution.

POOL should graduate from sandbox to pilot only when its ledger remains exact under concurrency and provider failure, all user-visible money states reconcile to the external rails, and the full failed-pool and refund journey is as clear as the happy path.
