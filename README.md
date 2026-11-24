# PQWeave

[![CI](https://github.com/soloking1412/pqweave/actions/workflows/ci.yml/badge.svg)](https://github.com/soloking1412/pqweave/actions/workflows/ci.yml)

Open-source tooling for the post-quantum transition. Read a wallet's exposure on
16 chains, then get the migration route that chain actually supports.

A large enough quantum computer can turn a public key into the private key. Most
wallets published theirs the first time they sent a transaction. What can be done
about it differs by chain, so PQWeave names the outcome plainly: protected,
transitional, custody change, prepared or unsupported.

Live at [pqweave.com](https://www.pqweave.com). MIT licensed. **Not audited.**

## What works today

- **Scan.** Paste a public address. No wallet connection, no signature, no account.
- **Bitcoin kit.** Watch-only: inventory a wallet from an xpub, prepare unsigned
  PSBTs to a fresh address, and check the signed result against the plan before
  broadcast. Verified against Bitcoin Core 29.1 on regtest. This reduces exposure.
  It does not add a post-quantum signature to Bitcoin, and no application can.
- **Ethereum.** Move assets to a smart account where a hash-based post-quantum key
  is the only authority. Exercised against the real EntryPoint 0.7 on a local
  Prague node. Testnet only.
- **Kit API.** `POST /api/kit` plans up to 50 public account records per request
  for wallets and custodians. The same selector ships as `@pqweave/sdk/kit`.

## Evidence

| Gate                   | Result                | Reproduce                                      |
| ---------------------- | --------------------- | ---------------------------------------------- |
| SDK suite              | 492 tests             | `pnpm --filter @pqweave/sdk test`              |
| Contracts              | 94 tests, fuzzed      | `forge test --root packages/contracts`         |
| Bitcoin Core lifecycle | 113 assertions        | `pnpm --filter @pqweave/sdk test:bitcoin-core` |
| Ethereum lifecycle     | 122 assertions        | `pnpm ethereum:test`                           |
| Winternitz vs Lamport  | 2,304 B vs 24,736 B   | `forge test --match-contract VerifierGas -vv`  |
| Dependency audit       | zero known advisories | `pnpm audit --audit-level low`                 |

The [self-audit](docs/SELF_AUDIT_2026-09-25.md) lists two high-severity bugs we
found in our own verifiers, the fixes, and what is still open. It is not an
independent review. The plan from here is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Reading

- [Security boundaries](SECURITY.md)
- [Bitcoin research](docs/BITCOIN_RESEARCH_2026.md), [release scope](docs/BITCOIN_PRODUCTION.md), [validation](docs/BITCOIN_VALIDATION.md)
- [Ethereum research](docs/ETHEREUM_RESEARCH_2026.md), [validation](docs/ETHEREUM_VALIDATION.md), [deployment](DEPLOYMENT.md)
- [Bitcoin-only release: build and run](releases/bitcoin/README.md)

## Repository capability inventory

| Chain                       | Route                                                                             | Current status                                                        |
| --------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| EVM                         | Move assets to a separate smart account with a post-quantum key as sole authority | Testnet prototype; contracts unaudited                                |
| Algorand                    | Create a Falcon-1024 account or rekey an existing address to Falcon authority     | Native chain capability; wallet and app compatibility must be checked |
| Bitcoin, Litecoin, Dogecoin | Watch-only inventory and fresh-address preparation                                | Transitional; classical signatures still authorize spending           |
| Solana, Stellar             | Program-controlled vault                                                          | Research prototypes; custody and recovery model changes               |
| Other scanned chains        | Exposure and capability assessment                                                | No verified asset-moving route in this kit                            |

A route marked “protected” describes the **target state**, not a claim that an input address is protected. An address scan cannot certify the current signing policy of an arbitrary smart account. EIP-7702 delegation preserves the ECDSA key's ability to revoke or replace it, so it is not full post-quantum protection.

## Security status

The asset-moving contracts and vaults are **unaudited**. Do not use them to secure real funds. The kit's planning and scans are read-only; private keys and seed phrases are never requested. Review [SECURITY.md](SECURITY.md) and the [2026 rework plan](docs/REWORK_2026.md).

Bitcoin BIP-360 and BIP-361 are drafts, not activated protection. Do not send mainnet funds to a proposed witness output before activation. Algorand's native Falcon and rekey path is documented by [Algorand](https://dev.algorand.co/concepts/accounts/post-quantum/).

## Develop

```bash
pnpm install
pnpm --filter @pqweave/sdk build
pnpm --filter @pqweave/sdk test
pnpm --filter @pqweave/sdk test:bitcoin-core # requires bitcoind and bitcoin-cli
pnpm --filter @pqweave/web typecheck
pnpm dev
```

## Repository

- [apps/web](apps/web): migration kit, scanner, partner pages, and read-only API
- [packages/sdk](packages/sdk): route selector, scanners, EVM and Bitcoin tooling
- [packages/contracts](packages/contracts): EVM account and verifier prototypes
- [packages/solana-vault](packages/solana-vault) and [packages/stellar-vault](packages/stellar-vault): research vaults
- [CHAINS.md](CHAINS.md): current chain capability matrix
- [LANDSCAPE.md](LANDSCAPE.md): research and standards context
- [REWORK_2026.md](docs/REWORK_2026.md): detailed architecture, findings, and roadmap

## Security reports and license

Report vulnerabilities to **security@pqweave.com**; see [SECURITY.md](SECURITY.md). MIT licensed; see [LICENSE](LICENSE).
