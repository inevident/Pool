# POOL judge demo

Use this page as the operator runbook. The primary story is 90 seconds. Everything below the first pass is optional evidence or Q&A.

## The proof in one frame

Open `/demo` and stop before clicking anything. The first frame must say **FIXED TECHNICAL EVIDENCE FIXTURE** and show:

| Evidence | Fixed fixture result |
| --- | ---: |
| Compatible MSRP-reserved fixture demand | 12 units |
| MSRP reserved before bidding | $5,748 |
| Winning unit price | $389, down from $479 |
| Buyer savings | $1,080 / 18.8% |
| Rain allocations | 3 fixed allocations; exact settlement only when verified provider IDs render |
| Monad ordering | finalized commitment → six finalized offer registrations → Rain settlement-ID digest → finalized selected-offer attestation |
| Public record | `/evidence`, source-bound to `overnight@246d81a` |

The organizations, buyer ledger, merchants, and orders in this fixture are fictional. No real money moves. The fixed fixture is separate from the repeat-use consumer product at `/`.

The shared monitor product identity may also appear in the buyer workspace. That is continuity for discovery and explanation, not shared execution state: the buyer workspace remains a browser-local modeled-quote rehearsal, while the protected fixed fixture is the only complete Rain/Monad provider proof.

## Language that must stay exact

Use the label shown in the UI, not a generic word such as “live.”

| UI evidence | What you may say | What you must not say |
| --- | --- | --- |
| `REHEARSAL · SIMULATED` | “This is the deterministic rehearsal.” | “Rain settled it” or “this is an onchain transaction” |
| `RAIN SANDBOX · VERIFIED` plus provider IDs | “Rain created and settled these sandbox records.” | “Real money moved” or “Rain holds the buyer deposit” |
| Monad explorer link / finalized transaction evidence | “This commitment or attestation finalized on Monad Testnet.” | “Monad proved the bank funds exist” |
| `Evidence only`, `local proof`, or no explorer link | “The app reconstructed the commitment locally; no testnet transaction is claimed.” | “This ran on Monad” |
| Attestation pending | “Rain settled; the Monad attestation has not finalized.” | “The full chain proof is complete” |

Never claim an actual Rain or Monad transaction unless the UI shows the corresponding provider ID or explorer evidence.

For a no-secret backup, open [`public/evidence/rain-monad-testnet-2026-08-09.png`](./public/evidence/rain-monad-testnet-2026-08-09.png) or its [sanitized JSON](./public/evidence/rain-monad-testnet-2026-08-09.json). The record is bound to source commit `246d81a` and combines the same three Rain sandbox records, returned as same-day idempotent replays, with finalized Monad Testnet ordering. The [release provenance manifest](./public/evidence/release-provenance-2026-08-09.json) separately names proof source `246d81a`, later product runtime `8b1cee8`, and recorded deployed/docs commit `88d75b5`; the historical proof predates the later runtime. These files prove no real-money movement, custody, live merchant participation, or independent Monad verification of Rain. The older Rain-only artifact remains an archive of its own local-only state.

When the current runtime includes it, `/evidence#live-verifier` can run a no-store read of `/api/evidence/verify`. It checks current Monad state and recomputes the published digest; it does not query Rain, move money, authorize a transaction, verify balances, or prove real merchants. If the endpoint is absent or degraded, say so and use the static record plus explorer links.

## Before presenting

```bash
npm run demo:preflight
npm test
npm run dev
```

Then:

1. Preload `/demo`, `/`, and `/evidence#live-verifier` at desktop width. Keep `/merchant` closed or in a separate Q&A tab.
2. On `/`, run one catalog-aware buyer-agent example in advance and leave its decision receipt visible. Do not click **Save buying intent** during the primary story.
3. On `/evidence`, confirm the record names source commit `246d81a`, later runtime `8b1cee8`, chain `10143`, the registry, six offer registrations, the finalized attestation, and the release manifest. If **Run live verification** is present, test it once and confirm its response stays read-only.
4. On `/demo`, confirm the first-frame proof summary is visible without scrolling and that the status cards use the evidence labels above.
5. Run the fixed market once and reset it.
6. If Rain is intended, confirm the UI offers **Settle in sandbox**. If it offers only **Run rehearsal**, present rehearsal mode without apology or overclaiming.
7. Keep secrets out of the browser, terminal, slides, screenshots, and repository.

