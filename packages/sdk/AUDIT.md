# Bitcoin money path — audit scope

Prepared for an external security review of the PQWeave Bitcoin tooling. The
goal of this document is to let a firm quote accurately and spend its time on
the things we cannot find ourselves.

**Nothing in this repository has been audited.** This document is preparation
for that review, not a substitute for it, and no part of it should be read as a
security assurance.

---

## 1. What this software does

Watch-only Bitcoin tooling for reducing and tracking quantum exposure. It never
receives, derives, or stores a private key. It:

- classifies an address's exposure (has the public key been published?),
- scans whole wallets from extended **public** keys,
- builds unsigned PSBTs that sweep UTXOs to a fresh destination, which the user
  signs in their own wallet or on an air-gapped device,
- builds BIP-360 (P2MR) outputs, blocked on mainnet until that BIP activates.

The threat it exists to reduce: a quantum computer running Shor's algorithm can
derive a private key from an exposed public key. Bitcoin cannot be made
quantum-safe at the application layer, so this is preparation, not a cure.

---

## 2. Scope

### In scope — the money path

A bug in these files costs someone funds. This is the code we are asking to have
reviewed.

| File                            | LOC | Why it is money-critical                                                                             |
| ------------------------------- | --- | ---------------------------------------------------------------------------------------------------- |
| `src/bitcoin/evacuation.ts`     | 366 | PSBT construction, fee/vsize maths, dust handling, RBF, per-type signing data                        |
| `src/bitcoin/hd.ts`             | 214 | Extended-key parsing and address derivation; an error sweeps to an address the user does not control |
| `src/bitcoin/p2mr-migration.ts` | 218 | BIP-360 migration and the mainnet activation guard                                                   |
| `src/bitcoin/verify.ts`         | 235 | Pre-signing dry run; if it misreports, a user approves the wrong transaction                         |
| `src/bitcoin/p2mr.ts`           | 252 | P2MR address/script/Merkle-tree construction, incl. the depth-0 refusal                              |
| `src/bitcoin/safety.ts`         | 129 | Destination rails (used / self / P2MR-on-mainnet)                                                    |
| `src/bitcoin/address.ts`        | 59  | Address classification; drives every downstream decision                                             |

**Total in scope: ~1,473 LOC** of TypeScript, no external services, no key
handling.

### Also in scope — the post-quantum signature schemes

Not Bitcoin code, but the same "a bug here costs funds" test applies: these
authorize spends from a PQWeave account. A reviewer with hash-based signature
experience should take them; a Bitcoin/PSBT specialist reasonably would not.

| File                                                   | LOC | Why it is money-critical                                               |
| ------------------------------------------------------ | --- | ---------------------------------------------------------------------- |
| `src/pqc/winternitz.ts`                                | 334 | WOTS+ signing/verification; must agree byte-for-byte with the contract |
| `contracts/src/verifiers/WinternitzMerkleVerifier.sol` | 115 | The on-chain gate; a flaw here forges authorization                    |
| `src/pqc/hashsig.ts`                                   | 250 | The Lamport scheme the above replaces, still deployed                  |

The single most dangerous invariant in the whole repository is that a one-time
key signs **once**. Winternitz makes reuse worse than Lamport does: revealing a
signature for a lower digit exposes every chain step above it, so two signatures
under one leaf leak substantially more than two Lamport signatures would.
`WinternitzSigner` is the only intended entry point and is strictly monotonic.

### Supporting, lower priority

`esplora.ts` (HTTP client, retry/backoff), `wallet-scan.ts` (gap-limit scanning),
`report.ts` (rollups, CSV/JSON export), `scanner.ts` (risk scoring). A bug here
misreports exposure — serious, but it does not directly move coins.

### Explicitly out of scope

- The EVM contracts, Solana vault, and Stellar vault (separate codebases).
- The Next.js web application, except where it calls the money path.
- `@scure/btc-signer`, `@scure/bip32`, `@scure/base`, `@noble/*` — audited
  upstream libraries we depend on rather than reimplement.
- Anything requiring a private key. There is no signing code here by design.

---

## 3. Threat model

**Assets.** The user's UTXOs, and the accuracy of the exposure figures an
institution acts on.

**Trust boundaries.**

1. **The user's wallet / hardware device.** We produce unsigned PSBTs; the device
   is the only thing that holds a key. We must never produce a PSBT that
   misrepresents what it does.
