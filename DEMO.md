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

For a no-secret backup, open [`public/evidence/rain-monad-testnet-2026-08-09.png`](./public/evidence/rain-monad-testnet-2026-08-09.png) or its [sanitized JSON](./public/evidence/rain-monad-testnet-2026-08-09.json). The record is bound to source commit `246d81a` and combines the same three Rain sandbox records, returned as same-day idempotent replays, with finalized Monad Testnet ordering. The [release provenance manifest](./public/evidence/release-provenance-2026-08-09.json) separately names proof source `246d81a`, later product runtime `8b1cee8`, and the live deployed commit `712328b` with its exact Vercel deployment ID; the historical proof predates the runtime that serves it. These files prove no real-money movement, custody, live merchant participation, or independent Monad verification of Rain. The older Rain-only artifact remains an archive of its own local-only state.

When the current runtime includes it, `/evidence#live-verifier` can run a no-store read of `/api/evidence/verify`. It checks current Monad state and recomputes the published digest; it does not query Rain, move money, authorize a transaction, verify balances, or prove real merchants. If the endpoint is absent or degraded, say so and use the static record plus explorer links.

## Before presenting

```bash
npm run demo:preflight
npm test
npm run dev
```

Then:

1. Preload `/negotiate`, `/demo`, and `/evidence#live-verifier` at desktop width, in that tab order. Keep `/`, `/explore`, and `/merchant` closed or in a separate Q&A tab.
2. Unlock provider actions: on `/demo`, enter the access code once and confirm the UI offers **Settle in sandbox** rather than only **Run rehearsal**. Every provider path fails closed without that session, so do this before the room is watching.
3. On `/negotiate`, run the negotiation once end to end, confirm it clears at `$700` for 560 buyers, then reload so the curve is unclicked when you begin.
4. On `/evidence`, confirm the record names source commit `246d81a`, chain `10143`, the registry, six offer registrations, the finalized attestation, and the release manifest. Click **Run live verification** once and confirm 15/15.
5. On `/demo`, confirm the first-frame proof summary is visible without scrolling and that the status cards use the evidence labels above.
6. Expect `MONAD_ATTESTATION_FAILED` on any settle after the first: the attestation already exists on chain and the registry refuses duplicate writes. Know the line for it before you present.
7. Keep secrets out of the browser, terminal, slides, screenshots, and repository. The access code is not a slide.

