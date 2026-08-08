# POOL on Monad

`PoolCommitmentRegistry` is the public, tamper-evident audit spine for a POOL purchase:

1. POOL freezes every buyer's MSRP reservation offchain.
2. The operator commits aggregate terms and a Merkle root of those reservations on Monad Testnet.
3. Only after that transaction is finalized may the operator register POOL-validated seller-offer commitments.
4. Rain executes the winning bounded payment.
5. POOL attests a digest of the exact Rain settlement transaction-ID set against the registered winning offer.

The contract publishes aggregate units and reserved cents, but not buyer maximums, identities, or merchant prices in plaintext. It rejects unregistered offers, over-capture, duplicate commitment/settlement writes, expired bid registration, and unauthorized operators. Operator rotation is two-step.

This is an operator-attested registry, not an oracle for POOL balances or Rain. It timestamps POOL's roots and digests; independent verification requires the corresponding reservation proofs and Rain receipts. The deterministic demo's unsalted offer hashes should be treated as integrity commitments, not as cryptographic secrecy for guessable prices.

The application follows Monad's official finality guidance: a receipt is labeled executed, not final; irreversible offchain progression waits until the receipt block is covered by the RPC's `finalized` block tag.

## Commands

```bash
npm run monad:compile
npm run test:contracts
npx hardhat keystore set MONAD_PRIVATE_KEY
npm run monad:deploy:testnet
```

Only Monad Testnet (chain `10143`) exists in `hardhat.config.ts`. There is no mainnet target.