Current finalized record: registry [`0xE1b7…b217`](https://testnet.monadscan.com/address/0xE1b75A905Cab4005623AA8912AF4a67b9c29b217) is deployed on Monad Testnet chain `10143`. Its deployment finalized at [block `52198045`](https://testnet.monadscan.com/tx/0x926f2aba82b9d28d116b1cec8d023ae576c145efe3b4bd58b0ed5f40c02ebc48); commitment [`0x12f3…543f`](https://testnet.monadscan.com/tx/0xf22b02b9988a1583634154677e0499f9859fcef24a1697f50e1cd7859519dfcd) finalized before six offer registrations; and the selected-offer/Rain-digest attestation finalized at [block `52198437`](https://testnet.monadscan.com/tx/0x9abec12dded847e9466074a7c37f984b7fd5ca3315b80e6d74137adf2bc9807e). The prior underfunded-signer snapshot is obsolete. No current balance is asserted; re-run preflight before any new write and never expose the private key.

## Primary 90-second story

### 0:00–0:12 — Lead with buyer value

Start on `/demo` before clicking anything. Point to `12` units, `$5,748` fixture-reserved, `$389` per unit, and `$1,080 / 18.8%` gross savings.

> “Patient buyers have fragmented bargaining power. In this fixed fixture, 12 funded units create a $5,748 order. Seller competition clears at $389 instead of $479, making $1,080 available again—an 18.8% improvement.”

### 0:12–0:25 — Show consent before commitment

Switch to the preloaded buyer decision receipt at `/`. Point to the catalog match, mandate checks, and receipt footer.

> “The buyer agent turns a request into a reviewable mandate, but interpretation saves nothing, authorizes nothing, and moves zero dollars. Only explicit Save creates local intent state.”

### 0:25–0:43 — Let simulated sellers compete

Return to `/demo`, click **Replay the fixed market**, and point to the three simulated sealed sellers and the $389 winner.

> “After demand freezes, three simulated sellers compete for the whole order without seeing buyer ceilings or one another’s private floors. Deterministic policy accepts only a complete offer inside every mandate.”

### 0:43–1:02 — Execute bounded authority

When the market reaches **Rain receives scoped authority**, choose exactly one path:

- If **Settle in sandbox** is present, click it. After the UI shows `RAIN SANDBOX · VERIFIED`, point to the three provider IDs and the MCC `7995` decline.
- Otherwise click **Run rehearsal** and say: “This is the labeled deterministic rehearsal; it creates no Rain or Monad transaction.”

Live-sandbox wording:

> “Only after clearing does Rain receive three scoped-card requests derived from the agreed allocations, electronics MCC, and expiry. POOL admits only the exact charges. The MCC 7995 challenge returns Rain’s exact `scoped_card_mcc_not_allowed` decline before the three allocations settle. Today’s record reused those same Rain IDs through same-day idempotent replay; it created no new real-money movement.”

### 1:02–1:18 — Verify the recorded sequence

Switch to `/evidence#live-verifier`. Point to proof source `246d81a`, later runtime `8b1cee8`, and the finalized sequence. Run the verifier only if the current release exposes it.

> “The historical proof predates the later product runtime. On Monad Testnet, the coalition commitment finalized before six offer registrations; the post-Rain attestation binds the selected registered offer to the exact three-ID digest. This read-only check compares current chain state and recomputes that digest. It does not query Rain or write anything.”

### 1:18–1:30 — Close on aligned economics

Return to the `$5,748 → $4,668 + $1,080` fixture equation.

If Rain provider IDs are rendered, say: “The Rain sandbox record totals $4,668, while the fixture ledger makes $1,080 available again.” If this run is rehearsal, say: “This replay models the same outcome and creates no provider transaction.” Then add: “The record has no fee. As one unvalidated hypothesis, keeping 10% of realized savings would be $108 before costs while buyers retain 16.9% versus MSRP. We built a market where demand organizes itself.”

## Exact click sequence

1. Start on `/demo` and lead with the first-frame outcome.
2. Switch to the preloaded receipt at `/`; point to catalog match, checks, explicit Save, and `$0` moved.
3. Return to `/demo` and click **Replay the fixed market** once.
4. Let autoplay reach **Market cleared**. Do not repeatedly click while Monad preparation is running.
5. Click **Settle in sandbox** only if the button exists and the presenter intends a provider run; otherwise click **Run rehearsal**.
6. At the outcome, point to the evidence-mode label first, then receipt IDs or simulated labels and the MCC result.
7. Switch to `/evidence#live-verifier`; point to release lineage and finalized evidence. Run the live verifier only when available, and label it read-only.
8. Return to the outcome, state the clearly hypothetical economics, and click **Reset the market**. Reset itself causes no provider operation.

## Optional deep dive and Q&A

Do this only after the 90-second story or when a judge asks.

- Open `/merchant` to show the blinded Seller Pilot RFP and zero-write bid dry run. Say explicitly: no live retailer, no merchant traction, no binding bid, no inventory, no order, and no Rain or Monad write.
- Expand **Open the technical inspector**. Run the fixed-fixture buyer intent to show natural language becoming typed constraints. Say that the model has no payment tool.
- Run the `$389`, seven-day merchant bid after the replay has opened the seller market. Show server-pinned quantity and deterministic mandate checks.
- Expand the fixture ledger to reconcile `$5,748 reserved → $4,668 Rain-settled + $1,080 fixture-available` when provider IDs are rendered; in rehearsal, label the same equation simulated.
- Expand the event stream to show that demand freezes before the merchant RFP.
- Use `/evidence` for the published registry, deployment, commitment, and attestation explorer links. A hash without a verified link is not presented as a Testnet transaction.

The repeat-use product has stricter real-time semantics than this replay: its UI, domain, commitment API, and settlement API forbid market rehearsal before the published cutoff, then open an exact one-hour bid window. Those product APIs are mandate-aware rehearsal only and never contact Rain or Monad. The fixed `/demo` fixture is the sole complete three-allocation provider flow, not a claim that the consumer pool’s two-week clock elapsed during the demo.

## Backup order

1. **Rain unavailable:** run the labeled rehearsal. Do not substitute simulated receipts after a failed provider attempt.
2. **OpenAI unavailable:** the buyer endpoint reports deterministic fallback. Financial policy is unchanged and the model still has no money authority.
3. **Current operator environment unavailable:** use the published source-bound `/evidence` record for the already finalized Testnet proof; do not imply that a fresh write occurred.
4. **Network unavailable:** use the already loaded evidence capture and fixed replay, naming which evidence is simulated, Rain sandbox, or finalized Monad Testnet.
5. **Partial Rain result:** stop. Keep reservations frozen for deliberate same-key operator retry or reconciliation; this repository has no automatic retry worker. Do not claim a refund or complete settlement.

## Fast judge answers

- **Why full MSRP?** It converts interest into seller-actionable demand and removes buyer funding default after award.
- **Why Rain?** In the fixed demo it gives an already-cleared deal purpose-specific card with an allocation-derived amount, MCC, and expiry. Rain permits a documented 1.2× lifetime hold buffer, while POOL admits only the exact agreed charges.
- **Why Monad?** In the fixed competition flow it orders POOL’s recorded funding commitment, registered offer set, and post-Rain selected-offer receipt attestation without publishing private economics. It does not prove offchain seller visibility or bank funds.
- **What does AI control?** Interpretation and suggestions. Deterministic code controls timing, accounting, constraints, offer validity, authorization amount, and settlement.
- **What does the homepage buyer agent do?** It returns a catalog-aware decision receipt. Interpretation saves nothing and moves `$0`; only explicit Save creates a browser-local intent.
- **Is the seller pilot a real merchant?** No. It is a blinded fixture RFP and zero-write contract artifact with zero live retailers and no traction claim.
- **What is simulated?** The POOL browser ledger, fixture buyers, merchants, inventory, and fulfillment. Rain is real only when provider IDs appear; Monad is onchain only when finalized explorer evidence appears.
- **Is the buyer ledger custody?** No. It is browser-local product state, not a bank account, wallet, regulated hold, or durable server database.
