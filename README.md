# POOL

**Turn patience into bargaining power.**

[Open the product preview](https://pool-agentic-market-preview-20260808-ldktkkf37-yeayea.vercel.app) · [See the Rain + Monad proof](https://pool-agentic-market-preview-20260808-ldktkkf37-yeayea.vercel.app/demo)

POOL is a repeat-use group-buying product for people who are willing to wait for a better price. A buyer funds an account, describes what they want, and joins a compatible buying pool only when their available balance can cover the item’s full MSRP. POOL aggregates committed demand, lets merchants compete for the order, captures the negotiated amount, and releases the difference as savings.

The default experience is a functioning product sandbox, not a scripted presentation. Buyers can add test funds, create buying intents, join and leave forming pools, inspect commitments, and follow balance activity. Product state persists in the browser across reloads.

> **Sandbox notice:** every balance, pool, product, order, and merchant shown in the product workspace is test data. POOL does not provide a real bank account, accept real deposits, custody customer funds, or place production orders from this repository.

## Product workspace

Run the app and open `http://localhost:3000`:

| Route | Product job |
| --- | --- |
| `/` | Buyer home: available and reserved balances, active commitments, matching pools, and recent activity |
| `/explore` | Discover group buys and inspect their price target, commitment progress, and timing |
| `/wallet` | Add sandbox funds and audit reservation, release, and settlement activity |
| `/orders` | Track commitments, exact releases, and the disclosed path to future fulfillment |
| `/demo` | Replay the cinematic Rain + Monad technical proof |

The product workspace supports these complete sandbox interactions:

- Add test funds to the available balance.
- Create a structured buying intent with a product, maximum price, quantity, and patience window.
- Join a forming pool only when the full MSRP commitment is available.
- Atomically move a joined commitment from `available` to `reserved`.
- Reject insufficient-balance and duplicate-commitment attempts.
- Leave before the commitment cutoff and release the reservation exactly once.
- Review commitments, savings, and an immutable activity trail.
- Keep the workspace state across reloads with versioned browser-local persistence.
- Reset the sandbox without triggering an external or financial operation.

The prominent Sony WH-1000XM6 pool reflects the product’s intended use: the buyer does not need the item immediately, but will fully commit today in exchange for access to a stronger group price later.

See [`PRODUCT.md`](./PRODUCT.md) for the product promise, end-to-end journey, current deliverables, trust boundaries, and production launch gaps.

New engineers and coding agents should begin with [`handoff.md`](./handoff.md), the comprehensive product, hackathon, architecture, security, operations, deployment, and roadmap handoff.

## Commitment model

POOL uses full prefunding to make every participant credible demand:

1. Deposit at least `MSRP × quantity` into the buyer’s available balance.
2. Joining atomically moves that amount from `available` to `reserved`.
3. Reserved funds cannot be withdrawn or reused for another purchase.
4. Leaving before the published commitment cutoff releases the full reservation.
5. Once membership freezes, POOL presents only funded demand to merchants.
6. At settlement, POOL captures `negotiated price × quantity` and releases the MSRP-to-deal difference as savings.

All money in the domain model is represented as integer cents. State transitions are fail-closed and idempotent: a buyer cannot double-commit funds, leave twice, or settle for more than the reservation.

In the current product workspace, this ledger is a deterministic local sandbox. A production version requires authenticated identities and a durable double-entry ledger backed by an appropriate regulated custody, banking, or payments partner.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

No Rain or Monad secret is required for the product workspace. It is fully usable with local sandbox state.

Before presenting the optional technical proof, run:

```bash
npm run demo:preflight
```

The preflight reports which integrations are live without printing secret values. The complete judge flow and honest fallback order are documented in [`DEMO.md`](./DEMO.md).

## Technical proof at `/demo`

The cinematic walkthrough remains available as evidence that POOL’s settlement architecture is more than a UI concept. It runs a deterministic coalition of three fictional businesses buying 12 compatible development displays, while a fourth incompatible intent stays out of the pool.

Three simulated merchants compete, moving the public price from **$479 to $389 per unit**:

- Independent baseline and MSRP reserved: **$5,748**
- Negotiated POOL total: **$4,668**
- Savings released: **$1,080 / 18.8%**
- Human negotiation: **none**

The walkthrough can advance automatically or one event at a time. Resetting it never triggers a financial operation. Its monitor market is a fixed technical fixture and is intentionally separate from the buyer product’s broader catalog.

## What the Rain integration proves

When explicitly enabled, the proof uses Rain’s event sandbox at `https://api-dev.raincards.xyz/v1`:

1. Fund team-level sandbox rail collateral with an idempotency key. This does not credit a buyer balance or satisfy POOL’s product deposit requirement.
2. Issue one scoped card for each buyer allocation under the provisioned hackathon cardholder.
3. Request each card for its negotiated allocation, electronics MCC `5732`, and a short expiration. Rain applies its documented 1.2× lifetime authorization buffer; POOL still admits only the exact agreed charges in deterministic preflight.
4. Attempt an off-list MCC `7995` authorization and require Rain to decline it.
5. Authorize all three legitimate allocations.
6. Settle the three authorization records and return their real Rain sandbox IDs to the UI.

Rain’s hackathon sandbox provisions one test cardholder for the team, so the three POOL personas map to separate scoped cards under that one sandbox user. The UI discloses this limitation instead of implying that the sandbox contains independently verified customer identities.

The buyer ledger, merchants, offers, and orders are deterministic simulations. Rain is a sandbox execution rail, not the system of record for deposited balances. Rehearsal receipts are always labeled **REHEARSAL · SIMULATED** and never replace a failed Rain response.

To enable the real sandbox action, fill the Rain values issued at the workshop and set:

```dotenv
RAIN_LIVE_EXECUTION_ENABLED=true
```

Keep that flag disabled unless `npm run demo:preflight` passes. Production live actions also require a random `POOL_DEMO_ACCESS_TOKEN` of at least 24 characters. The server exchanges the one-time judge code for a short-lived, HttpOnly, SameSite session. A loopback URL bypasses this gate only in non-production development and only when no access token was supplied.

## What the Monad integration proves

Monad is causal, not decorative. POOL waits for finalized Monad state before exposing an RFP to seller agents. The registry accepts merchant offer commitments only under the finalized funding-root commitment. After Rain settles each buyer allocation, POOL hashes the complete Rain transaction-ID set and attests it against the registered winning offer.

Buyer ceilings and merchant prices are not posted onchain in plaintext. The contract timestamps POOL’s claims and makes them tamper-evident, but it cannot inspect bank balances or authenticate Rain’s API by itself. An observer can verify the claims only when the corresponding reservation proofs and Rain receipts are disclosed and reconciled against the onchain roots and digests. The repository builds those commitments and receipt digests; it does not ship a third-party disclosure portal.

The repository has a testnet-only Hardhat target and intentionally has no mainnet deployment configuration:

```bash
npm run monad:compile
npm run test:contracts
npm run monad:deploy:testnet
```

The deploy command loads the ignored `.env.local`. Use a fresh, funded, testnet-only `MONAD_PRIVATE_KEY`, then set `MONAD_REGISTRY_ADDRESS`. The configured key must control the registry’s finalized `operator()` address; POOL verifies that relationship before any Rain side effect. `/api/monad/status` returns finalized testnet state or an explicit `not-onchain` local proof. It never invents a transaction or contract address.

A live production action requires complete Monad Testnet write configuration. Set `MONAD_LIVE_REQUIRED=true` to enforce the same competition gate locally. Absent configuration is allowed only for a labeled rehearsal or local `rain-only-development` path; partial, malformed, wrong-chain, missing-bytecode, and wrong-operator configurations fail closed.

## Architecture

```text
Buyer product workspace
  ├─ structured buying intent
  ├─ versioned sandbox balance
  ├─ atomic MSRP reservation
  ├─ commitment / release history
  └─ discover, wallet, and order views
        │
        └─ production target: authenticated durable ledger
              └─ compatible funded coalition
                    └─ finalized Monad funding commitment
                          └─ private merchant competition
                                └─ winning offer integrity checks
                                      └─ server-only Rain execution
                                            └─ receipt attestation on Monad
                                                  └─ capture deal + release savings
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

Rain credentials, private buyer mandates, merchant floors, PAN, and CVC never enter the browser bundle. The server derives settlement amounts from the accepted offer; the browser does not choose them.

## Financial and security invariants

- A buyer cannot join unless cleared available balance covers the full MSRP reservation.
- Reserved funds cannot be withdrawn or committed twice; a permitted leave releases them exactly once.
- Settlement cannot capture more than the reservation and releases the full MSRP-to-deal difference.
- A failed external attempt keeps the reservation locked for safe retry; partial settlement freezes it for reconciliation instead of claiming a refund.
- Compatibility may interpret non-identical preferences, but cannot negotiate away hard product constraints.
- The accepted offer is versioned and fingerprinted before payment authorization.
- Stale, tampered, over-budget, duplicate, and idempotency-conflict requests are rejected deterministically.
- Every Rain mutation uses a stable operation-specific `Idempotency-Key` no longer than 64 characters.
- `5xx` and `429` responses retry only when the operation is safe with the same key.
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
