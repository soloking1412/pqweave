# pqweave-vault — Solana post-quantum vault

The Solana counterpart to the EVM PQWeave account (see `../../SOLANA_VAULT.md`).
**Deployed to devnet, not audited. Do not use with real funds.**

Devnet program id: `BB2CWiTJACV553iCuLmofWgqbte3moxeWoMQskLvCmKS`
([explorer](https://explorer.solana.com/address/BB2CWiTJACV553iCuLmofWgqbte3moxeWoMQskLvCmKS?cluster=devnet)).

This does **not** make a Solana wallet quantum-safe — Solana's address _is_ its
Ed25519 public key and cannot be hardened in place. The vault is a program-owned
PDA that holds funds and releases them only against a valid hash-based
(Lamport + Merkle) one-time signature, which a quantum computer cannot forge. It
protects funds moved into the vault, not the everyday wallet.

The verifier mirrors `packages/sdk/src/pqc/hashsig.ts` and
`LamportMerkleVerifier.sol` byte-for-byte (keccak256), so **one `@pqweave/sdk`
key works for both the EVM account and this vault** — proven in the tests.

## Instructions

| tag | instruction       | what it does                                                     |
| --- | ----------------- | ---------------------------------------------------------------- |
| 0   | `initialize`      | create the vault state PDA (`["vault", pqc_root]`)               |
| 1   | `deposit`         | move SOL into the vault PDA (the sweep)                          |
| 2   | `stage_signature` | upload the ~24 KB signature into a buffer account, in chunks     |
| 3   | `withdraw`        | verify the staged signature, burn the one-time leaf, release SOL |

`withdraw` binds the signed message to `domain || pqc_root || recipient ||
amount || leaf_index`, so a signature cannot be replayed for a different
transfer, and the on-chain used-leaf bitmap rejects any reused one-time key.

## Status — what is verified vs pending

Verified here (`cargo build`, `cargo test --lib`):

- ✅ Host-compiles cleanly.
- ✅ Verifier matches the canonical cross-runtime vector root byte-for-byte
  (same SDK keys work on Solana).
- ✅ `withdraw_message` binds recipient, amount, and leaf (tamper → reject).
- ✅ One-time-leaf bitmap guard (set/clear/reuse).
- ✅ A client withdraw signature round-trips through the on-chain `verify`, and a
  tampered amount is rejected.

Now verified through the SBF VM (with the toolchain + pins below):

- ✅ SBF build produces a deployable `pqweave_vault.so` (~88 KB).
- ✅ `tests/lifecycle.rs` — full initialize → deposit → withdraw → replay-rejected
  integration through the real SBF VM.
- ✅ Deployed and live on devnet (program id above).

## Run

```bash
cargo build                       # host compile
cargo test --lib -- --nocapture   # crypto + logic
cargo build-sbf                   # deployable .so → target/deploy/pqweave_vault.so
SBF_OUT_DIR=target/deploy cargo test --test lifecycle   # full SBF-VM lifecycle
```

## Toolchain note (edition2024 / Cargo-version gap)

platform-tools v1.43 (agave 2.2, Cargo 1.79) could not parse the `edition2024`
crates in Solana's dependency tree. Upgrading with `agave-install init 2.3.0`
gives platform-tools v1.48 (Cargo **1.84**) — still one release short of
stabilized `edition2024` (needs 1.85+). The fix is to pin the offending
transitive crates down to their last pre-`edition2024` versions in `Cargo.lock`:

```bash
agave-install init 2.3.0
cargo update -p blake3 --precise 1.5.5          # avoids digest 0.11 / block-buffer 0.12
cargo update -p zeroize@1.9.0 --precise 1.8.1
cargo update -p proc-macro-crate@3.5.0 --precise 3.2.0   # avoids toml_edit 0.25 / toml_datetime 1.1
cargo update -p indexmap@2.14.0 --precise 2.6.0
cargo build-sbf
```

A host `cargo test` (system Cargo ≥1.85) may re-bump some of these; re-run the
pins before `cargo build-sbf`. The clean fix is platform-tools with Cargo ≥1.85.

## Remaining work

`stage_signature` client SDK is done (`@pqweave/sdk/solana-vault`). Still open:
in-browser wallet-adapter deposit/withdraw demo, SPL-token vaults, key rotation,
buffer-account rent reclaim, mainnet, and an audit before real funds.
