# Security model

This document is deliberately honest about what PQWeave does and does not
protect against. Read it before trusting it with real funds.

> **Status: unaudited.** The contracts and the post-quantum verifier are custom
> code that has not had an independent security audit. Do not secure real funds
> with it yet. Use testnets.

The [25 September implementation self-audit](docs/SELF_AUDIT_2026-09-25.md) records
confirmed findings, fixes and test evidence. Independent review is still required.

## Threat and protection boundary

A sufficiently capable fault-tolerant quantum computer could recover ECDSA keys
from exposed public keys. EOA transaction signatures reveal enough information
to recover the public key. This is a future authorization risk, not decryption
of coins or rewriting past transactions. See the [Ethereum Foundation PQ team's
assessment](https://pq.ethereum.org/).

A factory-created account with no ECDSA owner can require the experimental
post-quantum verifier for authorization. This does not protect Ethereum
consensus, bridges, token administrator keys or compromised client devices.
Mainnet execution in the website is disabled. Review the [Ethereum research and
release gates](docs/ETHEREUM_RESEARCH_2026.md).

## The cryptographic basis

The custom Lamport/Merkle and Winternitz/Merkle verifiers use Keccak hashing
rather than an elliptic-curve signature check. They are experimental constructions,
not NIST-approved XMSS, LMS or SLH-DSA implementations. Generic quantum hash
attack estimates are not a proof of the security level of these complete schemes.
Independent cryptographic analysis is required. The verifier interface permits
future alternatives, but it does not make an arbitrary replacement safe.

### Two hash-based verifiers

A second verifier, **custom Winternitz + Merkle**, ships alongside the Lamport
one. Same assumption, same keccak256, much cheaper: it derives the one-time
public key by finishing each hash chain instead of transmitting it, so the
signature is 2,304 bytes rather than 24,736.

| Verifier   | Signature | Calldata gas | Execution gas | Total       |
| ---------- | --------- | ------------ | ------------- | ----------- |
| Lamport    | 24,736 B  | 393,496      | 276,566       | **670,062** |
| Winternitz | 2,304 B   | 35,664       | 218,554       | **254,218** |

Measured at tree depth 2 by `VerifierGas.t.sol`, so the figures can be
reproduced rather than taken on trust.

These are historical verifier microbenchmarks, not wallet transaction fee
quotes. Full UserOperation calldata, prefunding, chain fee rules, tree depth
and token execution affect actual cost.

One-time-key reuse is unsafe for both schemes. The in-memory signers only
advance within one instance. Use `DurablePqcSigner` with a trusted reservation
store; never treat serialization or an on-chain bitmap as proof that a leaf
has not been exposed off-chain.

Verifiers require canonical ABI encodings, a Merkle proof depth of at most 12,
and a leaf index strictly inside that tree. The SDK applies the same bounds.
Use a new independent seed for each authority, scheme and tree configuration.

## Security levels (choose per account)

| Mode                                      | ECDSA       | Post-quantum       | Use for                     |
| ----------------------------------------- | ----------- | ------------------ | --------------------------- |
| Hybrid (default)                          | routine ops | sensitive ops only | daily wallets               |
| `pqcOnly`                                 | every op    | every op           | high-value wallets          |
| **Sole authority** (`owner = address(0)`) | **never**   | **every op**       | experimental sole authority |

The web prototype defaults to sole authority in a separate account. An EIP-7702
EOA still retains protocol-level ECDSA authority even if its delegated contract
sets `owner` to zero.

## Signing and recovery requirements

1. **The post-quantum key must be independent of the ECDSA key.** If you derived
   it from a wallet signature, a quantum attacker who broke the ECDSA key could
   reproduce that signature and re-derive the post-quantum key — defeating the
   point. PQWeave generates fresh CSPRNG entropy. Use a unique seed for every
   authority, scheme and tree; keep both its encrypted backup and complete
   reservation history.
2. **One-time keys must never be reused.** Signing two different messages with the
   same Lamport leaf breaks the scheme, and that can happen off-chain where the
   on-chain reuse-guard cannot help. Persist a monotonic reservation BEFORE
   signing, using one shared authority journal. The file-backed Node adapter
   synchronizes writes, rejects concurrent locks and fails closed on uncertain
   state. It does not prevent disk rollback or uncoordinated copies on another
   device. Seed-only and chain-only recovery are insufficient. Never initialize
   a fresh journal for a key that has previously signed.
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
  drain it. A separate sole-authority account removes that fallback, subject
  to its verifier and remaining infrastructure assumptions.
- **The Forwarder ("mailbox") shrinks the exposure window; it does not close
  it.** Keeping an old address as a receiving point means incoming funds sit on
  a quantum-exposed key until a successful `flush()`. There is no guaranteed
  maximum waiting time. The same re-delegation caveat applies to the mailbox itself.
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
- **Bitcoin standard-wallet preparation is not post-quantum signing.** QSB was
  demonstrated under existing consensus in August 2026; it remains an experimental
  miner-assisted construction with a different security and recovery model.
  See [the current Bitcoin research](docs/BITCOIN_RESEARCH_2026.md).
  - **Preparation kit:** unsigned plans, no custody, no hosted broadcast. Every
    input includes its verified full funding transaction, even native SegWit.
    Single-key P2PKH, P2WPKH, wrapped P2WPKH and key-only P2TR inputs are supported.
    Public key and origin data must match the source. The signer must independently
    verify destination, amounts, fees, network and signatures.
  - **Strict destination policy:** fresh P2WPKH only, no self transfer, no used
    destination. Missing confirmed or mempool history blocks signing/export in the
    website. A successful indexer lookup cannot establish wallet ownership or
    rule out public keys leaked elsewhere.
  - **Limits:** 100 inputs; fees at most 100,000 sats and 5% of balance; confirmed
    coins only; plans expire after 24 hours and must be rechecked before export.
    Inscriptions, Runes, multisig and custom scripts need separate wallet review.
    No automatic consolidation or automatic emergency broadcast.
  - **Restore and review:** a versioned unsigned bundle rebuilds all PSBTs and
    checks its checksum. The checksum detects edits but does not authenticate its
    author. Never sign a file solely because the checksum passes. PSBT comparison
    checks the exact unsigned transaction and funding data; it is not signature
    verification. Bitcoin Core integration tests validate real signatures,
    replacement, confirmation and destination spending on isolated regtest.
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
  - **BIP-360 (P2MR) migration tooling** — built now so it is tested before it is
    urgent, **not** because it can be used today. BIP-360 is `Status: Draft` and
    the supported public networks do not enforce its rules. Under BIP-141 forward compatibility, witness
    versions 2–16 are **anyone-can-spend**, and P2MR is witness version 2 — so
    coins sent to a `bc1z…` address right now could be taken by anybody and never
    recovered. The library therefore **refuses** a mainnet P2MR migration outright
    rather than warning about it, requires an explicit acknowledgement even on
    test networks, marks a mainnet `bc1z` destination `unsafe`, and throws if you
    try to sweep _from_ a P2MR output (the supported public networks do not enforce P2MR spending rules). It ships
    no post-quantum leaf templates, because BIP-360 defines no PQ signature
    opcodes yet — those come in a companion BIP, and inventing them would be
    fiction. See `packages/sdk/BIP360.md`.
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
  to addresses without code and with empty calldata are still ECDSA-authorized.
  Contract calls, all nonempty calldata and native batches whose combined value
  reaches the threshold require PQ authorization. The threshold is per operation,
  not a daily spending cap: repeated small transfers remain possible. Use
  `pqcOnly` or sole authority for full coverage.
- **Timeline is uncertain.** Forecasts are not evidence of a cryptographically
  relevant quantum computer. Migration design and operational preparation can
  proceed without claiming an imminent break.
- **Custom cryptography.** Familiar components do not establish the security of
  a new construction, encoding, state machine or implementation. All need review.

## What "ready for real funds" requires

1. Complete signer-state recovery, rotation and disaster-recovery drills.
2. Reviewed deployment manifests, supported wallet tests, token reconciliation
   and dependency remediation.
3. One or more independent security audits, ideally with formal verification of
   the verifier.
4. A public bug bounty and time running in production with bounded value.
5. Standardization (an ERC) so the wider ecosystem reviews the design, on the path
   to native protocol-level post-quantum support.

## Reporting

Found a vulnerability? Email security@pqweave.com rather than opening a
public issue.
