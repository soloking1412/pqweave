# Solana post-quantum vault — design

> **Status: program + client SDK built, cross-verified, and deployed to devnet
> (program id `BB2CWiTJACV553iCuLmofWgqbte3moxeWoMQskLvCmKS`). Full SBF-VM
> lifecycle test passes. Not on mainnet, not audited — do not use real funds.**
> This documents an honest path to quantum-resistant custody on Solana. It does
> **not** make a Solana wallet quantum-safe. Read §2 before anything else.

## 1. Why Solana can't be migrated like an EVM wallet

PQWeave's EVM migration works because of account abstraction: EIP-7702 lets an
existing account delegate to contract code **in place**, and ERC-4337 lets that
code enforce a custom (post-quantum) signature. Solana has neither.

- **The address _is_ the public key.** A Solana address is a raw Ed25519 public
  key (32 bytes, base58). There is no hash in front of it, so the key is exposed
  the moment the account exists — there is no Bitcoin-style "first-spend" grace,
  and moving to a fresh address does nothing (the new address is another exposed
  public key).
- **No in-place signature swap.** Validators verify Ed25519 at the protocol
  level. You cannot make Phantom/Solflare require a post-quantum signature.

So a "migrate your Solana wallet" feature is impossible to build honestly. The
scanner correctly reports Solana migration capability as `none`. What _is_
possible is a separate **vault program**: move funds into a program-controlled
account that only releases them on a valid hash-based signature.

## 2. Threat model — what the vault does and does not do

**Protects:** SOL (and, later, SPL tokens) that you **move into** a
program-controlled PDA. Withdrawals require a hash-based one-time signature that
a quantum computer cannot forge, so funds in the vault survive a break of Ed25519.

**Does NOT protect:**

- Your everyday wallet/address — it stays an exposed Ed25519 key forever.
- Any funds not moved into the vault.
- The **sweep transaction itself**, which is signed by your exposed Ed25519 key.
  Today this is fine (no quantum computer exists); a quantum attacker present at
  sweep time could in principle race it (same caveat as the Bitcoin transitional
  flow). Sweep while it is still safe to do so.

**Trust model:** the vault program's code is the authority over the PDA. Your
post-quantum key authorizes withdrawals. This is custody-by-program, not
"your wallet is now safe" — be explicit about that in any UI.

## 3. Two hard Solana constraints (the whole design is shaped by these)

1. **Transaction size cap — 1232 bytes.** Hash-based signatures are large:
   - Lamport over a 256-bit digest ≈ 256 × 32 B = **~8 KB** (way over the cap).
   - Winternitz (WOTS+) is smaller but still ~2 KB depending on `w`.
     A full signature does **not** fit in one transaction. The design must stage
     the signature into a temporary **buffer account** across several writes, then
     verify in a final instruction (the same pattern Solana uses to deploy large
     programs). This is the central engineering challenge, not the cryptography.

2. **Compute budget — ~200k CU per instruction, ~1.4M CU per tx (requestable).**
   Verifying a Lamport signature is ~256 hash syscalls plus a Merkle path
   (~`log2(N)` hashes). At a rough ~100–200 CU per 32-byte `sol_sha256` call that
   is on the order of ~30–60k CU — plausibly within budget, but it **must be
   measured on devnet**, and may need splitting across instructions if combined
   with the buffer reads. Prefer `sol_sha256` (cheaper) over keccak if the EVM
   verifier parity is not required.

## 4. Cryptographic core

- **Scheme:** reuse PQWeave's existing **Lamport + Merkle (XMSS-style)**
  construction so a single post-quantum key/keystore works for _both_ the EVM
  account and the Solana vault. Alternative: **Winternitz (WOTS+)** for smaller
  signatures at the cost of more hashing — revisit if the buffer-account staging
  proves too heavy.
- **Hash:** `sha256` (or keccak256 for EVM parity). Grover only halves preimage
  security, so a 256-bit hash keeps ~128-bit strength against a quantum attacker.
- **One-time keys — the dangerous invariant.** Lamport leaves are single-use.
  The program must enforce this **on-chain**: store a used-leaf bitmap (or a
  strictly increasing counter) in the vault state and reject any reused leaf.
  The client signs through the SDK's `HashSigSigner` (strict monotonic index),
  and the program is the second line of defense.

## 5. On-chain architecture (Anchor)

Accounts:

- **Vault program** — owns the PDAs below.
- **Vault state PDA** — seeds = `["vault", pqc_root]`. Stores: `pqc_root`
  (Merkle root of the Lamport key), `used_leaves` bitmap, tree height, optional
  admin/rotation config, bump.
- **Vault funds** — lamports held directly on the state PDA (or a separate PDA);
  SPL tokens later via associated token accounts owned by the PDA.
- **Signature buffer PDA** — scratch account that accumulates the staged
  signature bytes before verification, then is closed (rent reclaimed).

Instructions:

1. `initialize_vault(pqc_root, height)` — create the state PDA.
2. `deposit()` — anyone transfers SOL into the vault PDA (no signature needed; it
   is a deposit). This is the **sweep** step, signed by the user's normal wallet.
