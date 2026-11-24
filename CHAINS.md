# Chain capability matrix

Last reviewed: 24 September 2026. A public-address scan measures limited observable facts; it does not prove wallet control, complete asset inventory, or the safety of a signer. The [kit](apps/web/app/kit) returns a route with checks and limitations for each account.

| Network                                     | Public-key exposure                                                   | Available route                                                                                    | PQWeave status                                |
| ------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Ethereum, Base, Arbitrum, Optimism, Polygon | A signed EOA transaction reveals the ECDSA key                        | Sweep to a separate, sole-authority PQ smart account; EIP-7702 in-place delegation stays revocable | Scan live; sweep testnet prototype, unaudited |
| Algorand                                    | Address shape alone cannot reveal the active signing scheme           | Native Falcon-1024 account or rekey existing account to Falcon authority                           | Scan live; kit links to official rekey guide  |
| Bitcoin                                     | Key may appear in the output or first spend, depending on script type | Fresh unused address can reduce exposure; PQ signatures need network support                       | Scan and watch-only PSBT tools                |
| Litecoin, Dogecoin                          | UTXO first-spend exposure varies by output type                       | Fresh-address preparation only                                                                     | Scan; kit plans                               |
| Solana                                      | Classical Ed25519 address reveals its key                             | Move supported assets to a PQ-gated program vault                                                  | Scan; unaudited research vault                |
| Stellar                                     | Classical Ed25519 address reveals its key                             | Soroban custom-account vault                                                                       | Scan; unaudited testnet prototype             |
| Cardano                                     | Payment key revealed on a spend                                       | Fresh-address preparation and protocol tracking                                                    | Scan; no PQ execution                         |
| Cosmos Hub, XRP, Aptos, NEAR                | Exposure depends on account type and transaction history              | Account assessment and protocol tracking                                                           | Scan; no verified PQ execution                |
| Sui, Tron, TON, Polkadot                    | Depends on scheme and account type                                    | Account assessment and protocol tracking                                                           | Scan; no verified PQ execution                |

**Do not collapse these into one “quantum-safe” badge.** The migration kit distinguishes target protection, transitional exposure reduction, custody change, and assessment-only routes. It also distinguishes a chain's native capability from what PQWeave has implemented.

Algorand supports [native Falcon accounts and rekeying](https://dev.algorand.co/concepts/accounts/post-quantum/). Existing accounts can keep their address while changing authorization, subject to wallet and application support. PQWeave's scan does not infer Falcon authority from the address format.

Bitcoin's [BIP-360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki) and [BIP-361](https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki) remain proposals. P2MR is not an activated mainnet post-quantum destination. The signer and any proposed output must be independently verified before use.

See [REWORK_2026.md](docs/REWORK_2026.md) for the threat model, evidence, and implementation sequence.
