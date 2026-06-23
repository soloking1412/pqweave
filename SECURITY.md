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
- **EIP-7702 "harden in place" is transitional.** Delegating an existing EOA keeps
  the original ECDSA key's protocol-level authority. Real safety requires
  _migrating_ funds to a sole-authority account, not hardening the old address.
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