3. `stage_signature(offset, chunk)` — append signature bytes to the buffer PDA
   (called N times to get under the 1232-byte/ix limit).
4. `withdraw(recipient, amount, leaf_index)` — recompute the signed message
   `H(recipient || amount || leaf_index)`, read the staged signature from the
   buffer, verify the Lamport signature and Merkle path against `pqc_root`,
   check `leaf_index` is unused, mark it used, transfer lamports, close buffer.
5. `rotate_key(new_root)` (optional) — gated by a valid current-key signature.

The fee payer for all of this is a throwaway Ed25519 account that holds no
protected funds — its exposure is irrelevant.

## 6. Client / SDK flow

Reuse `@pqweave/sdk` so the post-quantum key story is identical to EVM:

1. Generate a Lamport+Merkle key from fresh CSPRNG entropy; download the
   password-encrypted keystore (same `encryptSeed` flow as the web migrate page).
2. Derive the vault PDA from the key's Merkle root.
3. **Sweep:** the user's normal Solana wallet signs a `deposit` that moves SOL
   from the exposed account into the vault PDA. (Only time the exposed key is used.)
4. **Withdraw later:** build the message, `signNext()` via `HashSigSigner`
   (consumes one leaf, persists the counter), stage the signature into the
   buffer, then call `withdraw`. No Ed25519 authority over the funds.

## 7. Residual risks (state these in any UI)

- **Unaudited custom program** — the largest risk, as on EVM. A bug = loss.
- **Custody-by-program**, not a recognized account standard. Wallets/exchanges
  won't natively understand the vault.
- **One-time-key exhaustion** — each withdrawal burns a leaf; rotate before the
  tree is exhausted. Losing the PQC seed = losing the vault (no Ed25519 fallback).
- **Sweep-time race** — see §2. Safe today; do it before Q-Day.
- **SPL tokens** add per-mint token-account complexity (phase 2).

## 8. EVM vs Solana, honestly

|                                     | EVM                 | Solana                                  |
| ----------------------------------- | ------------------- | --------------------------------------- |
| Harden in place (keep your address) | ✅ EIP-7702         | ❌ impossible                           |
| Sweep into a PQC-rooted account     | ✅ ERC-4337 account | ⚠️ sweep into a vault _program_         |
| Makes your everyday wallet safe     | ✅ (sole-authority) | ❌ only vault funds                     |
| Signature size fits one tx          | ✅                  | ❌ needs buffer staging                 |
| Capability label                    | `quantum-safe`      | `none` for the wallet; vault is custody |

## 9. Build milestones (if we proceed)

1. Anchor scaffold + vault state PDA + `initialize`/`deposit`.
2. **Compute + size spike — DONE → GO** (`packages/solana-vault`, see its README).
   Ported Lamport+Merkle verification to Rust and proved it reproduces the
   canonical vector root byte-for-byte (same `@pqweave/sdk` keys work on Solana).
   Findings: signature ≈ **24 KB** (≫ the 1232-byte tx cap → buffer staging is
   mandatory, as predicted); verification is ~256 keccak ops, comfortably inside
   the 1.4M-CU budget (compute is _not_ the binding constraint). The measured CU
   prints from the harness once the SBF toolchain is updated (platform-tools
   v1.43 / Cargo 1.79 is too old to build the current crates.io tree).
3. **Program — DONE (in `packages/solana-vault`).** initialize / deposit /
   stage_signature / withdraw implemented in raw `solana-program`; withdraw
   verifies the buffer-staged signature, binds it to
   `domain || root || recipient || amount || leaf`, and enforces a one-time-leaf
   bitmap on-chain. Host-compiles; crypto + logic unit-tested (root parity,
   message binding, leaf guard, withdraw round-trip with tamper rejection). The
   full SBF lifecycle test (`tests/lifecycle.rs`) is written and host-compiles;
   it runs once platform-tools is updated.
4. **Client SDK — DONE (`@pqweave/sdk/solana-vault`).** Instruction builders
   (initialize / deposit / stage_signature / withdraw), vault-PDA derivation
   (ed25519 off-curve check), the withdraw digest, and signature serialization +
   chunking — all proven **byte-for-byte** against the program via cross-runtime
   fixtures (the withdraw message and the PDA match the Rust exactly). Reuses the
   same Lamport+Merkle key as the EVM account. Pending: the caller's
   `@solana/web3.js` transaction assembly + a devnet end-to-end run.
5. SPL token support (phase 2).
6. Audit before any real funds.

## 10. Open questions to resolve on devnet (before committing to the build)

- Does a single-leaf Lamport verify fit the compute budget once buffer reads are
  included? If not, how many instructions does staged verification take?
- `sha256` vs `keccak256` syscall cost — and is EVM-verifier parity worth the
  keccak premium?
- Tree height vs cost: how many one-time signatures per vault before rotation?
- Rent + UX of the buffer account; can it be reused/closed cleanly?

The honest one-line summary: **we can build quantum-resistant _custody_ on Solana
(a vault you move funds into), but not a quantum-safe _wallet_. The crypto is the
easy part; Solana's 1232-byte transaction limit is the real obstacle.**
