# PQWeave

PQWeave is a Bitcoin preparation layer for existing wallets and signers. Inspect
public-key exposure, prepare bounded unsigned PSBTs, restore and recheck plans,
and verify the transaction before signing in your own wallet.

**Release sequence: Bitcoin, then Ethereum.** The site starts with the Bitcoin kit and dated research.
The default route reduces key exposure using standard Bitcoin outputs; it does
not add post-quantum signatures. Experimental QSB is a separate research route.

- [Bitcoin-only release: build and run](releases/bitcoin/README.md)
- [Bitcoin research and architecture](docs/BITCOIN_RESEARCH_2026.md)
- [Supported release scope, testing and operations](docs/BITCOIN_PRODUCTION.md)
- [Validation results](docs/BITCOIN_VALIDATION.md)
- [Security boundaries](SECURITY.md)
- [BTC/ETH self-audit, fixes and expanded tests](docs/SELF_AUDIT_2026-09-25.md)

The web Bitcoin API is read-only. The SDK exports `buildBitcoinReadinessPlan`,
`createBitcoinPlanBundle`, `restoreBitcoinPlanBundle` and `revalidateBitcoinPlan`
from `@pqweave/sdk/bitcoin`. Signing and broadcasting remain in the user's wallet.

Ethereum now has a verified transfer planner, durable Node signing reservations,
key-rotation fixes and a real local ERC-4337/EIP-7702 lifecycle test. The `/ethereum`
site offers readiness scans and report exports. Mainnet execution remains disabled.
See [Ethereum research](docs/ETHEREUM_RESEARCH_2026.md), [validation](docs/ETHEREUM_VALIDATION.md)
and [deployment](DEPLOYMENT.md). Run `pnpm ethereum:test` for the local lifecycle.

Other chain modules remain research prototypes, outside these release targets.

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
