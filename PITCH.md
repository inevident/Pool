# POOL pitch

## One-line thesis

POOL turns patient, full-MSRP-reserved purchase intent into private seller competition and, in the protected fixed proof, gives the winning agreement bounded payment authority.

## Six-slide outline

### Slide 1 — Demand organizes itself

**Headline:** Stop making every agent shop alone.

**Visual:** `12 MSRP-RESERVED FIXTURE UNITS` flowing into `$389 / UNIT`, with `$1,080 AVAILABLE AGAIN` as the outcome.

**Say:** Patient buyers can trade urgency for leverage. POOL aggregates compatible demand before asking merchants to compete.

### Slide 2 — Interest becomes credible demand

**Headline:** Full MSRP first. Market second.

**Visual:** `$5,748 available → reserved`, split across 3 + 4 + 5 monitor allocations; one incompatible ultrawide intent remains outside.

**Say:** A buyer joins only with `MSRP × quantity` available. Joining makes that money unavailable elsewhere; leaving before cutoff releases it exactly once.

**Boundary:** The current buyer ledger is browser-local sandbox state. It is not custody, escrow, or a bank account.

### Slide 3 — Monad makes the sequence credible

**Headline:** Reserved fixture terms are fixed before offer registration.

**Visual:** `funding root + public terms → finalized commitment → registered sealed-offer set → Rain settlement → selected-offer receipt attestation`.

**Say:** POOL reconstructs the exact fixture coalition and finalizes its commitment before registering the admitted sealed-offer hashes. After Rain settles, the attestation names one registered offer as accepted and binds the receipt-ID set. Private buyer ceilings and merchant floors stay offchain.

**Boundary:** Claim a Testnet transaction only when the UI renders finalized explorer evidence. Monad orders POOL’s recorded claims; it does not prove when an offchain bid first existed, what a seller saw, or that bank funds exist.

### Slide 4 — Sellers compete for the whole order

**Headline:** Volume converts patience into price pressure.

**Visual:** Three simulated sealed merchants move from `$401` to a winning `$389`; quantity remains server-pinned at 12.

**Say:** Sellers receive the anonymized request only after demand freezes. Deterministic policy checks price, delivery, warranty, quantity, freshness, and every private mandate.

### Slide 5 — Rain receives bounded execution, not a blank check

**Headline:** Clear first. Authorize second.

**Visual:** Three scoped-card requests derived from the allocations, exact settled amounts, electronics MCC `5732`, expiry, and a red `MCC 7995 DECLINED` proof.

**Say:** Rain receives scoped authority derived from the already-cleared allocations. Its documented 1.2× lifetime hold buffer is not permission to overspend; POOL admits only the exact agreed charges, and the dated sandbox evidence shows those exact settled amounts. The off-policy attempt tests the MCC bound first.

**Boundary:** Rain applies a documented 1.2× lifetime authorization buffer to a scoped card; POOL still admits only the exact agreed charges. Say “Rain sandbox settled” only when the UI shows `RAIN SANDBOX · VERIFIED` and provider IDs. Otherwise say “labeled deterministic rehearsal.”

### Slide 6 — The market outcome

**Headline:** Fixture MSRP secured the commitment. Rain settled the deal price.

**Visual:** `$5,748 fixture-reserved → $4,668 Rain-settled + $1,080 fixture-available`, `18.8%` improvement, `0` human negotiation.

**Say:** This is a repeat-use product thesis, not a one-off checkout trick: more committed demand attracts more merchants, better outcomes attract more buyers, and the market improves.

## Verbatim 90-second talk track