2. **The Esplora indexer (third party).** It supplies UTXOs, address stats, and
   previous transactions. **We treat it as untrusted for correctness**: a hostile
   or buggy indexer should not be able to make us build a transaction that loses
   funds. Reviewing this assumption is a priority.
3. **The browser.** Extended public keys are entered client-side. A same-origin
   proxy forwards only derived addresses and txids upstream.

**Attackers we care about.**

- A malicious indexer returning forged UTXOs, wrong amounts, or a previous
  transaction that does not match the input being spent (fee-inflation attack).
- A user pasting a destination they do not control, or one that is already used.
- A stored evacuation bundle being tampered with between creation and broadcast.
- Anyone exploiting the fact that witness v2 outputs are currently
  anyone-can-spend.

**Explicitly not defended against.** A compromised user device; a quantum
attacker who is already able to forge signatures at broadcast time; consensus
changes.

---

## 4. Invariants

These are asserted by property-based tests over generated inputs, not just
examples. They are the claims we would like independently challenged.

**Value conservation**

- `sum(inputs) − fee === output`, exactly, for every sweep.
- A sweep has exactly **one** output and no change.
- `fee === ceil(vsize × feeRate)`.
- A higher fee rate never produces a larger output.

**Dust and viability**

- No output is ever emitted at or below 546 sats.
- A fee tier is skipped **exactly** when it would be dust or negative.

**PSBT correctness**

- Every input carries the fields its script type requires: `nonWitnessUtxo` for
  legacy and wrapped SegWit, `redeemScript` for wrapped SegWit, `tapInternalKey`
  for Taproot, `bip32Derivation` when a key origin is supplied.
- `nonWitnessUtxo` hashes to the input's txid.
- The declared derivation path really derives the declared pubkey, and that
  pubkey reconstructs the script being spent.
- Every input opts into RBF (`sequence = 0xfffffffd`).
- PSBTs round-trip through BIP-174 serialization byte-identically.
- An input that cannot be made signable **throws**; it is never emitted.

**Derivation**

- Derivation is deterministic; distinct indices never collide; receive never
  equals change.
- The full path is `accountPrefix ++ [chain, index]`.
- `parse ∘ format` is the identity; malformed paths throw rather than silently
  yielding a partial path.

**Scanning and reporting**

- The gap-limit scan finds every used address reachable before a run of
  `gapLimit` unused ones, and always terminates.
- `exposedSats + unexposedSats === totalSats`; per-account rollups sum to the
  wallet totals.
- CSV fields containing delimiters are quoted; satoshis are written as integers.

**BIP-360 activation guard and tree shape**

- A mainnet P2MR migration **always throws**, regardless of inputs or
  acknowledgement flag.
- Omitting the target defaults to mainnet, so the failure mode is safe.
- Non-mainnet targets still require an explicit acknowledgement.
- A script tree of fewer than two leaves **always throws**. BIP-360 treats a
  depth-0 tree as anyone-can-spend ("If m = 0, succeed immediately"), so every
  leaf must have a non-empty Merkle path.

**Winternitz signatures**

- A signature verifies on chain if and only if it verifies in the SDK; the two
  implementations agree byte for byte (asserted against a shared vector).
- Altering any single chain value invalidates the signature.
- Advancing a message chain without correcting the checksum invalidates it —
  this is the forgery barrier, and it is fuzzed, not assumed.
- Relabelling a signature with a different leaf index invalidates it, because
  the chain tweaks are per-leaf.
- `WinternitzSigner` never returns the same leaf index twice, and throws rather
  than wrapping when the tree is exhausted.

---

## 5. Test coverage

299 tests total; **154 across 11 Bitcoin files**, of which **38 are
property-based** across 3 files, generating several thousand cases per run, plus
**24 covering the Winternitz scheme** in the SDK and 10 more (4 fuzzed) on chain.

