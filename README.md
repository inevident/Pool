# POOL

**Turn patience into bargaining power.**

[Open the `overnight` product](https://pool-overnight-yeayea.vercel.app) · [Inspect the public evidence](https://pool-overnight-yeayea.vercel.app/evidence) · [Replay the fixed technical demo](https://pool-overnight-yeayea.vercel.app/demo)

> **Deployment status, verified 2026-08-09:** `https://pool-overnight-yeayea.vercel.app` is the stable public alias for production deployment `dpl_4PhChmBuomnxaJ665zetzqCwgyjv`, built from `main@712328b` and promoted from preview `dpl_D5BLR3q5CC1Yx4JsdFGxC4caMnqb`. Verified live on that deployment: `/`, `/negotiate`, `/demo`, `/evidence`, and the release provenance manifest all return `200`; `GET /api/evidence/verify` returns `verified` with 15/15 checks passing against Monad Testnet; the demand curve clears at `$700` for 560 buyers with no private merchant economics in the response; and the build-time agent samples return `x-vercel-cache: PRERENDER`, confirming zero model calls per visitor. A push to origin does not deploy on its own, so future releases still require an explicit deploy. Production has no Rain or Monad *execution* configuration and correctly uses deterministic/rehearsal behavior; `OPENAI_API_KEY` is configured, so the five allowlisted agent samples are real model output baked at build time.

POOL is a repeat-use group-buying product for people who are willing to wait for a better price. In the intended lifecycle, a buyer funds an account, describes what they want, and joins a compatible buying pool only when available balance covers the item’s full MSRP; POOL aggregates committed demand, lets merchants compete, captures the negotiated amount, and releases the difference. The current product surface models that lifecycle as a quote-only browser rehearsal. Only two protected paths can create labeled Rain sandbox settlement evidence: the fixed `/demo`, and the `/negotiate` agent purchase. Both are gated identically behind `RAIN_LIVE_EXECUTION_ENABLED`, Rain configuration, and demo access; without all three they return a clearly labeled rehearsal and move `$0`.

The default experience is a functioning product sandbox, not a scripted presentation. A catalog-aware buyer agent turns natural language into an inspectable decision receipt, but interpretation moves `$0` and saves nothing until the buyer explicitly chooses **Save buying intent**. Buyers can then add test funds, join and leave forming pools, inspect commitments, and follow balance activity. Product state persists in the browser across reloads.

> **Sandbox notice:** every balance, pool, product, order, and merchant shown in the product workspace is test data. POOL does not provide a real bank account, accept real deposits, custody customer funds, or place production orders from this repository.

## Product workspace

Run the app and open `http://localhost:3000`:

| Route | Product job |
| --- | --- |
| `/` | Buyer home: catalog-aware buyer-agent decision receipts, available and reserved balances, active commitments, matching pools, and recent activity |
| `/explore` | Discover group buys and inspect their price target, fixture committed units, minimum, and two-week close |
| `/wallet` | Add sandbox funds, optionally label a ceiling from a session-gated Rain sandbox balance read, and audit local activity |
| `/orders` | Track commitments, exact releases, and the disclosed path to future fulfillment |
| `/evidence` | Inspect the public, sanitized Rain sandbox + finalized Monad Testnet proof registry and its explicit claim boundaries |
| `/merchant` | Dry-run the Seller Pilot Sandbox against a blinded fixture RFP; no live retailer, binding bid, traction claim, order, provider call, or external write |
| `/negotiate` | Pledge along a demand curve and watch POOL's agent walk it down: deeper committed volume unlocks deeper merchant discounts, and every activated buyer pays the single cleared price |
| `/demo` | Replay the protected fixed technical proof; it is the only route with the complete three-allocation provider flow |

**The pool you join is the pool the product rehearses.** Each pool accepts every funded commitment submitted during its fixed two-week window. Ten funded units is the minimum needed to open the local merchant rehearsal, not a target or cap. At the close, POOL uses the actual fixture quantity and evaluates three simulated merchant offers against the buyer’s saved maximum and deadline. A qualifying result is a modeled quote only: the reservation stays untouched until the buyer explicitly releases it, and no aggregate order, payment, Rain mutation, or Monad mutation is created.

The product workspace supports these complete sandbox interactions:

- Add test funds to the available balance.
- Ask the catalog-aware buyer agent to extract product, quantity, maximum price, and patience into a decision receipt with catalog match and deterministic mandate checks.
- Review the receipt's explicit `financialAuthorization: not_requested` / `$0` boundary; only **Save buying intent** creates browser-local product state.
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

The current source-bound record is the [Rain + Monad evidence capture](./public/evidence/rain-monad-testnet-2026-08-09.png) with its [sanitized JSON](./public/evidence/rain-monad-testnet-2026-08-09.json), generated from `overnight@246d81a` and published in the verified `overnight` Preview. It records the same three Rain sandbox settlements as same-day idempotent replays, the exact MCC `7995` decline, and finalized Monad Testnet ordering on chain `10143`: registry [`0xE1b7…b217`](https://testnet.monadscan.com/address/0xE1b75A905Cab4005623AA8912AF4a67b9c29b217), one finalized coalition commitment, six finalized offer registrations, and a finalized post-Rain attestation. No real money moved, and Monad did not independently verify Rain or the simulated ledger. The earlier Rain-only capture remains an archived record of its own local-only state.

The [machine-readable release provenance manifest](./public/evidence/release-provenance-2026-08-09.json) separates facts that should never be collapsed into one claim: the proof-producing source commit is `246d81a`, the later product runtime commit is `8b1cee8`, the previously deployed commit was `88d75b5`, and the currently deployed commit is `712328b`. The historical proof therefore predates both the later runtime and the live deployment that publishes it. The manifest also records the stable public URL, the exact Vercel deployment identifier and the preview deployment it was promoted from, evidence/deck SHA-256 digests, Rain IDs, Monad registry and transactions, and the explicit claim limits. Vercel project and organization identifiers stay omitted. It is provenance disclosure, not a signature or independent audit.

`GET /api/evidence/verify` is the designated read-only verifier path in runtimes that include it. A successful response may recompute the published digest and compare current Monad Testnet state with the static record; it requests no financial authorization, creates no Rain call, and performs no external write. Do not infer that the endpoint is deployed merely because the manifest names it—check the current URL and response. It is not a fresh Rain execution or an independent Rain oracle.

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

## Demand-curve negotiation at `/negotiate`

A single price hides how much demand exists just below it. At `/negotiate`, buyers instead pledge along a curve — "I'd buy at 10% off", "at 20% off", "at 30% off" — where each pledge is the *highest* price that buyer will accept.

When the window closes, POOL's agent walks the curve down. At every rung it can credibly promise a merchant the exact volume that unlocks there: every buyer whose ceiling sits at or above that price. Deeper rungs promise more units, and more units unlock deeper merchant discounts. The agent keeps the deepest level a merchant will actually honor, and then **every activated buyer pays that single clearing price — including the buyers who would happily have paid far more.**

The clearing is pure and deterministic in [`lib/negotiation/demand-curve.ts`](./lib/negotiation/demand-curve.ts): the same pledges and merchant roster always clear at the same price, so the server re-derives the outcome rather than trusting a number the browser proposed, and a reviewer can replay it. Merchant floors and maximum discounts are private seller economics — they produce a quote and are never serialized into a public projection.

`POST /api/negotiation/purchase` is the only non-`/demo` path that can create a Rain authorization or settlement; the wallet's separately session-gated Rain balance read is read-only and moves nothing. After clearing, the agent mints a Rain scoped card for exactly the cleared amount, locked to the merchant's category, then authorizes and settles, reversing on any failure. The card is scoped so the agent cannot spend more than the cleared amount or at an off-policy category: its authority is derived from the market outcome, not the other way around. Unless `RAIN_LIVE_EXECUTION_ENABLED`, Rain configuration, and demo access are all present, it returns a labeled `REHEARSAL` plan and no card is issued.

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

The cinematic walkthrough is the only surface with the complete three-allocation provider architecture. It runs a deterministic coalition of three fictional businesses buying 12 compatible development displays, while a fourth incompatible intent stays out of the pool. The separate public [`/evidence`](./app/evidence/page.tsx) registry publishes a sanitized, source-bound record of the verified run; it is evidence disclosure, not an independent audit.

Three simulated merchants compete, moving the public price from **$479 to $389 per unit**:

- Independent baseline and MSRP reserved: **$5,748**
- Negotiated POOL total: **$4,668**
- Savings released: **$1,080 / 18.8%**
- Human negotiation: **none**

### Illustrative unit economics

POOL has not implemented or validated a fee. One incentive-aligned hypothesis is to charge only when buyers realize savings and retain a share of those savings. Applied to the fixed fixture's `$1,080` gross savings:

| Illustrative POOL share of realized savings | Revenue before costs | Buyer savings retained | Net buyer savings vs. `$5,748` MSRP |
| ---: | ---: | ---: | ---: |
| `5%` | `$54` | `$1,026` | `17.8%` |
| `10%` | `$108` | `$972` | `16.9%` |
| `15%` | `$162` | `$918` | `16.0%` |

This is sensitivity analysis, not observed revenue, pricing, or merchant validation. The fixed evidence record contains no fee. Tax, shipping, payment, custody, fraud, returns, support, and acquisition costs are excluded; a real pilot must measure them before choosing a model.

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

Buyer ceilings and merchant prices are not posted onchain in plaintext. The contract timestamps POOL’s claims and makes them tamper-evident, but it cannot inspect bank balances or authenticate Rain’s API by itself. An observer can verify the claims only when the corresponding reservation proofs and Rain receipts are disclosed and reconciled against the onchain roots and digests. The repository now ships a sanitized public evidence registry for the fixed fixture; it is not a third-party audit or a general disclosure portal.

The current record finalized on Monad Testnet chain `10143` from source commit `246d81a`. The registry deployment finalized at [block `52198045`](https://testnet.monadscan.com/tx/0x926f2aba82b9d28d116b1cec8d023ae576c145efe3b4bd58b0ed5f40c02ebc48). The coalition commitment [`0x12f3…543f`](https://testnet.monadscan.com/tx/0xf22b02b9988a1583634154677e0499f9859fcef24a1697f50e1cd7859519dfcd) finalized before six offer registrations. The post-Rain attestation finalized at [block `52198437`](https://testnet.monadscan.com/tx/0x9abec12dded847e9466074a7c37f984b7fd5ca3315b80e6d74137adf2bc9807e), naming one registered offer and binding the digest of the exact three Rain settlement IDs. These are operator-attested ordering claims, not proof of custody, offchain seller visibility, merchant participation, or real-money settlement.

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
  ├─ natural language → catalog-aware decision receipt → explicit Save; interpretation moves $0
  ├─ structured buying intent + full-MSRP fixture reservation
  ├─ deterministic, mandate-aware merchant clearing after cutoff
  └─ modeled quote → explicit full local release; no order, payment, or provider write

Public evidence + seller artifacts
  ├─ /evidence → sanitized Rain + finalized Monad record with explicit limits
  └─ /merchant → blinded fixture RFP dry run; no live retailer, traction, or writes

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
