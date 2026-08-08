# POOL on Monad

`PoolCommitmentRegistry` is the public, privacy-preserving audit spine for a POOL purchase:

1. POOL freezes every buyer's MSRP reservation offchain.
2. The operator commits aggregate terms and a Merkle root of those reservations on Monad Testnet.
3. Only after that transaction is finalized may POOL register authenticated sellers' sealed offer hashes.
4. Rain executes the winning bounded payment.
5. POOL attests a digest of the exact Rain settlement transaction-ID set against the registered winning offer.

The contract publishes aggregate units and reserved cents, but never buyer maximums, identities, or merchant prices. It rejects unregistered offers, over-capture, duplicate commitment/settlement writes, expired bid registration, and unauthorized operators. Operator rotation is two-step.

The application follows Monad's official finality guidance: a receipt is labeled executed, not final; irreversible offchain progression waits until the receipt block is covered by the RPC's `finalized` block tag.

## Commands

```bash
npm run monad:compile
npm run test:contracts
npx hardhat keystore set MONAD_PRIVATE_KEY
npm run monad:deploy:testnet
```

Only Monad Testnet (chain `10143`) exists in `hardhat.config.ts`. There is no mainnet target.
