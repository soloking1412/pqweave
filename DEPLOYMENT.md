# Deploying PQWeave to a testnet

This walks through a live Base Sepolia deployment and a real one-click migration.
Base Sepolia is recommended: it supports EIP-7702, has the canonical ERC-4337
EntryPoint, and faucet ETH is free.

## 1. Create and fund a throwaway deployer key

Use a brand-new key that holds nothing but testnet ETH.

```bash
cast wallet new
# → prints an Address and a Private key. Copy both.
```

Fund the printed address with Base Sepolia ETH from a faucet, e.g.:

- https://www.alchemy.com/faucets/base-sepolia
- https://docs.base.org/docs/tools/network-faucets

~0.02 ETH is plenty for deployment.

> **Use a key that has NOT been delegated (EIP-7702).** If you reuse a key that
> once tested the migration flow, it carries a 7702 delegation designator, and
> some RPCs cap in-flight transactions for delegated accounts — the deploy then
> fails with `in-flight transaction limit reached for delegated accounts`. The
> deploy script already passes `--slow` (one confirmed tx at a time) to stay
> under that limit, but a fresh, never-delegated key avoids the issue entirely
> and is the cleaner choice for canonical infra.

## 2. Deploy + wire the web app (one command)

From the repo root, with your funded key in the environment:

```bash
DEPLOYER_PRIVATE_KEY=0x<your-funded-key> \
pnpm --filter @pqweave/contracts deploy:base-sepolia
```

This deploys all six contracts and then auto-writes their addresses into
`apps/web/.env.local` (no hand-copying). Because the deploy uses CREATE2, the
addresses are the **same on every EVM chain** — deploy once per network and reuse
everywhere:

```
LamportVerifier:    0x…
PQWeaveFactory:     0x…
MigrationSweeper:   0x…
BatchExecutor:      0x…
PQWeaveForwarder:   0x…
PQWeaveAccountImpl: 0x…
```

`apps/web/.env.local` ends up with:

```bash
NEXT_PUBLIC_VERIFIER_ADDRESS=0x…
NEXT_PUBLIC_FACTORY_ADDRESS=0x…
NEXT_PUBLIC_BATCH_EXECUTOR_ADDRESS=0x…
NEXT_PUBLIC_FORWARDER_ADDRESS=0x…
NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS=0x…
NEXT_PUBLIC_DEPLOYMENT_STAGE=testnet   # flips the UI banner from "preview" to "testnet beta"
```

> **Address-change warning (2026-07):** `PQWeaveAccount` gained an `initialize`
> guard (deployer-or-self) and a `rotatePqcKey` length check. That changes its
> creationCode, so the factory address and **every counterfactual account
> address derived before this change are different now**. Testnet must be
> redeployed and any previously shared counterfactual addresses regenerated.
> Never reuse pre-change predicted addresses.

Notes:

- Already deployed and just need to re-link the web app? Run
  `pnpm --filter @pqweave/contracts wire-web-env 84532`.
- Prefer to do it by hand? Run the raw `forge script … --broadcast` and copy the
  three addresses into `apps/web/.env.local` yourself.
- **Verify the source on Basescan** (do this — source-verified contracts are
  table stakes for a security product). With a free Etherscan/Basescan API key:
  ```bash
  ETHERSCAN_API_KEY=<your-key> \
  pnpm --filter @pqweave/contracts verify:base-sepolia
  ```
  This `--resume`s the deploy you just broadcast and publishes the source for all
  four contracts. After it finishes, each address on Basescan shows a green
  "Contract" checkmark and readable code.
- (Optional) add `RPC_URL_BASE_SEPOLIA=…` to `apps/web/.env.local` for a reliable
  server-side scanner RPC.

## 3. Run a real one-click migration

```bash
pnpm dev   # from the repo root
```

1. Open http://localhost:3000/migrate. The banner now reads **Testnet beta**.
2. Connect a 7702-capable wallet (MetaMask) on **Base Sepolia**. Fund this test
   wallet with a little faucet ETH (and any test ERC-20 you want to sweep).
3. Step 3 — choose a password. PQWeave generates a fresh post-quantum key in your
   browser from new CSPRNG entropy (never derived from your wallet signature) and
   downloads an encrypted keystore; the raw key is never shown.
4. Step 4 — optionally paste ERC-20 addresses, then **Migrate my wallet**. This
   signs one EIP-7702 transaction that sweeps native + listed tokens into your new
   quantum-safe account. Follow the explorer link to confirm on-chain.

## 4. Run the contract tests against the live network (optional)

```bash
cd packages/contracts
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org forge test --match-path "test/integration/*"
```

This forks Base Sepolia and drives the full ERC-4337 lifecycle through the real
EntryPoint.