> “Today, shopping agents optimize one buyer at a time. POOL creates a new market: patient buyers organize into full-MSRP-reserved demand, then merchants compete for the whole order.
>
> In this fixed technical evidence fixture, three compatible buyers want 12 development monitors. They reserve the full $5,748 MSRP before POOL registers any seller offer. A fourth ultrawide request is excluded because similarity is not permission: hard constraints still win.
>
> POOL freezes the exact fixture terms before registering admitted offers. When Monad Testnet is configured, the funding commitment finalizes first and the sealed-offer hash set is registered next. After Rain settles, the attestation names the selected registered offer and binds the receipt-ID set. The chain makes POOL’s recorded ordering tamper-evident; it does not prove when offchain bids first existed, what sellers saw, or that bank funds exist.
>
> Three simulated merchants now compete for the aggregate order without seeing buyer ceilings or one another’s private floors. Deterministic policy selects Signal at $389 per unit, down from $479.
>
> Only after clearing does Rain receive three scoped-card requests derived from the agreed allocations, electronics MCC, and expiry. Rain permits a documented 1.2× lifetime hold buffer, while POOL admits only the exact agreed charges. We challenge MCC 7995 and require Rain’s exact `scoped_card_mcc_not_allowed` decline before the three allocations settle at their exact amounts.
>
> The dated Rain sandbox evidence settles $4,668, and the fixture ledger makes $1,080 available again—an 18.8% improvement with zero human negotiation. We did not build AI that shops. We built a market where demand organizes itself.”

If the current run is rehearsal, replace the MCC sentence with: “the fixed rehearsal shows the required exact decline path; this run creates no provider transaction.” If Monad has no explorer evidence, replace the Monad sentence with: “POOL reconstructs the exact commitment locally; this run makes no Testnet transaction claim.”

## Live click sequence

1. Open `/demo`. Do not click yet. Point to **THE 90-SECOND PROOF** and **FIXED TECHNICAL EVIDENCE FIXTURE**.
2. Say the first two sentences while showing `12 units`, `$1,080`, `3 fixed allocations`, and the Monad evidence state.
3. Click **Replay the fixed market** once.
4. Let the replay show 3 + 4 + 5 units, the incompatible request, the pre-bid freeze, and the three merchant offers.
5. When the market reaches bounded authority, click **Settle in sandbox** only if that button exists and a provider run is intended. Otherwise click **Run rehearsal**.
6. On the outcome screen, read the evidence label first. Then point to provider IDs or simulated labels, the MCC `7995` result, and any Monad explorer evidence.
7. End on `$5,748 → $4,668 + $1,080`, then click **Reset the market** before the next run.

Do not open the optional technical inspector during the 90-second story. Use it for Q&A to run a custom buyer intent, submit the `$389` merchant bid, or inspect policy traces.

## Backup sequence

1. Keep one already-loaded `/demo` tab at the first-frame proof summary.
2. If Rain is unavailable, use the dated [`Rain sandbox outcome capture`](./public/evidence/rain-sandbox-2026-08-09.png) as the provider-record backup, or run **Run rehearsal** and say that replay creates no provider transaction.
3. If OpenAI is unavailable, show `deterministic_fallback`; the model has no payment authority and the money policy is unchanged.
4. If Monad is unavailable or the signer lacks gas, show local commitment reconstruction and contract tests. Do not claim a Testnet transaction.
5. If a Rain attempt fails or partially settles, stop. Show the failure/reconciliation state; do not replace it with a simulated success or claim an immediate refund.
6. If the network fails, narrate from the fixed first frame and the loaded evidence replay. Name each state as local, rehearsal, Rain sandbox, or Monad Testnet.

## Track-specific proof

### Best use of Rain

- Rain sits after market clearing, where autonomous negotiation gains commercial consequence.
- Three scoped cards map to the three fixture allocations under the event sandbox’s shared cardholder limitation.
- Requested card scope, allowed electronics MCC, and stable expiry are derived from the cleared agreement; Rain’s documented 1.2× lifetime hold buffer is not buyer permission to overspend.
- The off-policy MCC `7995` challenge must return `scoped_card_mcc_not_allowed` before the valid allocation settlements proceed; a generic or ambiguous decline fails closed.
- Stable server-derived operation and idempotency keys make same-operation retries reuse the same authority within Rain’s 24-hour response-cache semantics. The repository has no durable exactly-once store or automatic retry worker.
- Real-sandbox claims require rendered provider IDs; rehearsal receipts are explicitly simulated.

### Monad bounty

- Monad is a causal gate, not a decorative transaction badge.
- The funding root and public terms finalize before admitted sealed-offer hashes are registered.
- The registered offer set is verified before Rain execution; `acceptedOfferHash` is assigned only in the post-Rain attestation.
- The exact Rain settlement-ID set is hashed and attested against the selected registered offer afterward.
- Settlement reconstructs finalized state from chain on a cold start instead of trusting process memory.
- Buyer ceilings and merchant floors remain offchain; a Testnet claim requires rendered explorer evidence.

