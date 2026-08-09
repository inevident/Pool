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
| Monad ordering | funding commitment → registered offer set → Rain settlement → selected-offer receipt attestation |

The organizations, buyer ledger, merchants, and orders in this fixture are fictional. No real money moves. The fixed fixture is separate from the repeat-use consumer product at `/`.

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

For an offline Rain backup, open [`public/evidence/rain-sandbox-2026-08-09.png`](./public/evidence/rain-sandbox-2026-08-09.png). It is a dated capture of three settled Rain sandbox records and one provider-declined MCC `7995` probe. Its Monad panel is deliberately labeled local-only, so it must not be presented as Testnet evidence.

## Before presenting

```bash
npm run demo:preflight
npm test
npm run dev
```

Then:

1. Open `/demo` at desktop width and confirm the first-frame proof summary is visible without scrolling.
2. Confirm the status cards use the evidence labels above.
3. Run the fixed market once and reset it.
4. If Rain is intended, confirm the UI offers **Settle in sandbox**. If it offers only **Run rehearsal**, present rehearsal mode without apology or overclaiming.
5. If Monad is intended, confirm the registry, signer/operator match, finalized state, and explorer links before speaking about a testnet transaction.
6. Keep secrets out of the browser, terminal, slides, screenshots, and repository.

Current Monad blocker: signer `0x070dd53f4FdF178E29df30e03FEAD90Cd300e6ed` has `0.116` finalized Testnet MON. The exact registry deployment estimates at `906,782` gas and currently requires about `0.18317` MON under Hardhat Ignition's fee ceiling; `npm run monad:setup` recommends `0.20149` MON with its 10% retry cushion. It still needs about `0.08549` additional faucet or organizer Testnet MON before a cushioned deployment. Never expose its private key.

## Primary 90-second story

### 0:00–0:12 — Lead with the outcome

Do not open with architecture. Point to the first-frame summary.

> “POOL turns patient buyers into MSRP-reserved fixture demand. Here, 12 units reserve $5,748 before POOL registers any seller offer. Competition takes the price from $479 to $389, so the fixture makes $1,080 available again.”

### 0:12–0:30 — Replay MSRP-reserved fixture demand

Click **Replay the fixed market**. Let the replay reserve 3 + 4 + 5 units and isolate the incompatible ultrawide request.

> “Interest is not enough. Each buyer must cover full MSRP. Compatible commitments combine; hard product constraints still exclude the wrong demand.”

### 0:30–0:47 — Show why Monad is causal

As the replay freezes 12 units, point to the Monad evidence state.

> “POOL freezes the exact fixture terms before registering the admitted sealed-offer hashes. When Testnet is configured, the funding commitment finalizes first and the offer set is registered next. After Rain settles, the attestation names one registered offer as selected and binds the exact receipt set. The chain orders POOL’s recorded claims; it does not prove when an offchain bid first existed, what a seller saw, or that bank funds exist.”

If there is no explorer evidence, replace the second sentence with: “This run is a local commitment reconstruction, so we are not claiming a Testnet transaction.”

### 0:47–1:02 — Let merchants compete

Point to the three simulated sealed merchants and the $389 winner.

> “Three merchants compete for the whole order without seeing buyer ceilings or one another’s private floors. Deterministic policy accepts only a complete offer inside every mandate.”

### 1:02–1:20 — Execute bounded authority

When the market reaches **Rain receives scoped authority**, choose exactly one path:

- If **Settle in sandbox** is present, click it. After the UI shows `RAIN SANDBOX · VERIFIED`, point to the three provider IDs and the MCC `7995` decline.
- Otherwise click **Run rehearsal** and say: “This is the labeled deterministic rehearsal; it creates no Rain or Monad transaction.”

Live-sandbox wording:

> “Only after clearing does Rain receive three scoped-card requests derived from the agreed allocations, electronics MCC, and expiry. Rain’s documented lifetime authorization ceiling includes a 1.2× hold buffer; POOL’s deterministic policy still admits only the exact agreed charges. The MCC 7995 challenge must return `scoped_card_mcc_not_allowed`; a generic or ambiguous decline fails closed before the three legitimate allocations settle at their exact amounts.”

