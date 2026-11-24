# Post-quantum wallet migration landscape

Last reviewed: 24 September 2026. This is a research map for product decisions, not a claim that proposed chain changes are active. See the [detailed rework](docs/REWORK_2026.md).

## Standards and chain capabilities

| Area               | Current finding                                                                                                                                                                                                                                                                                                 | Product implication                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| NIST PQ signatures | [FIPS 204 ML-DSA](https://csrc.nist.gov/pubs/fips/204/final) and [FIPS 205 SLH-DSA](https://csrc.nist.gov/pubs/fips/205/final) are final standards. [FIPS 206 FN-DSA](https://csrc.nist.gov/pubs/fips/206/ipd) remains a draft.                                                                                 | Keep verifier interfaces algorithm-agile and identify the exact scheme used.                                                          |
| Algorand           | [Native Falcon-1024 accounts and rekeying](https://dev.algorand.co/concepts/accounts/post-quantum/) allow an existing account to change its authorizing key while retaining its address.                                                                                                                        | Provide a native route and compatibility checks; do not infer signer scheme from address format.                                      |
| Ethereum / EVM     | [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) allows delegated EOA code, but the ECDSA key retains protocol-level authority. The [Ethereum PQ program](https://pq.ethereum.org/) explores broader upgrades. [EIP-8164](https://eips.ethereum.org/EIPS/eip-8164) is a proposal for native key replacement. | Treat in-place delegation as transitional. A separate account must be verified for sole PQ authority before calling assets protected. |
| Bitcoin            | [BIP-360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki) proposes P2MR. [BIP-361](https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki) describes phased signature sunset and recovery proposals. Neither is activated.                                                              | Build watch-only inventory and preparation. Gate proposed output construction from mainnet until activation and wallet support.       |
| Solana / Stellar   | Programs and custom accounts can gate moved assets behind alternative authorization, but the original classical account remains exposed.                                                                                                                                                                        | Describe this as a custody change and verify upgrade authority, withdrawal, and recovery.                                             |

## Product stance

The common layer is **inventory → capability decision → signing plan → verification record**. The execution route changes by chain, wallet, and account type. Read-only planning is available now; PQWeave's asset-moving contracts are unaudited prototypes.

Security language must identify whether it describes the **current account**, a **proposed destination**, or **network-level capability**. A verifier address returned by an arbitrary smart contract is not authenticated evidence that the account enforces post-quantum authorization. EIP-7702 delegation is visible on chain, but it can be replaced or revoked by the ECDSA key.

## Validation priorities

1. Independently audit an EVM sole-authority destination, signer, verifier, and asset sweep.
2. Add authenticated smart-account provenance and owner-policy inspection to the scanner.
3. Test native Algorand rekeying with supported wallets and applications, including recovery.
4. Validate institutional inventory and approval flows on read-only pilot cohorts.
5. Track draft network proposals and only activate new transaction routes after chain activation and wallet support.

The [chain matrix](CHAINS.md) describes current routes. [SECURITY.md](SECURITY.md) lists limits of the present implementation.
