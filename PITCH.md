# POOL pitch

## One-line thesis

POOL turns patient, full-MSRP-reserved purchase intent into private seller competition and, in the protected fixed proof, gives the winning agreement bounded payment authority.

## Six-slide outline

### Slide 1 — Demand organizes itself

**Headline:** Stop making every agent shop alone.

**Visual:** `12 MSRP-RESERVED FIXTURE UNITS` flowing into `$389 / UNIT`, with `$1,080 AVAILABLE AGAIN` as the outcome.

**Say:** Patient buyers can trade urgency for leverage. POOL aggregates compatible demand before asking merchants to compete.

### Slide 2 — The buyer agent explains before anything moves

**Headline:** Interpret first. Save only with consent.

**Visual:** A catalog-aware decision receipt: product match, private mandate, deterministic checks, later MSRP coverage, explicit **Save buying intent**, and `financialAuthorization: not_requested · $0 moved`.

**Say:** The buyer agent interprets language and recommends a structured mandate for review. It cannot save an intent, reserve funds, or authorize payment. Only explicit Save creates browser-local intent state; joining remains a separate later action.

**Boundary:** Catalog-aware does not mean retailer-connected. The catalog is seeded, the receipt is advisory, and interpretation moves `$0`.

### Slide 3 — Monad makes the sequence credible

**Headline:** The public record shows commitment before offers.

**Visual:** `/evidence` · proof source `246d81a` · later runtime `8b1cee8` · chain `10143` · registry `0xE1b7…b217` · `1` commitment → `6` finalized offer registrations → `1` finalized post-Rain attestation, plus the read-only `/evidence#live-verifier` check.

**Say:** POOL published the exact, sanitized identifiers behind the fixed run and a release manifest that distinguishes the historical proof source from the later product runtime. The commitment finalized before all six admitted offer registrations. After Rain, the finalized attestation names one registered offer and binds the digest of the exact three settlement IDs. The live verifier reads current Monad state and recomputes that published digest without a write.

**Boundary:** This is operator-attested Testnet ordering. The verifier does not query Rain, move money, authorize a transaction, verify balances, prove real merchants, or turn the static record into an independent audit.

### Slide 4 — Sellers compete for the whole order

**Headline:** Volume converts patience into price pressure.

**Visual:** Three simulated sealed sellers move from `$401` to a winning `$389`; quantity remains server-pinned at 12. A Seller Pilot Sandbox artifact exposes the blinded fixture RFP and zero-write bid contract.

**Say:** Sellers receive the anonymized request only after demand freezes. Deterministic policy checks price, delivery, warranty, quantity, freshness, and every private mandate. The `/merchant` artifact is Q&A proof of the integration contract, not a live retailer or traction claim.

**Boundary:** Live retailers `0`; external writes `0`; no binding bid, inventory, order, payment, Rain call, or Monad call.

### Slide 5 — Rain receives bounded execution, not a blank check

**Headline:** Clear first. Authorize second.

**Visual:** Three scoped-card requests derived from the allocations, exact settled amounts, electronics MCC `5732`, expiry, and a red `MCC 7995 DECLINED` proof.

**Say:** Rain receives scoped authority derived from the already-cleared allocations. Its documented 1.2× lifetime hold buffer is not permission to overspend; POOL admits only the exact agreed charges. The current source-bound record reused the same three sandbox IDs through same-day idempotent replay and preserves the exact MCC decline.

**Boundary:** Rain applies a documented 1.2× lifetime authorization buffer to a scoped card; POOL still admits only the exact agreed charges. Say “Rain sandbox settled” only when the UI shows `RAIN SANDBOX · VERIFIED` and provider IDs. Otherwise say “labeled deterministic rehearsal.”

### Slide 6 — The market outcome

**Headline:** Savings create room for an aligned business model.

**Visual:** `$5,748 fixture-reserved → $4,668 Rain-settled + $1,080 fixture-available`, then a clearly labeled savings-share sensitivity: `5% → $54 / 17.8% buyer net`, `10% → $108 / 16.9% buyer net`, `15% → $162 / 16.0% buyer net`.

**Say:** The fixed record contains no fee. As a decision model, retaining 10% of realized savings would produce `$108` of revenue before costs while buyers keep `$972`, or `16.9%` versus MSRP. More committed demand can attract more merchants; better net outcomes can attract more buyers.

**Boundary:** This is illustrative sensitivity, not implemented pricing, observed revenue, or merchant validation. It excludes tax, shipping, payment, custody, fraud, returns, support, and acquisition costs.

## Verbatim 90-second talk track

> “Patient buyers have fragmented bargaining power. In POOL’s fixed fixture, 12 funded units create a $5,748 order. Seller competition clears at $389 instead of $479, making $1,080 available again—an 18.8% improvement.
>
> The homepage buyer agent makes that demand programmable. It turns language into a catalog-aware decision receipt, but interpretation saves nothing, authorizes nothing, and moves zero dollars. Only explicit Save creates local intent state.
>
> After demand freezes, three simulated sellers compete without seeing buyer ceilings. Deterministic policy checks quantity, price, delivery, warranty, freshness, and every private mandate before selecting the complete $389 offer.
>
> Only then does Rain receive three allocation-derived scoped-card requests. MCC 7995 returns the exact `scoped_card_mcc_not_allowed` decline before the legitimate sandbox allocations settle. The source-bound record reused the same three Rain IDs through same-day idempotent replay; no real money moved.
>
> The proof is inspectable. Commit `246d81a` produced the historical record; `8b1cee8` is the later product runtime. On Monad Testnet, the coalition commitment finalized before six offer registrations, and the post-Rain attestation binds the selected registered offer to the exact three-ID digest. The read-only verifier checks current chain state and recomputes that digest without querying Rain or writing anything.
>
> The fixed record has no fee. As one aligned hypothesis, ten percent of realized savings would be $108 before costs while buyers still retain 16.9% versus MSRP. That model is unvalidated. We did not build AI that shops. We built a market where demand organizes itself.”