### 1:20–1:30 — Close on the product

Point to the evidence label and the `$5,748 → $4,668 + $1,080` fixture equation.

If Rain provider IDs are rendered, say: “The dated Rain sandbox outcome settles $4,668, while the fixture ledger makes $1,080 available again.” If this run is rehearsal, say: “This replay models the same outcome and creates no provider transaction.” Then close: “We did not build AI that shops; we built a market where demand organizes itself.”

## Exact click sequence

1. Open `/demo` and hold on the proof summary.
2. Click **Replay the fixed market** once.
3. Let autoplay reach **Market cleared**. Do not repeatedly click while Monad preparation is running.
4. Click **Settle in sandbox** only if the button exists and the presenter intends a provider run; otherwise click **Run rehearsal**.
5. At the outcome, point to the evidence-mode label first, then the receipt IDs or simulated labels, then Monad evidence.
6. Click **Reset the market** before the next presentation. Reset itself causes no provider operation.

## Optional deep dive and Q&A

Do this only after the 90-second story or when a judge asks.

- Expand **Open the technical inspector**. Run the buyer intent to show natural language becoming typed constraints. Say that the model has no payment tool.
- Run the `$389`, seven-day merchant bid after the replay has opened the seller market. Show server-pinned quantity and deterministic mandate checks.
- Expand the fixture ledger to reconcile `$5,748 reserved → $4,668 Rain-settled + $1,080 fixture-available` when provider IDs are rendered; in rehearsal, label the same equation simulated.
- Expand the event stream to show that demand freezes before the merchant RFP.
- Open an explorer link only when one is rendered. A hash without a verified link is not presented as a Testnet transaction.

The repeat-use product has stricter real-time semantics than this replay: its UI, domain, commitment API, and settlement API forbid market rehearsal before the published cutoff, then open an exact one-hour bid window. Those product APIs are mandate-aware rehearsal only and never contact Rain or Monad. The fixed `/demo` fixture is the sole complete three-allocation provider flow, not a claim that the consumer pool’s two-week clock elapsed during the demo.

## Backup order

1. **Rain unavailable:** run the labeled rehearsal. Do not substitute simulated receipts after a failed provider attempt.
2. **OpenAI unavailable:** the buyer endpoint reports deterministic fallback. Financial policy is unchanged and the model still has no money authority.
3. **Monad unavailable or unfunded:** show local commitment reconstruction and contract tests; say no Testnet transaction is claimed.
4. **Network unavailable:** use the already loaded fixed replay and narrate which evidence is local, simulated, Rain sandbox, or Monad Testnet.
5. **Partial Rain result:** stop. Keep reservations frozen for deliberate same-key operator retry or reconciliation; this repository has no automatic retry worker. Do not claim a refund or complete settlement.

## Fast judge answers

- **Why full MSRP?** It converts interest into seller-actionable demand and removes buyer funding default after award.
- **Why Rain?** In the fixed demo it gives an already-cleared deal purpose-specific card with an allocation-derived amount, MCC, and expiry. Rain permits a documented 1.2× lifetime hold buffer, while POOL admits only the exact agreed charges.
- **Why Monad?** In the fixed competition flow it orders POOL’s recorded funding commitment, registered offer set, and post-Rain selected-offer receipt attestation without publishing private economics. It does not prove offchain seller visibility or bank funds.
- **What does AI control?** Interpretation and suggestions. Deterministic code controls timing, accounting, constraints, offer validity, authorization amount, and settlement.
- **What is simulated?** The POOL browser ledger, fixture buyers, merchants, inventory, and fulfillment. Rain is real only when provider IDs appear; Monad is onchain only when finalized explorer evidence appears.
- **Is the buyer ledger custody?** No. It is browser-local product state, not a bank account, wallet, regulated hold, or durable server database.
