# PQWeave

Post-quantum migration layer for EVM wallets.

Quantum computers running Shor's algorithm will be able to derive a private key
from an exposed public key, forging the ECDSA signatures that authorize every
account on Ethereum and other EVM chains. Public keys are exposed the moment an
account broadcasts its first transaction, so funds are harvestable today and
spendable on "Q-Day". PQWeave helps self-custody holders move to
post-quantum-safe security without leaving their existing wallet.

It works at the account-abstraction layer, so it supports **any** EVM wallet
(MetaMask, Ledger, Rabby, Trust, Coinbase Wallet, …) — the wallet stays the
ECDSA signer while PQWeave supplies the quantum-resistant account logic.

## What you can do

1. **Scan** — detect whether an address has an exposed public key and score its
   quantum risk. Works on any EVM chain **and Bitcoin**, no wallet connection. The
   threat is universal but the fix is chain-specific — see [CHAINS.md](CHAINS.md).
2. **Migrate (one transaction)** — sweep an entire wallet (native + ERC-20 + NFTs)
   into a quantum-safe account in a single EIP-7702 transaction. One signature
   moves everything; no per-asset approvals.
3. **Create** — a new user gets a fresh quantum-safe account whose public key is
   never exposed as a vulnerable EOA.
4. **Harden in place (EIP-7702)** — keep an existing address but require a
   post-quantum signature for high-value operations during the transition.

## Shared, not per-customer

You need verifier and account code on each chain because EVM nodes only verify
ECDSA natively — enforcing a post-quantum signature requires code where the
transaction runs. But the contracts are deployed **once per chain at the same
deterministic address everywhere** (CREATE2), and are **shared** by every user
and every partner — like the canonical EntryPoint, Permit2, or Multicall3. There
are no per-customer contracts.

## Post-quantum signatures

The on-chain verifier is pluggable. The default is hash-based for maximum
conservatism and EVM efficiency; lattice verifiers drop in behind the same
`IPQCVerifier` interface.

| Scheme                | Standard                     | Role                                                           |
| --------------------- | ---------------------------- | -------------------------------------------------------------- |
| Lamport + Merkle      | Hash-based (FIPS 205 family) | Default on-chain gate — keccak256 only, no lattice assumptions |
| Falcon-512            | FIPS 206                     | Compact lattice verifier (ETHFALCON), selectable per account   |
| ML-DSA-65 (Dilithium) | FIPS 204                     | NIST primary; first-class in the SDK                           |

Accounts use a hybrid policy: ECDSA for routine operations, a post-quantum
signature for anything above a configurable threshold (large transfers, token
approvals, key rotation, delegation changes). Even if the ECDSA key is broken,
an attacker cannot pass the post-quantum gate.

## Layout

```
packages/sdk        @pqweave/sdk — scanner, PQC keys, account + migration
packages/contracts  Foundry — account, policy, verifier, sweeper, executor, factory
apps/web            Next.js — public scanner + migration dApp
```

## Develop

```bash
pnpm install
pnpm test            # SDK (vitest)
pnpm contracts:test  # contracts (forge)
pnpm dev             # web app
```

## License

MIT