Current finalized record: registry [`0xE1b7…b217`](https://testnet.monadscan.com/address/0xE1b75A905Cab4005623AA8912AF4a67b9c29b217) is deployed on Monad Testnet chain `10143`. Its deployment finalized at [block `52198045`](https://testnet.monadscan.com/tx/0x926f2aba82b9d28d116b1cec8d023ae576c145efe3b4bd58b0ed5f40c02ebc48); commitment [`0x12f3…543f`](https://testnet.monadscan.com/tx/0xf22b02b9988a1583634154677e0499f9859fcef24a1697f50e1cd7859519dfcd) finalized before six offer registrations; and the selected-offer/Rain-digest attestation finalized at [block `52198437`](https://testnet.monadscan.com/tx/0x9abec12dded847e9466074a7c37f984b7fd5ca3315b80e6d74137adf2bc9807e). The prior underfunded-signer snapshot is obsolete. No current balance is asserted; re-run preflight before any new write and never expose the private key.

## Primary 90-second story

The judging tracks ask for an agent that transacts autonomously **within predefined controls**. Lead with the agent doing exactly that. State the boundary immediately after — never before, or the work reads as unbuilt.

### 0:00–0:14 — The problem, then the curve

Start on `/negotiate` before clicking anything. Point to the three pledge rungs and `560 pledged buyers`.

> “A single price hides the demand sitting just below it. Here buyers don’t name one price — each pledges the most they’d pay. 300 at 10% off, 180 at 20%, 80 at 30%.”

### 0:14–0:34 — The agent negotiates, and everyone wins the same price

Click **Close window & send the agents**. Let the transcript animate through the probes.

> “Our agent walks that curve down. At each rung it can promise a merchant exactly the volume that unlocks there — and deeper volume unlocks deeper discounts. It stops at the deepest price a merchant will actually honor. Every activated buyer then pays that single cleared price, including the 300 who would happily have paid $900.”

Point to **`$700` · 560 buyers · `$168,000` collective savings**, then the per-tier surplus table and the line reading *merchant floors stayed private throughout*.

### 0:34–0:52 — The agent buys it. This is the money moment.

Click **Send the agent to buy**. Wait for `RAIN SANDBOX · VERIFIED`, then read the receipt aloud — card last four, transaction ID, `settled`.

> “The agent now mints a Rain scoped card for exactly the cleared price, locked to the merchant’s category, then authorizes and settles on its own. Its spending authority is derived from the market outcome — not the other way around. It cannot spend a dollar more than the market cleared at, and it cannot spend it anywhere else.”

If the button is absent or the response says `REHEARSAL`, say: “Live execution is locked in this environment, so this is the labeled rehearsal — it issues no card and moves `$0`.” Do not improvise a stronger claim.

### 0:52–1:10 — The guardrail, proven by a refusal

Switch to `/demo` and click **Settle in sandbox**. Point to the MCC `7995` decline *before* the three settlements.

> “Scope is only real if it refuses. POOL deliberately attempts a blocked merchant category and Rain returns its exact `scoped_card_mcc_not_allowed` decline. Then the three allocations settle. Those three IDs are the same ones in our published record — same-day idempotent replay, so no new money moved.”

**If Monad shows `MONAD_ATTESTATION_FAILED`, say this and move on — it is expected, not a failure:**

> “The attestation for this commitment already exists on chain from our published run, and the registry refuses duplicate writes. You’re watching the guarantee work: one commitment, one attestation, no rewriting history.”

### 1:10–1:18 — Verify the recorded sequence

Switch to `/evidence#live-verifier` and click **Run live verification**. Wait for 15/15.

> “Don’t take our word for it. This reads current Monad Testnet state and recomputes the settlement digest live — commitment finalized before six offer registrations, attestation binding the selected offer to the exact three Rain IDs. Read-only: it queries no Rain, writes nothing, and requests no authorization.”

### 1:18–1:30 — Close on aligned economics

Return to the `$5,748 → $4,668 + $1,080` fixture equation.

If Rain provider IDs are rendered, say: “The Rain sandbox record totals $4,668, while the fixture ledger makes $1,080 available again.” If this run is rehearsal, say: “This replay models the same outcome and creates no provider transaction.” Then add: “The record has no fee. As one unvalidated hypothesis, keeping 10% of realized savings would be $108 before costs while buyers retain 16.9% versus MSRP. We built a market where demand organizes itself.”

## Exact click sequence

Unlock provider actions once before you present: open `/demo`, enter the access code, and confirm the UI offers **Settle in sandbox** rather than only **Run rehearsal**. Without that session every provider path correctly fails closed.

1. Start on `/negotiate`, unclicked. Point to the three rungs and 560 pledged buyers.
2. Click **Close window & send the agents**. Let the transcript finish.
3. Point to `$700`, 560 activated, `$168,000` saved, the per-tier surplus table, and the private-floors line.
4. Click **Send the agent to buy**. Read the card last four and transaction ID aloud once it shows `RAIN SANDBOX · VERIFIED`.
5. Switch to `/demo`, click **Settle in sandbox**, and point to the MCC `7995` decline *before* the three settlements.
6. If Monad reads `MONAD_ATTESTATION_FAILED`, deliver the duplicate-write line and keep moving. It is expected.
7. Switch to `/evidence#live-verifier`, click **Run live verification**, and wait for 15/15.
8. Close on the economics, labeling the fee split as an unvalidated hypothesis.

Keep `/`, `/explore`, and `/merchant` closed unless asked. They are strong Q&A material and dead weight inside 90 seconds.

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
