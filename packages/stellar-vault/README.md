# pqweave-stellar-vault — Stellar (Soroban) post-quantum vault

The Stellar counterpart to the EVM PQWeave account and the Solana vault.
**Not audited, not deployed to mainnet. Do not use with real funds.**

This does **not** make a Stellar wallet quantum-safe — a Stellar account id
(`G...`) _is_ its Ed25519 public key, so it is exposed the moment the account is
funded and cannot be hardened in place. The vault is a Soroban **custom account**
(`CustomAccountInterface`) that authorizes operations only against a valid
hash-based (Lamport + Merkle) one-time signature, which a quantum computer cannot
forge. It protects funds swept into it, not the everyday wallet.

The verifier mirrors `packages/sdk/src/pqc/hashsig.ts`,
`LamportMerkleVerifier.sol`, and `packages/solana-vault` byte-for-byte
(keccak256), so **one `@pqweave/sdk` key works across EVM, Solana, and Stellar** —
proven by the shared cross-runtime vector in the tests.

## Why Soroban makes this cleaner than the Solana vault

- **Soroban binds the signature to the operation for us.** `__check_auth`
  receives `signature_payload` — the 32-byte hash of the authorized call
  (recipient, amount, token) — and we verify the Lamport signature over exactly
  that. There is no hand-rolled withdrawal digest like the Solana `withdraw`
  path needs.
- **The ~24 KB signature fits in a single transaction** (passed as a `Bytes`
  argument), so there is no chunked `stage_signature` buffer dance.
- **One-time-leaf enforcement** lives in instance storage (`DataKey::Used(leaf)`),
  checked-and-burned inside `__check_auth`. Soroban's per-account nonce tracking
  is a second, protocol-level replay guard on top.

## Interface

| item                 | what it does                                                              |
| -------------------- | ------------------------------------------------------------------------- |
| `__constructor`      | bind the vault to a `pqc_root` (Merkle root) + `tree_height` at deploy    |
| `__check_auth`       | verify a Lamport+Merkle sig over the call payload, burn the one-time leaf |
| `pqc_root` (view)    | the stored post-quantum public key                                        |
| `tree_height` (view) | the Merkle proof depth                                                    |
| `leaf_used` (view)   | whether a given one-time leaf has been spent                              |

Funds (native XLM / classic assets) are held through the Stellar Asset Contract:
a normal wallet pays the vault's `C...` address, and a withdrawal is
`SAC.transfer(from = vault, to = recipient, amount)`, which triggers the vault's
`require_auth` → `__check_auth`.

## Status — what is verified vs pending

Verified here (`cargo test`):

- ✅ Host-compiles cleanly; `__check_auth` runs through the real Soroban `Env`.
- ✅ Verifier matches the canonical cross-runtime vector root byte-for-byte
  (`5d0efe09…c0fe`), so the same SDK key works on Stellar.
- ✅ A valid post-quantum signature authorizes; the one-time leaf is then burned.
- ✅ Replay of a spent leaf is rejected (`LeafAlreadyUsed`).
- ✅ A signature presented against a different payload is rejected
  (`SignatureInvalid`).
- ✅ **CPU budget:** a full verify (256 keccak reveals + leaf commit + Merkle
  path) costs ≈ **3.18M instructions** — about 3.2% of Stellar's 100M
  per-transaction ceiling, leaving ample room for the SAC transfer in the same
  transaction.

Pending: WASM upload to testnet, per-user instance deploy from the web app, the
SAC deposit/withdraw browser flow, key rotation, and an audit before real funds.

## Run

```bash
cargo test                 # host: verifier vectors + __check_auth lifecycle + budget
stellar contract build     # deployable wasm → target/wasm32v1-none/release/pqweave_stellar_vault.wasm
```

Requires the Stellar toolchain: `rustup target add wasm32v1-none` and the
`stellar` CLI (`cargo install --locked stellar-cli` or the Homebrew tap). Tested
with `stellar` 23.x, `soroban-sdk` 23.x, Rust 1.95.

## Toolchain note (ed25519-dalek pin)

`soroban-env-host` 23.0.1 (a test-only dependency behind `soroban-sdk`'s
`testutils`) does not compile against `ed25519-dalek` 3.0.0, which Cargo picks by
default. `Cargo.lock` pins it back to the compatible 2.x:

```bash
cargo update -p ed25519-dalek@3.0.0 --precise 2.2.0
```

Keep `Cargo.lock` committed so the pin survives. This affects only the host test
build; the deployed wasm does not link ed25519-dalek.
