# POOL judge demo

This is the shortest path through the product story. It fits in roughly 2 minutes 30 seconds and leaves time for questions.

## Before presenting

```bash
npm run demo:preflight
npm test
npm run dev
```

Use the local build for a clearly labeled Rain-only development fallback. For the competition path, set `MONAD_LIVE_REQUIRED=true`; preflight then requires a valid Monad Testnet registry, a signer matching its finalized `operator()`, and the protected Rain setup. Keep a second tab on the public preview as a no-secrets rehearsal fallback. Never expose the Rain or Monad signing credentials in the browser, terminal, slides, or repository.

For a first testnet deployment, put a fresh funded testnet-only `MONAD_PRIVATE_KEY` in the ignored `.env.local`, run `npm run monad:deploy:testnet`, then add the emitted registry address as `MONAD_REGISTRY_ADDRESS`. The deploy command and app runtime intentionally read the same local secret file.

## 2:30 narrative

**0:00 — Problem and wedge**

“Today, agents shop one buyer at a time. POOL lets patient buyers organize into prefunded demand, then makes merchants compete for the whole order.”

Point to the three balances and the $5,748 MSRP reservation. Say explicitly: “A buyer cannot join without cleared MSRP coverage, and reserved money cannot be withdrawn or double-spent.”

**0:25 — Bounded buyer agent**

Run the natural-language buyer intent in the Judge Console. Point out the trace: AI translates fuzzy language into typed constraints; deterministic policy decides compatibility and funding. The model has no payment tool.

**0:45 — Launch the market**

Click **Launch prefunded market**. Let the animation isolate the incompatible ultrawide request and freeze 12 funded units before the RFP opens.

**1:10 — Monad is causal**

Point to the commitment proof rail. Explain: “The Solidity registry timestamps POOL's funding-root claim and public terms before sellers bid. Merchant prices are represented by commitments rather than posted in plaintext. After Rain settles, the exact Rain transaction-ID set is attested against the winning offer.”

If the card says **local proof only**, say exactly that no testnet transaction is being claimed. If a funded testnet deployment is configured, open the explorer link.

**1:35 — Merchant competition**

Submit the $389 / 7-day test bid. Show that quantity is server-pinned to the committed 12 units and private buyer ceilings never enter the seller response.

**1:55 — Rain execution**

At stage 11, click **Settle in sandbox**. Point out the forced MCC 7995 decline, three scoped buyer cards, three legitimate electronics authorizations, and real sandbox transaction IDs. Rain executes only after POOL clears the fixed agreement.

**2:20 — Close**

“POOL captures $4,668, releases $1,080 back to available balances, and required zero human negotiation. We didn’t build AI that shops. We built a market where demand organizes itself.”

## Honest fallback order

1. Rain unavailable: use the clearly labeled rehearsal; never imply it is a live sandbox receipt.
2. OpenAI key unavailable: the endpoint reports `deterministic_fallback`; the fixed financial policy remains identical.
3. Monad signer unavailable: keep the public build in rehearsal and, only in local development with the requirement flag off, use the clearly labeled Rain-only path. Show the contract tests and local commitment hashes; never invent an address or transaction.
4. Network unavailable: use the fixed evidence replay and explain which rails are simulated versus externally verified.

## Likely judge questions

- **Why reserve MSRP?** It turns interest into credible, seller-actionable demand and removes payment-default risk after a group forms.
- **Why Rain?** Scoped cards give the cleared coalition bounded merchant, MCC, amount, and expiration authority without exposing card credentials.
- **Why Monad?** It makes POOL's “funded before bidding” and “these Rain IDs settled this winning offer” claims ordered and tamper-evident without posting buyer ceilings or seller prices in plaintext. The chain timestamps commitments; observers still reconcile the underlying POOL and Rain evidence.
- **What does AI control?** Interpretation, compatibility suggestions, and bid evaluation. Deterministic code alone controls reservations, policy gates, authorization amounts, and settlement.
- **What is simulated?** The POOL deposit ledger and fictional merchants. The Rain sandbox is real when enabled; Monad is on-chain only when the UI shows a verified address and transaction.