## Adversarial questions

**Is this real money?**
No. The consumer balance is a browser-local sandbox ledger. Rain creates real sandbox records only when the UI shows provider IDs. No real money moves in this repository.

**Then what has actually been built?**
A repeat-use consumer sandbox, tested local reservation/release domain, strict mandate-aware quote-rehearsal APIs, deterministic merchant clearing, and a protected fixed demo with a Rain sandbox adapter plus Monad commitment/offer/attestation state machine. The product rehearsal never books a capture or creates an order. Production identity, custody, database, merchants, and fulfillment remain explicit gaps.

**Can the browser forge a membership?**
Yes. The current browser membership, maximum price, and deadline are not authenticated, so they are not production authority. Product routes strictly validate them against the fixture catalog and withhold mandates from merchant responses, but remain rehearsal-only and perform no provider or chain mutation. The protected fixed `/demo` uses a separate access session for provider actions. Production still needs authenticated sessions and durable server-side mandates, memberships, and ledger state.

**Why wait two weeks? Why no target headcount?**
The product sells patience. Every funded buyer may join through the fixed 14-day cutoff. Ten units is only the viability minimum; final demand is the actual funded quantity at cutoff, with no target or cap.

**Can you run the market early for the demo?**
Not in the consumer product. The UI, domain, commitment route, and settlement route block the local merchant rehearsal before cutoff. Those product routes never contact Monad or Rain at any time. The separate `/demo` page is clearly labeled as a fixed technical evidence fixture and is the only complete provider flow.

**What stops double settlement on retry?**
The product route makes no settlement at all: a modeled quote or no-buy outcome leaves the full reservation untouched and release-eligible. Its stable operation ID makes the buyer’s explicit full local release idempotent. In the fixed Rain demo, same-operation retries reuse stable provider keys, but Rain’s documented response cache is 24 hours and this repository has no durable exactly-once record or automatic retry worker.

**What if the pool misses the minimum?**
No aggregate order, chain write, or Rain transaction is created. The terminal server outcome marks the browser-local reservation release-eligible, and the reducer releases it exactly once when the buyer confirms the no-purchase outcome.

**What if no merchant beats the target?**
The pool does not buy at a worse price. The terminal rehearsal outcome marks the browser-local reservation release-eligible, and the reducer releases it exactly once when confirmed.

**What if Rain settles but Monad attestation fails?**
The fixed demo says Rain settled and attestation is pending. It does not claim finalized onchain settlement until evidence appears. The attestation call is idempotent, but this repository has no automatic retry worker; an operator must retry/reconcile deliberately.

**Why does Monad matter if POOL controls the offchain ledger?**
It makes changes to POOL’s recorded funding commitment, admitted offer set, selected offer, and receipt digest detectable in their onchain order. It does not prove when an offchain bid first existed or what a seller saw, and it does not remove the need to disclose and reconcile the underlying records.

**What does AI decide?**
AI interprets language and can suggest matches or strategy. Deterministic code controls timing, accounting, compatibility hard constraints, offer admission, payment amount, and settlement.

**What is the path to a real product?**
Authenticated adults, a regulated custody/payment partner, transactional double-entry ledger, provider webhooks and reconciliation, real merchant contracts, durable pool jobs, fulfillment, returns, disputes, and legal/risk operations.

## Official references

- [Raingentic Commerce Hackathon NYC](https://luma.com/encode-2gj9)
- [Rain hackathon quickstart](https://rain-sandbox-trial.mintlify.site/docs/quickstart)
- [Rain scoped cards](https://rain-sandbox-trial.mintlify.site/docs/scoped-cards)
- [Monad Testnet network information](https://docs.monad.xyz/developer-essentials/testnet)
- [Monad Hardhat deployment guide](https://docs.monad.xyz/guides/deploy-smart-contract/hardhat)

See [`DEMO.md`](./DEMO.md) for operator timing and fallbacks, [`PRODUCT.md`](./PRODUCT.md) for the product boundary, and [`handoff.md`](./handoff.md) for engineering and deployment state.
