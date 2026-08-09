# POOL

**Turn patience into bargaining power.**

[Open the public `main` baseline](https://pool-agentic-market-preview-20260808-yeayea.vercel.app) · [Open its fixed technical demo](https://pool-agentic-market-preview-20260808-yeayea.vercel.app/demo)

> **Deployment status, verified 2026-08-09:** these public links served `main@9b12002` when checked. No `overnight` deployment has been verified, Vercel Git integration is not connected, and no future deployment URL is being guessed here. The Vercel Preview environment contained only `OPENAI_API_KEY`; without Rain or Monad configuration, that environment must present provider activity as rehearsal or unavailable.

POOL is a repeat-use group-buying product for people who are willing to wait for a better price. In the intended lifecycle, a buyer funds an account, describes what they want, and joins a compatible buying pool only when available balance covers the item’s full MSRP; POOL aggregates committed demand, lets merchants compete, captures the negotiated amount, and releases the difference. The current product surface models that lifecycle as a quote-only browser rehearsal. Only the protected fixed `/demo` can create labeled Rain sandbox settlement evidence.

The default experience is a functioning product sandbox, not a scripted presentation. Buyers can add test funds, create buying intents, join and leave forming pools, inspect commitments, and follow balance activity. Product state persists in the browser across reloads.

> **Sandbox notice:** every balance, pool, product, order, and merchant shown in the product workspace is test data. POOL does not provide a real bank account, accept real deposits, custody customer funds, or place production orders from this repository.

## Product workspace

Run the app and open `http://localhost:3000`:

| Route | Product job |
| --- | --- |
| `/` | Buyer home: available and reserved balances, active commitments, matching pools, and recent activity |
| `/explore` | Discover group buys and inspect their price target, fixture committed units, minimum, and two-week close |
| `/wallet` | Add sandbox funds, optionally label a ceiling from a session-gated Rain sandbox balance read, and audit local activity |
| `/orders` | Track commitments, exact releases, and the disclosed path to future fulfillment |
| `/demo` | Replay the protected fixed technical proof; it is the only route with the complete three-allocation provider flow |

**The pool you join is the pool the product rehearses.** Each pool accepts every funded commitment submitted during its fixed two-week window. Ten funded units is the minimum needed to open the local merchant rehearsal, not a target or cap. At the close, POOL uses the actual fixture quantity and evaluates three simulated merchant offers against the buyer’s saved maximum and deadline. A qualifying result is a modeled quote only: the reservation stays untouched until the buyer explicitly releases it, and no aggregate order, payment, Rain mutation, or Monad mutation is created.

The product workspace supports these complete sandbox interactions:

- Add test funds to the available balance.
- Create a structured buying intent with a product, maximum price, quantity, and patience window.
- Join a forming pool only when the full MSRP commitment is available.
- Atomically move a joined commitment from `available` to `reserved`.
- Reject insufficient-balance and duplicate-commitment attempts.
- Leave before the commitment cutoff and release the reservation exactly once.
- Keep accepting funded buyers above the 10-unit minimum until the two-week window closes; there is no target enrollment count.
- Review commitments, savings, and an append-only trail within the current browser workspace instance.
- Keep the workspace state across reloads with versioned browser-local persistence.
- After the published cutoff, run a deterministic mandate-aware merchant rehearsal on the browser-held commitment; no product-page Rain or Monad mutation is possible.
- Watch a pool refuse to buy when it misses the minimum or no merchant can beat the published price target.
- Reset the sandbox without triggering an external or financial operation.

The prominent Sony WH-1000XM6 pool reflects the product’s intended use: the buyer does not need the item immediately, but will fully commit today in exchange for access to a stronger group price later.

See [`PRODUCT.md`](./PRODUCT.md) for the product promise, end-to-end journey, current deliverables, trust boundaries, and production launch gaps.

New engineers and coding agents should begin with [`handoff.md`](./handoff.md), the comprehensive product, hackathon, architecture, security, operations, deployment, and roadmap handoff.

Presenters should use the editable [`POOL_PITCH.pptx`](./POOL_PITCH.pptx) deck with [`PITCH.md`](./PITCH.md) for the verbatim 90-second talk track, then [`DEMO.md`](./DEMO.md) for the exact operator flow and fallbacks.

The current `overnight` worktree includes a dated [Rain sandbox outcome capture](./public/evidence/rain-sandbox-2026-08-09.png) and [sanitized outcome record](./public/evidence/rain-sandbox-2026-08-09.json) from the fixed fixture. They show three provider-settled sandbox records and the rejected MCC `7995` probe. Both explicitly label Monad as local-only; they are not evidence of a Testnet transaction and no real money moved. The public `main@9b12002` baseline must not be cited as hosting these branch artifacts until a new deployment is verified.

## Commitment model

POOL’s fixture ledger uses a full-MSRP reservation to make every participant credible demand:

1. Deposit at least `MSRP × quantity` into the buyer’s available balance.
2. Joining atomically moves that amount from `available` to `reserved`.
3. Reserved funds cannot be withdrawn or reused for another purchase.
4. Leaving before the published commitment cutoff releases the full reservation.
5. Every pool stays open for 14 days and accepts all funded commitments during that window.
6. Ten funded units is the minimum required to proceed, never a target or cap.
7. Once membership freezes, POOL presents the final actual funded quantity to merchants.
8. At settlement, POOL captures `negotiated price × quantity` and releases the MSRP-to-deal difference as savings.

Step 8 is the intended provider-backed lifecycle, not current product-page behavior. The product rehearsal returns a modeled quote, creates no capture/order/payment, and keeps the full local reservation untouched until the buyer explicitly releases it.

All money in the domain model is represented as integer cents. State transitions are fail-closed and idempotent: a buyer cannot double-commit funds, leave twice, or settle for more than the reservation.

In the current product workspace, this ledger is a deterministic local sandbox. A production version requires authenticated identities and a durable double-entry ledger backed by an appropriate regulated custody, banking, or payments partner.

### Fixed-window rehearsal authority

The product enforces the same timing and reconstruction rules in the UI, domain, commitment API, and settlement API:

- No merchant rehearsal may begin before the published cutoff. The exact cutoff opens a deterministic one-hour bid window; the exact close ends it.
- The browser submits a strict, complete membership envelope. Unknown fields, missing identity fields, non-active status, wrong pool or buyer, a reservation that does not equal server-catalog `MSRP × quantity`, and joins at or after cutoff are rejected.
- The server rebuilds the fixture economics from its own catalog and validates the saved buying intent before evaluating offers. It does not trust a browser-proposed clearing price, capture total, aggregate demand, or merchant result.
- Every terminal rehearsal outcome—modeled quote, below minimum, no acceptable offer, or expired window—carries a stable operation ID. It leaves the reservation untouched and release-eligible; the browser reducer applies the buyer’s explicit full local release exactly once.

These product routes are categorically rehearsal-only: they import no Rain or Monad client and cannot create an external operation in any environment. This is structural validation, not authentication or custody. Membership, maximum price, deadline, and ledger state originate in browser-local state; they are not signed account records, a durable server database, or proof that POOL controls customer funds. Production still needs authenticated server-side mandates and memberships, transactional locking, a double-entry ledger, provider reconciliation, and regulated custody/payment partners.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

No Rain or Monad secret is needed for product commit/settle; those market actions are deterministic local rehearsal in every environment. The wider workspace may make a separately session-gated, server-only Rain balance read to label an execution ceiling, but that read never turns the product rehearsal into a provider settlement and no secret enters the browser.

Before presenting the optional technical proof, run:

```bash
npm run demo:preflight
```

The preflight reports which integrations are live without printing secret values. The complete judge flow and honest fallback order are documented in [`DEMO.md`](./DEMO.md).

## Technical proof at `/demo`

The cinematic walkthrough is the only surface with the complete three-allocation provider architecture. It runs a deterministic coalition of three fictional businesses buying 12 compatible development displays, while a fourth incompatible intent stays out of the pool.

Three simulated merchants compete, moving the public price from **$479 to $389 per unit**:

- Independent baseline and MSRP reserved: **$5,748**
- Negotiated POOL total: **$4,668**
- Savings released: **$1,080 / 18.8%**
- Human negotiation: **none**

The walkthrough can advance automatically or one event at a time. Resetting it never triggers a financial operation. Its monitor market is a fixed technical fixture and is intentionally separate from the buyer product’s broader catalog.

## What the fixed `/demo` Rain integration proves

When explicitly enabled, the protected fixed proof uses Rain’s event sandbox at `https://api-dev.raincards.xyz/v1`:

1. Fund team-level sandbox rail collateral with an idempotency key. This does not credit a buyer balance or satisfy POOL’s product deposit requirement.
2. Issue one scoped card for each buyer allocation under the provisioned hackathon cardholder.
3. Request each card for its negotiated allocation, electronics MCC `5732`, and a short expiration. Rain applies its documented 1.2× lifetime authorization buffer; POOL still admits only the exact agreed charges in deterministic preflight.
4. Attempt an off-list MCC `7995` authorization and require Rain’s exact `scoped_card_mcc_not_allowed` decline. A generic or ambiguous decline fails closed.
5. Authorize all three legitimate allocations.
6. Settle the three authorization records and return their real Rain sandbox IDs to the UI.

Rain’s hackathon sandbox provisions one test cardholder for the team, so the three POOL personas map to separate scoped cards under that one sandbox user. The UI discloses this limitation instead of implying that the sandbox contains independently verified customer identities.

The buyer ledger, merchants, offers, and orders are deterministic simulations. Rain is a sandbox execution rail, not the system of record for deposited balances. Rehearsal receipts are always labeled **REHEARSAL · SIMULATED** and never replace a failed Rain response.

This list describes the enabled integration path, not evidence that the current page executed it. Claim a Rain sandbox transaction only when the UI shows **RAIN SANDBOX · VERIFIED** with provider IDs.

To enable the real sandbox action, fill the Rain values issued at the workshop and set:

```dotenv
RAIN_LIVE_EXECUTION_ENABLED=true
```

Keep that flag disabled unless `npm run demo:preflight` passes. Production live actions also require a random `POOL_DEMO_ACCESS_TOKEN` of at least 24 characters. The server exchanges the one-time judge code for a short-lived, HttpOnly, SameSite session. A loopback URL bypasses this gate only in non-production development and only when no access token was supplied.

## What the fixed `/demo` Monad integration proves

Monad is causal, not decorative, in the fixed competition flow. POOL finalizes the funding commitment before registering the admitted sealed-offer hash set. After Rain settles each buyer allocation, `attestRainSettlement` names one previously registered offer as accepted and binds it to the complete Rain transaction-ID-set digest. The contract therefore orders POOL’s recorded claims; it does not prove when an offchain bid first existed or what a seller saw.

Buyer ceilings and merchant prices are not posted onchain in plaintext. The contract timestamps POOL’s claims and makes them tamper-evident, but it cannot inspect bank balances or authenticate Rain’s API by itself. An observer can verify the claims only when the corresponding reservation proofs and Rain receipts are disclosed and reconciled against the onchain roots and digests. The repository builds those commitments and receipt digests; it does not ship a third-party disclosure portal.

Claim a Monad Testnet write only when the UI shows finalized transaction evidence or an explorer link. `local proof`, `evidence only`, and pending states are not onchain-success claims.

The repository has a testnet-only Hardhat target and intentionally has no mainnet deployment configuration:

```bash
npm run monad:compile
npm run test:contracts
npm run monad:deploy:testnet
```

The deploy command loads the ignored `.env.local`. Use a fresh, funded, testnet-only `MONAD_PRIVATE_KEY`, then set `MONAD_REGISTRY_ADDRESS`. The configured key must control the registry’s finalized `operator()` address; POOL verifies that relationship before any Rain side effect. `/api/monad/status` returns finalized testnet state or an explicit `not-onchain` local proof. It never invents a transaction or contract address.

A protected fixed-demo provider action requires the documented Monad configuration when the competition gate is enabled. Set `MONAD_LIVE_REQUIRED=true` to require that gate locally. Absent configuration is allowed only for a labeled rehearsal or explicitly labeled local development path; partial, malformed, wrong-chain, missing-bytecode, and wrong-operator configurations fail closed.

## Architecture

```text
Buyer product workspace (browser-local rehearsal)
  ├─ structured buying intent + full-MSRP fixture reservation
  ├─ deterministic, mandate-aware merchant clearing after cutoff
  └─ modeled quote → explicit full local release; no order, payment, or provider write

Protected fixed /demo (three complete allocations)
  └─ funding commitment → registered sealed-offer set
        └─ Rain scoped execution → selected-offer receipt attestation
```

- `app/` — product routes and the isolated `/demo` walkthrough
- `lib/product/` — versioned buyer workspace state and pure product transitions
- `lib/funding/` — reservation, release, capture, withdrawal, and idempotency invariants
- `lib/market/` — typed compatibility, negotiation, policy, integrity, and market state
- `lib/agent/` — merchant and agent execution runtime
- `lib/rain/client.ts` — server-only Rain adapter with schema validation, timeouts, and safe retries
- `lib/monad/` — privacy-preserving commitments, testnet client, finalized-state reads, and causal workflow
- `contracts/PoolCommitmentRegistry.sol` — funding-root, offer-hash, and post-Rain attestation registry
- `tests/` and `test/` — product, market, funding, agent, Monad, rendering, and Solidity state-machine checks

Rain credentials, merchant floors, PAN, and CVC never enter the browser bundle. Product maximum-price and deadline mandates originate in browser-local state and are sent to strict same-origin rehearsal routes; they are withheld from merchant responses but are not authenticated production authority. The server derives the modeled quote from its fixture catalog and admitted offer set; the result cannot consume the reservation or create an order.

## Financial and security invariants

- A buyer cannot join unless cleared available balance covers the full MSRP reservation.
- Reserved funds cannot be withdrawn or committed twice; a permitted leave releases them exactly once.
- When a fixed/provider settlement occurs, capture cannot exceed the reservation and the fixture ledger releases the full MSRP-to-deal difference.
- Every terminal product rehearsal outcome, including a modeled quote, may release its full local reservation exactly once because product commit/settle cannot create external operations. In the fixed provider demo, ambiguous or partial execution stays locked for reconciliation instead of claiming a refund.
- Compatibility may interpret non-identical preferences, but cannot negotiate away hard product constraints.
- The accepted offer is versioned and fingerprinted before payment authorization.
- Stale, tampered, over-budget, duplicate, and idempotency-conflict requests are rejected deterministically.
- Every fixed-demo Rain mutation uses a stable operation-specific `Idempotency-Key` no longer than 64 characters.
- `5xx` and `429` responses retry only when the operation is safe with the same key. Rain caches successful/client-error idempotency responses for 24 hours; this repository has no durable exactly-once store or automatic retry worker across that boundary.
- A partial authorization failure reverses open prior authorizations before settlement begins.
- Decrypted card credentials are never requested, stored, logged, or returned.
- Browser responses receive `nosniff`, clickjacking, referrer, permissions, and opener-isolation headers.

## Validate

```bash
npm test
npm run lint
npm run build:next
```

`npm test` builds the deployable application before exercising rendered output, domain invariants, integration behavior, and the Solidity state machine.

## Official references

Rain:

- [Hackathon quickstart](https://rain-sandbox-trial.mintlify.site/docs/quickstart)
- [Scoped cards](https://rain-sandbox-trial.mintlify.site/docs/scoped-cards)
- [Create scoped card](https://rain-sandbox-trial.mintlify.site/reference/cards/create-a-scoped-card-for-a-user)
- [Simulate authorization](https://rain-sandbox-trial.mintlify.site/reference/simulate/simulate-a-card-authorization)
- [Idempotency](https://rain-sandbox-trial.mintlify.site/reference/idempotency)

Monad:

- [Testnet network information](https://docs.monad.xyz/developer-essentials/testnet)
- [Hardhat deployment guide](https://docs.monad.xyz/guides/deploy-smart-contract/hardhat)
- [Wallet finality guidance](https://docs.monad.xyz/developer-essentials/wallet-developers)

## Stack

Next.js 16 / React 19 / TypeScript / vinext / Cloudflare Workers / Rain sandbox / Monad Testnet / Solidity / Hardhat / viem.
