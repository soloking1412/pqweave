# Post-quantum landscape

What the rest of the ecosystem has actually shipped or specified, and what it
means for this project. Reviewed **2026-08-05**. Re-check before relying on any
date here — this field moves fast and several items below are drafts.

---

## Threat estimates

The resource estimates for breaking secp256k1 have fallen roughly 20x in a year,
through better algorithms rather than better hardware. That is the part worth
paying attention to: hardware improvement is visible and forecastable, algorithmic
improvement is not.

| Source                               | Finding                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Gidney, Google Quantum AI (May 2025) | RSA-2048 in under a week with <1M noisy physical qubits — 20x below his own 2019 estimate     |
| Iceberg Quantum (Feb 2026)           | RSA-2048 plausibly under 100k physical qubits with qLDPC codes. Simulation only, not hardware |
| Google Quantum AI (Mar 2026)         | ECC/secp256k1 with **<500k physical qubits**, ~1,200–1,450 logical, runtime in **minutes**    |

The Google cryptocurrency paper also estimates roughly a **41% chance a primed
quantum computer could derive a private key before a Bitcoin transaction
confirms** — which is the number that makes mempool exposure, not just historical
exposure, a live concern.

For calibration: the best publicly known hardware in mid-2026 is around 100
logical qubits, so the gap is ~12x in logical qubits. DARPA said in March 2026
that a utility-scale machine by 2033 "seems more likely than not". Nobody
credible has a date; treat any single-year prediction as marketing.

---

## NIST standards

- **FIPS 203 (ML-KEM), 204 (ML-DSA), 205 (SLH-DSA)** — final since August 2024.
- **FIPS 206 (FN-DSA / Falcon)** — still a **draft**. Submitted for approval
  August 2025; final expected late 2026 or early 2027. Major CAs have said they
  will not ship it in production until it is final.

This is the direct justification for the hash-based default here. Falcon is the
scheme that would suit on-chain verification best on size grounds, and it is not
finished. Hash-based signatures need no new standard to be sound.

---

## Ethereum

The Ethereum Foundation stood up a post-quantum team and hub (`pq.ethereum.org`)
in March 2026, with 10+ client teams involved.

- **leanXMSS / leanSig** — the chosen consensus-layer replacement for BLS
  validator signatures. A **generalized XMSS with Winternitz chains**, built on
  "incomparable encodings" and tweakable hashes (eprint 2025/055, 2025/1332).
  Public key is a 52-byte Merkle root plus 20-byte parameter; key lifetime 2^32
  slots. Instantiated with **Poseidon2** for SNARK-friendliness, which is under
  cryptanalytic pressure from recent algebraic attacks — the team is weighing
  registering validators under several hash functions to preserve agility.
- **leanVM / leanMultisig** — a minimal zkVM that aggregates the larger PQ
  signatures via SNARK proofs, roughly 250x compression. Without it the consensus
  layer would not absorb the size increase.
- **PQ key registry** — proposed as the first concrete migration step: validators
  register a quantum-resistant key alongside their existing BLS key. Registering
  ~1M validators would add about 52 MiB of consensus state.
- **EIP-8141 (Frame Transactions, type `0x06`)** — protocol-level account
  abstraction, splitting a transaction into verify / send / default frames.
  **"Considered for Inclusion" for the Hegota fork, H2 2026**, though not a
  headline feature. It decouples validity from ECDSA, so accounts could adopt a
  post-quantum scheme individually without a network-wide fork.
- Protocol-level PQ work targets roughly **2029** (the "L"/"M" forks).

**What this means for PQWeave.** The Foundation's plan validates the core bet:
account abstraction is how individual accounts migrate before the protocol does,
and hash-based signatures are the near-term answer. Two concrete consequences:

1. Our Winternitz verifier is the same construction family Ethereum picked. We
   differ on the hash (keccak256, not Poseidon2) because we optimize for EVM gas
   rather than SNARK proving, and keccak256 has the longer cryptanalytic record.
2. EIP-8141 is worth tracking closely, but it is not final and has no shipped
   client support. Building against it now would be building against a moving
   target. ERC-4337 and EIP-7702 both work today.

---

## Bitcoin

- **BIP-360 (P2MR, Pay-to-Merkle-Root)** — merged into `bitcoin/bips` on
  2026-02-11, `Status: Draft`, **not activated anywhere**. Taproot with the
  quantum-vulnerable key path removed. SegWit **v2**, mainnet prefix `bc1z`
  (widely-repeated "bc1r" comes from an older v3 draft). Defines **no** PQ
  signature opcodes — deferred to a companion BIP via `OP_SUCCESSx`.
- **BIPs #2198 (June 2026)** — amended BIP-360 so a **depth-0 script tree is
  anyone-can-spend**: "If m = 0, succeed immediately", so revealing the single
  leaf lets anyone take the output. This is deliberate, to stop wallets dropping
  a post-quantum fallback leaf to save witness bytes. We enforce a two-leaf
  minimum because of it.
- **BIP-361 (Post Quantum Migration and Legacy Signature Sunset)** — published
  2026-04-14 by Lopp et al., `Status: Draft`. Phase A at 160,000 blocks (~3
  years) after activation stops legacy addresses receiving; Phase B two years
  later rejects ECDSA/Schnorr spends from legacy outputs, freezing unmoved coins;
  Phase C proposes a zero-knowledge recovery path and is unspecified. Proposed
  earliest activation 2027-01-01 with a 90% threshold. Cites **>34% of all
  bitcoin** as having revealed a public key by 2026-03-01.
  - The BIP does **not** resolve whether Phase B applies to all legacy outputs or
    only exposed ones. `src/bitcoin/bip361.ts` reports both readings.
  - It is contentious. It makes coins unspendable by design.
- Also live in discussion: Hourglass V2 (limiting P2PK spends), Falcon and
  SLH-DSA script proposals, Winternitz via `OP_CAT`.

---

## Where this leaves the project

What holds up:

- Hash-based, keccak256-only signatures — vindicated by FIPS 206 still being
  unfinished and by Ethereum picking the same family.
- Account abstraction as the migration path — now explicitly the Foundation's
  plan too.
- Scan-only for non-EVM chains, vault custody where in-place migration is
  impossible. Nothing published since changes that.

What changed and has been acted on:

- Winternitz verifier added, ~2.6x cheaper all-in than Lamport.
- BIP-2198 depth-0 hazard fixed.
- BIP-361 modelled as a second, separate clock from quantum exposure.

What to watch:

- **EIP-8141** through the Hegota fork. If it lands, in-protocol signature
  agility becomes real and the 7702 mailbox story changes.
- **FIPS 206 finalization**, which would make a Falcon verifier defensible.
- **BIP-361 activation signalling**, which would turn its phase dates from
  hypothetical into a countdown.
- **Poseidon2 cryptanalysis**, which would affect Ethereum's leanSig choice but
  not ours.
