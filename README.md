# POOL

**Autonomous collective purchasing for the agentic economy.**

POOL turns independent buying intents into a temporary demand coalition. Buyer agents discover compatible requirements, seller agents compete for the combined order, deterministic policy verifies the winning terms, and Rain issues only the payment authority needed to execute that deal.

This repository is the deterministic 2–3 minute hero demo for the Raingentic Commerce Hackathon NYC.

## The demo

Three fictional businesses independently request 27-inch 4K USB-C development displays:

| Buyer | Quantity | Delivery requirement | Private mandate |
| --- | ---: | ---: | --- |
| Harbor Labs | 3 | 10 days | sealed |
| Patchwork AI | 4 | 8 days | sealed |
| Kernel Works | 5 | 12 days | sealed |

A fourth ultrawide OLED request is deliberately kept out because its hard form factor does not match. POOL forms a 12-unit coalition, opens a market to three simulated merchants with coherent private floors and quantity tiers, and negotiates the public price from **$479 to $389 per unit**.

- Independent baseline: **$5,748**
- POOL total: **$4,668**
- Buyer savings: **$1,080 / 18.8%**
- Human negotiation: **none**

The UI can replay this market automatically or advance one event at a time. Resetting the UI never triggers a financial operation.

## What is real

The Rain path uses the event’s live sandbox at `https://api-dev.raincards.xyz/v1`:

1. Fund sandbox collateral with an idempotency key.
2. Issue one scoped card for each buyer allocation under the provisioned hackathon cardholder.
3. Request each card for its negotiated allocation, electronics MCC `5732`, and a short expiration. Rain applies its documented 1.2× lifetime authorization buffer; POOL still admits only the exact agreed charges in deterministic preflight.
4. Attempt an off-list MCC `7995` authorization and require Rain to return a decline.
5. Authorize all three legitimate allocations.
6. Settle the three authorization records and return their real Rain sandbox IDs to the UI.

Rain’s hackathon sandbox provisions one test cardholder for the team, so the three POOL personas map to three separate scoped cards under that one sandbox user. The product discloses this instead of pretending the sandbox contains three independently verified identities.

Fictional merchants and their offers are simulated. Rehearsal receipts are always labeled **REHEARSAL · SIMULATED** and are never substituted for a failed Rain response.

## Architecture

```text
Buying intents
  └─ deterministic compatibility engine
       └─ temporary coalition + explicit state machine
            └─ merchant quantity-tier economics
                 └─ structured negotiation offers
                      └─ buyer policy + offer integrity checks
                           └─ server-only Rain adapter
                                ├─ scoped cards
                                ├─ enforced MCC decline
                                └─ authorization + settlement
```

- `app/page.tsx` — cinematic market replay and explicit live/rehearsal states
- `lib/market/` — typed compatibility, negotiation, policy, state, integrity, and idempotency engine
- `lib/rain/client.ts` — server-only Rain sandbox adapter with schema validation, timeouts, and safe retries
- `app/api/rain/execute/route.ts` — same-origin, server-authoritative demo execution
- `tests/` — market invariants and rendered-product checks

All money is represented as integer cents. The client never supplies a settlement amount. Rain credentials, private buyer mandates, merchant floors, PAN, and CVC never cross into the browser bundle.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

To enable the real sandbox button, fill the Rain values issued at the workshop and set:

```dotenv
RAIN_LIVE_EXECUTION_ENABLED=true
```

Keep that flag disabled in public environments unless the route is placed behind an appropriate access boundary. With the flag absent or false, the product remains fully demoable in clearly labeled rehearsal mode.

## Validate

```bash
npm test
npm run lint
```

`npm test` runs the deployment build before exercising rendered output and market invariants.

## Financial safety decisions

- Private mandates and seller floors are not part of the public market projection.
- Compatibility can interpret non-identical requirements, but hard product constraints cannot be negotiated away.
- The accepted offer is versioned and fingerprinted before payment authorization.
- Stale, tampered, over-budget, duplicate, and idempotency-conflict requests are rejected deterministically.
- Every Rain mutation uses a stable operation-specific `Idempotency-Key` (maximum 64 characters).
- 5xx/429 responses retry only when the operation is safe to retry with that key.
- A partial buyer-authorization failure reverses open prior authorizations before any settlement begins.
- Decrypted card credentials are never requested, stored, logged, or returned.
- Browser responses receive `nosniff`, clickjacking, referrer, permissions, and opener isolation headers.

## Why Monad is not in the critical path

Monad was evaluated for escrow, deal commitments, reputation, and x402. None improves the core physical-goods transaction enough to justify adding wallet, facilitator, testnet, and fulfillment risk to the live Rain demo. The clean future extension is an optional x402 micropayment where a seller agent pays to unlock an anonymized coalition bid packet; it should remain non-blocking until a funded testnet wallet is available.

## Official Rain references

- [Hackathon quickstart](https://rain-sandbox-trial.mintlify.site/docs/quickstart)
- [Scoped cards](https://rain-sandbox-trial.mintlify.site/docs/scoped-cards)
- [Create scoped card](https://rain-sandbox-trial.mintlify.site/reference/cards/create-a-scoped-card-for-a-user)
- [Simulate authorization](https://rain-sandbox-trial.mintlify.site/reference/simulate/simulate-a-card-authorization)
- [Idempotency](https://rain-sandbox-trial.mintlify.site/reference/idempotency)

## Stack

Next.js 16 / React 19 / TypeScript / vinext / Cloudflare Workers / Rain sandbox.
