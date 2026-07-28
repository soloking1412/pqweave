# Security model

This document is deliberately honest about what PQWeave does and does not
protect against. Read it before trusting it with real funds.

> **Status: unaudited.** The contracts and the post-quantum verifier are custom
> code that has not had an independent security audit. Do not secure real funds
> with it yet. Use testnets.

## What it defends against

A quantum computer running Shor's algorithm can derive an ECDSA private key from
the public key it exposes. Every EVM account reveals its public key the moment it
sends a transaction, so funds are harvestable today ("harvest now, decrypt
later") and spendable once a sufficient quantum computer exists. PQWeave
moves the authority for spending behind a **post-quantum signature** that such a
computer cannot forge.

## The cryptographic basis

The default verifier is **hash-based** (Lamport one-time signatures inside a
Merkle tree, an XMSS-style construction). Its security rests only on the preimage
and collision resistance of keccak256:

- Shor's algorithm does not break hash functions.
- Grover's algorithm only halves the security level, so keccak256 keeps roughly
  128-bit strength against a quantum attacker.

There is no lattice or discrete-log assumption. The scheme is also pluggable
(`IPQCVerifier`), so NIST lattice verifiers (Falcon, ML-DSA) can be swapped in.

## Security levels (choose per account)

| Mode                                      | ECDSA       | Post-quantum       | Use for                      |
| ----------------------------------------- | ----------- | ------------------ | ---------------------------- |
| Hybrid (default)                          | routine ops | sensitive ops only | daily wallets                |
| `pqcOnly`                                 | every op    | every op           | high-value wallets           |
| **Sole authority** (`owner = address(0)`) | **never**   | **every op**       | vaults / true quantum safety |

**Sole authority is the only fully quantum-safe configuration**: the ECDSA key is
removed from the trust model entirely, so a quantum break of it grants nothing.
The web migration flow defaults to this mode.

## Two things that are easy to get wrong (and how we handle them)

1. **The post-quantum key must be independent of the ECDSA key.** If you derived
   it from a wallet signature, a quantum attacker who broke the ECDSA key could
   reproduce that signature and re-derive the post-quantum key — defeating the
   point. PQWeave generates the key from fresh CSPRNG entropy and requires
   you to back it up. There is no free lunch: true quantum safety means holding a
   new, independent secret.
2. **One-time keys must never be reused.** Signing two different messages with the
   same Lamport leaf breaks the scheme, and that can happen off-chain where the
   on-chain reuse-guard cannot help. The SDK's `HashSigSigner` makes this
   impossible by construction: it hands out a strictly increasing leaf index,
   never repeats one, refuses to sign once exhausted, and persists its counter so
   leaves are not reused across sessions. Always sign through it (not the
   low-level `signHashSig`) and persist `serialize()` after each signature.
3. **One-time keys are exhaustible.** Each authorization consumes one leaf; rotate
   (`rotatePqcKey`) before the tree is exhausted. In sole-authority mode, losing
   the post-quantum seed means losing the account — there is no ECDSA fallback.

## Residual risks — what is NOT solved

- **No audit / no battle-testing.** Custom account + custom verifier is exactly
  where implementation bugs live. This cannot be fixed by writing more code.
- **EIP-7702 "harden in place" is transitional — the re-delegation attack.**
  A 7702 delegation is always revocable by the underlying ECDSA key: a new
  type-4 authorization signed by that key replaces the delegated code, no
  matter what the delegated contract says. So a quantum attacker who recovers
  the ECDSA key can strip the post-quantum guard from a hardened address and
  drain it. No application code can close this; it is protocol-level. Real
  safety requires _migrating_ funds to a sole-authority account, not hardening
  the old address.
- **The Forwarder ("mailbox") shrinks the exposure window; it does not close
  it.** Keeping an old address as a receiving point means incoming funds sit on
  a quantum-exposed key until the next `flush()` — minutes instead of forever,
  but not zero. The same re-delegation caveat applies to the mailbox itself.
  Its one PQC-gated control (`setDestination`) means the ECDSA key cannot
  quietly retarget forwarding, but a re-delegation can remove the mailbox
  entirely. The mailbox deliberately has no PQC root rotation in v1: the
  destination change is rare (64 one-time leaves are ample), and the ECDSA
  re-install path remains as the fallback — consistent with the mailbox's
  transitional trust model.
- **Exchanges and contract addresses.** Some exchanges refuse withdrawals to
  smart-contract addresses, or send them with a fixed gas stipend. The
  Forwarder's `receive()` is deliberately empty so stipend-limited transfers
  succeed, but users should always test with a small withdrawal first.
- **Bitcoin is not, and cannot be, quantum-safe at the app layer.** Bitcoin
  Script cannot verify a post-quantum signature, so nothing PQWeave ships makes
  bitcoin quantum-safe. The real fix is consensus-level (BIP-360 P2MR / BIP-361
  legacy-signature sunset), which no application can deliver. The Bitcoin tools
  here are explicitly transitional / preparatory:
  - **Evacuation kit** — pre-signs sweep transactions (watch-only; the user
    signs in their own wallet, keys never touch us) so funds can move within
    minutes of a threat. Pre-signing exposes nothing, but broadcasting still
    reveals the key and races the mempool. It only covers the UTXOs that existed
    when it was built; already-exposed addresses gain little. Reaction-time
    reduction, not a cure.
    - **An unsignable escape hatch is worse than none**, because the failure
      surfaces at the moment it is needed. Each PSBT input therefore carries
      exactly what its script type requires — `nonWitnessUtxo` for legacy and
      wrapped SegWit, `redeemScript` for wrapped SegWit, `tapInternalKey` for
      Taproot, and `bip32Derivation` (master fingerprint + full path) so a
      hardware wallet can match the input to one of its own keys. An input that
      cannot be made signable is **rejected outright** rather than emitted.
      Every script type is signed and finalized for real in the test suite.
    - **Destination rails.** A sweep to an address that has already been spent
      from lands the funds somewhere already exposed, so the destination is
      checked on-chain and refused if used, refused if it is one of the source
      addresses, and flagged if it is Taproot (a P2TR output publishes the key
      the moment it is funded). If the indexer is unreachable the check degrades
      to a warning — an outage must not block an emergency evacuation.
    - **Dry run before signing.** `describePsbt` decodes the bundle and states
      what it actually does (inputs, destination, amount, fee, RBF, change), and
      `verifySweepMatchesPlan` asserts it matches the tier it claims to be. Read
      it rather than trusting that we built it correctly.
  - **PQ attestation** — anchors a Bitcoin-address ↔ post-quantum-key binding as
    an immutable on-chain event. The Bitcoin signature is verified off-chain
    (BIP-322 on-chain is infeasible); the contract only timestamps. It records
    intent and ownership and prepares for a future migration path — it does not
    protect the coins.
  - **xpub cockpit / wallet scan** — watch-only; an extended _public_ key only.
    It can read a wallet's exposure, never spend. Scans whole wallets across
    accounts with a real BIP-44 gap limit, is resumable via a cursor so an
    interrupted run over hundreds of addresses continues rather than restarting,
    and backs off on indexer rate limits. An address whose lookup fails is
    reported as an error and does **not** end a gap run, so a transient failure
    cannot silently truncate a wallet and under-report exposure.
  - **Exposure reporting** — per-account rollups of exposed vs not-yet-exposed
    balance, exportable as JSON or CSV. The classification rules ship with the
    figures (`METHODOLOGY`), because an exposure number nobody can check
    independently is worth very little.
- **Solana and Stellar cannot be migrated in place — the vault is custody, not a
  wallet fix.** On these chains the address _is_ the Ed25519 public key, exposed
  from creation, so `migrationCapability` is `none` and nothing hardens the
  existing account. PQWeave offers a **vault**: a Solana program / Stellar Soroban
  custom account that releases funds only against a Lamport+Merkle post-quantum
  signature. You **sweep funds into a new account**; the old key stays exposed
  forever, only the swept funds are protected, and the sweep itself is signed by
  the still-exposed Ed25519 key (a quantum attacker present at sweep time could
  race it). The Stellar vault is on **testnet and unaudited**; the Solana vault on
  devnet. This is transitional custody, not a quantum-safe wallet.
- **Hybrid mode is defense-in-depth, not absolute.** Sub-threshold operations are
  still ECDSA-authorized. Use `pqcOnly` or sole authority for full coverage.
- **Timeline is a projection.** "Q-Day" estimates (2029–2030) are forecasts, not
  facts. The concrete present risk is exposed keys being harvested.
- **No novel cryptography.** Security equals the strength of keccak256 plus the
  correctness of this implementation. The former is strong; the latter is
  unproven until audited.

## What "ready for real funds" requires

1. One or more independent security audits, ideally with formal verification of
   the verifier.
2. A public bug bounty and time running in production with bounded value.
3. Standardization (an ERC) so the wider ecosystem reviews the design, on the path
   to native protocol-level post-quantum support.

## Reporting

Found a vulnerability? Email security@pqweave.com rather than opening a
public issue.