| File                                | What it covers                                            |
| ----------------------------------- | --------------------------------------------------------- |
| `bitcoin-signing.test.ts`           | Real sign-and-finalize for p2pkh, p2wpkh, p2sh, p2tr      |
| `bitcoin-psbt-compliance.test.ts`   | What a hardware wallet verifies before signing            |
| `bitcoin-properties.test.ts`        | Fee, dust, conservation, PSBT structure (generated)       |
| `bitcoin-properties-wallet.test.ts` | Derivation, gap limit, report arithmetic, CSV (generated) |
| `bitcoin-properties-p2mr.test.ts`   | P2MR construction and the activation guard (generated)    |
| `bitcoin-safety.test.ts`            | Destination rails and the dry run                         |
| `bitcoin-p2mr.test.ts`              | BIP-360 wire format against the BIP's published vector    |
| `bitcoin-wallet-scan.test.ts`       | Gap limit, cursor resume, rate-limit retry                |
| `bitcoin-tools.test.ts`             | BIP-84 vector, fee tiers, sweep basics                    |
| `bitcoin.test.ts`                   | Address classification and exposure scoring               |
| `bitcoin-bip361.test.ts`            | Signature-sunset scope, the two clocks, wallet rollups    |
| `winternitz.test.ts`                | WOTS+ signing, tampering, one-time enforcement            |

### Known gaps we would like the review to cover

1. **No physical hardware-wallet test.** PSBT fields are verified
   programmatically against what devices check, but nothing has been signed on a
   real Coldcard, Trezor, or Ledger.
2. **Hostile-indexer testing is thin.** We handle the indexer being _down_. We do
   not systematically test it being _lying_.
3. **No differential testing** against Bitcoin Core or another PSBT
   implementation.
4. **P2MR cannot be exercised end to end anywhere**, because no network
   implements BIP-360.
5. Fee estimation assumes single-sig inputs; multisig vsize would be understated.

---

## 6. Findings already fixed

Reported here so the review does not re-derive them, and because they indicate
where bugs have historically lived.

| Issue                                                                                                                                                                                                                                                                                                                                                                   | Severity | How found                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| Sweep PSBTs carried only `witnessUtxo`, making **legacy (P2PKH) inputs unsignable** — in-process signing with the correct key returned "No inputs signed". No input carried `bip32Derivation`, so no hardware wallet could sign any type. Reused P2PKH is the quantum-exposed case, so the escape hatch was broken exactly where it mattered.                           | Critical | Manual review; the test suite missed it by only ever signing p2wpkh |
| Destination freshness was a code comment with nothing enforcing it; a sweep could land funds on an already-exposed address.                                                                                                                                                                                                                                             | High     | Manual review                                                       |
| `parseDerivationPath("m/ ")` returned an empty path instead of throwing, silently dropping the account prefix from `bip32Derivation`. The device would refuse to sign — a failure at signing time rather than build time.                                                                                                                                               | Low      | **Property test**                                                   |
| A retry budget nested inside the caller's timeout could turn a slow indexer response into a hard failure.                                                                                                                                                                                                                                                               | Low      | Live testing                                                        |
| `p2mrMerkleRoot` accepted a single-leaf script tree. BIP-360 (as amended by BIPs #2198, June 2026) makes a depth-0 tree anyone-can-spend on purpose — the control block carries an empty Merkle path and validation succeeds without running the leaf. The mainnet guard meant no funds were reachable, but the structure was wrong and a test asserted it was correct. | High     | Spec re-read against shipped code                                   |

---

## 7. Reproducing

```bash
pnpm install
pnpm --filter @pqweave/sdk test        # 299 tests
pnpm --filter @pqweave/sdk typecheck
pnpm format:check
```

Property tests use a random seed per run. To reproduce a specific failure,
fast-check prints `{ seed, path }`; pass it back via `fc.assert(..., { seed, path })`.

No network access is required: every test uses fixtures or a stubbed `fetch`.

Relevant reading: `SECURITY.md` (threat model and honest limits), `BIP360.md`
(P2MR wire format and the anyone-can-spend hazard).

---

## 8. What we are asking a reviewer to do

In priority order:

1. **Break value conservation or the dust logic.** Find an input where
   `sum(inputs) − fee ≠ output`, or where an output below the dust limit escapes.
2. **Make us produce an unsignable or misleading PSBT.** Especially one that
   _looks_ fine in the dry run but does something else.
3. **Attack us through the indexer.** Forged UTXO amounts, a previous transaction
   that does not correspond to the input, inconsistent address stats.
4. **Break derivation.** Any path where we derive an address the user does not
   control, or miss coins that exist.
5. **Bypass the destination rails or the BIP-360 mainnet guard.**
6. Tell us where the invariants in §4 are **incomplete** — a missing invariant is
   more valuable to us than a confirmed one.

We are looking for a firm with Bitcoin and PSBT experience specifically. The
report will be published openly, findings and all.