If the current demo run is rehearsal, replace the MCC sentence with: “The fixed rehearsal shows the required exact decline path; this replay creates no provider transaction.” The separate `/evidence` record remains valid evidence of the already finalized source-bound run; do not imply that the rehearsal created it.

## Live click sequence

1. Start on `/demo` before clicking anything. Lead with `12` units, `$5,748` reserved, `$389` per unit, and `$1,080 / 18.8%` gross savings.
2. Switch briefly to the preloaded homepage receipt. Point to catalog match, mandate checks, explicit Save, and `$0` moved; do not Save during the story.
3. Return to `/demo` and click **Replay the fixed market** once. Let it show 3 + 4 + 5 units, the incompatible request, the pre-bid freeze, and the three simulated seller offers.
4. At bounded authority, click **Settle in sandbox** only if that button exists and a provider run is intended. Otherwise click **Run rehearsal**.
5. On the outcome, read the evidence label first. Then point to provider IDs or simulated labels and the MCC `7995` result.
6. Switch to `/evidence#live-verifier`. Point to proof source `246d81a`, later runtime `8b1cee8`, registry `0xE1b7…b217`, finalized sequence, release manifest, and claim boundary. Run the read-only check only if the current release exposes it.
7. End on `$5,748 → $4,668 + $1,080`, state the clearly hypothetical 10%-of-savings case, then reset the market before the next run.

Do not open `/merchant` or the optional technical inspector during the 90-second story. Use them for Q&A: `/merchant` shows the blinded Seller Pilot Sandbox contract with zero live retailers and zero writes; the inspector exercises the fixed buyer/merchant APIs and policy traces.

## Backup sequence

1. Keep one already-loaded `/demo` tab at the first-frame proof summary.
2. If Rain is unavailable, use the source-bound [`Rain + Monad evidence capture`](./public/evidence/rain-monad-testnet-2026-08-09.png) as the already-recorded proof, or run **Run rehearsal** and say that replay creates no provider transaction.
3. If OpenAI is unavailable, show `deterministic_fallback`; the model has no payment authority and the money policy is unchanged.
4. If the current Monad operator environment is unavailable, use `/evidence` for the already finalized Testnet record. Do not imply that the current session performed a new write.
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
- The published source-bound run uses registry [`0xE1b7…b217`](https://testnet.monadscan.com/address/0xE1b75A905Cab4005623AA8912AF4a67b9c29b217) on chain `10143`.
- Commitment [`0x12f3…543f`](https://testnet.monadscan.com/tx/0xf22b02b9988a1583634154677e0499f9859fcef24a1697f50e1cd7859519dfcd) finalized before six admitted sealed-offer registrations.
- The registered offer set is verified before Rain execution; `acceptedOfferHash` is assigned only in the post-Rain attestation.
- The [finalized attestation](https://testnet.monadscan.com/tx/0x9abec12dded847e9466074a7c37f984b7fd5ca3315b80e6d74137adf2bc9807e) names one registered offer and binds the exact Rain settlement-ID-set digest.
- Settlement reconstructs finalized state from chain on a cold start instead of trusting process memory.
- Buyer ceilings and merchant floors remain offchain; a Testnet claim requires rendered explorer evidence.

## Adversarial questions

**Is this real money?**
No. The consumer balance is a browser-local sandbox ledger. Rain creates real sandbox records only when the UI shows provider IDs. No real money moves in this repository.

**Then what has actually been built?**
A repeat-use consumer sandbox with catalog-aware buyer decision receipts, tested local reservation/release, strict mandate-aware quote-rehearsal APIs, a public sanitized evidence registry, a zero-write Seller Pilot Sandbox, and a protected fixed demo with Rain sandbox plus finalized Monad Testnet evidence. The product rehearsal never books a capture or creates an order. Production identity, custody, database, merchants, and fulfillment remain explicit gaps.

**Is the Seller Pilot a merchant integration or traction?**
It is an inspectable blinded fixture RFP and deterministic zero-write bid contract. No live retailer is connected, no seller has validated the economics, no bid is binding, and no order, payment, Rain call, or Monad call is created. It proves a product integration shape, not merchant traction.

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
AI can extract a catalog-aware mandate and suggest a match. The decision receipt saves nothing and moves `$0`; only explicit Save creates local intent state. Deterministic code controls timing, accounting, compatibility hard constraints, offer admission, payment amount, and settlement.

**What is the path to a real product?**
Authenticated adults, a regulated custody/payment partner, transactional double-entry ledger, provider webhooks and reconciliation, real merchant contracts, durable pool jobs, fulfillment, returns, disputes, and legal/risk operations.

## Official references

- [Raingentic Commerce Hackathon NYC](https://luma.com/encode-2gj9)
- [Rain hackathon quickstart](https://rain-sandbox-trial.mintlify.site/docs/quickstart)
- [Rain scoped cards](https://rain-sandbox-trial.mintlify.site/docs/scoped-cards)
- [Monad Testnet network information](https://docs.monad.xyz/developer-essentials/testnet)
- [Monad Hardhat deployment guide](https://docs.monad.xyz/guides/deploy-smart-contract/hardhat)

See [`DEMO.md`](./DEMO.md) for operator timing and fallbacks, [`PRODUCT.md`](./PRODUCT.md) for the product boundary, and [`handoff.md`](./handoff.md) for engineering and deployment state.
