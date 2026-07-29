# Multi-chain quantum exposure: problem and solution per chain

The quantum threat is **universal** — nearly every public blockchain authorizes
spending with elliptic-curve signatures (ECDSA or EdDSA) that Shor's algorithm
breaks. Of the top ~26 chains, ~24 rely purely on quantum-vulnerable signatures.

But the **defense is not portable**. Each chain has a different execution model,
so "the solution" differs sharply. The honest split:

- **Detection (scanning) is portable.** Spotting an exposed public key is just
  on-chain analysis. PQWeave ships this for EVM, Bitcoin, Litecoin, Solana,
  Cardano, Cosmos, XRP, Algorand, Stellar, NEAR, and Aptos today — covering all
  three exposure families (recoverable from signatures, hash-behind-address, and
  address-is-the-key). Each scan result reports its honest migration capability
  (`migrationCapability` in the SDK): **quantum-safe** for EVM, **transitional**
  (move-to-fresh-address) for first-spend chains, **none** for address-is-key
  chains until a protocol upgrade ships.
- **Protection (migration) is chain-specific.** Our EVM approach uses smart
  accounts (ERC-4337) and EIP-7702 delegation. **Bitcoin has no smart contracts,
  so that approach cannot be ported to it.** Bitcoin's real fix is a protocol-level
  soft fork.

## Per-chain matrix

| Chain                                 | Signature                   | What exposes the key                                                                                          | Migration path                                                                                                              | Our support                                          |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **EVM** (Ethereum, Base, Arbitrum, …) | secp256k1 ECDSA             | Any sent transaction (key recoverable from the signature)                                                     | Smart account (ERC-4337) + one-tx EIP-7702 sweep into a post-quantum account                                                | **Scan + migrate (built)**                           |
| **Bitcoin**                           | secp256k1 ECDSA / Schnorr   | P2PK (key in output), reused P2PKH/P2WPKH (revealed on first spend), Taproot key-path (tweaked key in output) | No smart contracts → no in-place fix. Move to a fresh unused address; await BIP-360 (P2MR, prefix `bc1r`, ML-DSA) soft fork | **Scan (built)**                                     |
| **Litecoin**                          | secp256k1 ECDSA             | Same UTXO model as Bitcoin                                                                                    | Move to a fresh address; await protocol fix                                                                                 | **Scan (built)**                                     |
| **Solana**                            | Ed25519                     | The address _is_ the public key — exposed from creation, before any transaction                               | Protocol-level PQC (on Solana's roadmap)                                                                                    | **Scan (built)**                                     |
| **Cosmos Hub (ATOM)**                 | secp256k1 ECDSA             | Account stores its public key after the first signed transaction                                              | Protocol-level PQC                                                                                                          | **Scan (built)**                                     |
| **XRP Ledger**                        | secp256k1 ECDSA             | Signing public key revealed in every submitted transaction                                                    | Protocol-level PQC                                                                                                          | **Scan (built)**                                     |
| **Cardano**                           | Ed25519                     | Payment public key revealed when the address is a transaction input                                           | Move to a fresh address; protocol fix                                                                                       | **Scan (built)**                                     |
| **Algorand**                          | Ed25519                     | Address _is_ the public key — exposed from creation                                                           | Protocol-level PQC                                                                                                          | **Scan (built)**                                     |
| **Stellar**                           | Ed25519                     | Address _is_ the public key — exposed from creation                                                           | No in-place fix; Soroban PQ-vault custody (sweep to a new `__check_auth` account) — testnet, unaudited                      | **Scan + vault (built, testnet)**                    |
| **Dogecoin, Bitcoin Cash**            | secp256k1 ECDSA             | UTXO model                                                                                                    | Move to fresh address; protocol fix                                                                                         | Scan-ready (no reliable public Esplora endpoint yet) |
| **NEAR**                              | Ed25519                     | Account access-key public keys stored on-chain                                                                | Protocol-level PQC                                                                                                          | **Scan (built)**                                     |
| **Aptos**                             | Ed25519                     | Public key revealed on the first signed transaction (sequence > 0)                                            | Move to a fresh address; protocol fix                                                                                       | **Scan (built)**                                     |
| **Sui, Tron, Polkadot, …**            | EdDSA / secp256k1 / sr25519 | Address or first-spend reveals the key                                                                        | Protocol-level, varies                                                                                                      | Scan (planned, same pattern)                         |

## Why EVM gets the full solution and Bitcoin only gets scanning

EVM chains run arbitrary smart-contract code, so we can deploy a contract that
verifies a post-quantum signature and move funds into an account it controls —
**at the application layer, today, without changing the protocol.** That is the
whole PQWeave account + EIP-7702 design.

Bitcoin's Script is intentionally limited and has no general computation, so you
cannot deploy a "post-quantum verifier" for it. A Bitcoin holder's only real
options are:

1. **Scan** to learn whether a given address is already exposed (what we provide).
2. **Move to a fresh address** never spent from — this delays exposure but does
   not remove it, since spending re-reveals the key.
3. **Wait for the protocol fix** —
   [BIP-360 (P2MR, Pay-to-Merkle-Root)](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki),
   a draft soft fork adding an output type that commits to a script tree with no
   public key (SegWit v2, `bc1z…`). It was **merged into bitcoin/bips in Feb 2026
   but is `Status: Draft` and not activated.** It deliberately contains no
   post-quantum signatures — those are deferred to a companion BIP via
   `OP_SUCCESSx`. Until it activates, witness v2 outputs are **anyone-can-spend**,
   so nothing should be sent to a `bc1z` address on mainnet. PQWeave ships tested
   construction and migration tooling for it (`packages/sdk/BIP360.md`), hard-
   blocked on mainnet, so the path is ready the day activation lands.

So for Bitcoin we are honest: PQWeave is an **awareness and detection** tool
until the network ships a protocol-level remedy. We do not claim to "migrate"
Bitcoin, because at the application layer that is not technically possible.

## Vault custody for address-is-the-key chains (Solana, Stellar)

On Solana and Stellar the address _is_ the Ed25519 public key, so nothing can
harden your existing account — `migrationCapability` stays `none`, and we never
call this "migration". What these chains _do_ allow is a **vault**: a program
(Solana) or Soroban custom account (Stellar) that only releases funds against a
Lamport+Merkle post-quantum signature, using the same key as the EVM account. You
**sweep funds into a new account**; the old key stays exposed forever and only the
swept funds are protected. Stellar's vault is on **testnet**, unaudited — see
`/protect/stellar` and `packages/stellar-vault`. This is transitional custody, not
a quantum-safe wallet, and every surface says so.

## SDK usage

```ts
import { scanBitcoinAddress } from '@pqweave/sdk/bitcoin';

const report = await scanBitcoinAddress('bc1q…');
console.log(report.type, report.exposed, report.level, report.reasons);
```

## References

- [Why quantum matters now for blockchain (Cambridge Judge)](https://www.jbs.cam.ac.uk/2025/why-quantum-matters-now-for-blockchain/)
- [BIP-360 (Pay-to-Merkle-Root)](https://bip360.org/bip360.html) ·
  [explainer](https://crypto.news/bitcoin-is-going-quantum-proof-inside-bip-360-and-the-migration/)
- [Solana Ed25519 quantum exposure](https://bmic.ai/blog/can-solana-survive-quantum-computing-the-ed25519-vulnerability-explained/)
