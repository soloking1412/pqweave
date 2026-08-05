# PQWeave

Open-source tooling for the post-quantum transition: measure how exposed an
address already is, and move funds behind a signature a quantum computer cannot
forge.

MIT licensed. Watch-only where it has to be. **Not audited** — see
[SECURITY.md](SECURITY.md) before trusting it with anything.

## The problem

Shor's algorithm lets a quantum computer derive a private key from a public key.
Public keys are not secret and never were: on EVM chains one is recoverable from
any signature, on Bitcoin one is published the first time an address spends, and
on Solana or Stellar the address _is_ the key.

So exposure is not a future event. It already happened, for most of the value on
most chains. Google Quantum AI put deriving a secp256k1 key at roughly 1,200
logical qubits and minutes of runtime (March 2026), and BIP-361 cites over **34%
of all bitcoin** as having already revealed a public key.

What is still in the future is the machine. That gap is the entire window.

## What this does

**Scan.** Check whether an address has published its public key and score the
value at risk. 16 chains, all three exposure families, no wallet connection.

**Migrate (EVM).** Sweep a whole wallet — native, ERC-20 and NFTs — into a
post-quantum account in one EIP-7702 transaction, or keep the address and harden
it in place. Works with any wallet, because the wallet stays the ECDSA signer and
the account supplies the quantum-resistant logic.

**Evacuate (Bitcoin).** Build unsigned PSBT sweeps at several fee tiers with RBF
enabled, so coins can move fast if the situation changes. Watch-only: you sign in
your own wallet or on an air-gapped device. Also whole-wallet xpub scanning, an
on-chain BTC↔PQC key attestation registry, and reference implementations of
BIP-360 and BIP-361.

**Vault (Solana, Stellar).** Custody behind a post-quantum gate, on chains where
the address is the public key and in-place migration is impossible.

## What it cannot do

Stated up front, because the alternative is selling something that does not
exist.

- **Bitcoin cannot be made quantum-safe at the application layer.** Script cannot
  verify a post-quantum signature. Everything here is preparation and reaction
  time. The real fix is consensus-level and no application can deliver it.
- **Keeping your address is always transitional.** An EIP-7702 delegation stays
  revocable by the ECDSA key, so a quantum attacker who recovers that key can
  strip the guard. Only sweeping into an account where the post-quantum key is
  sole authority is actually safe.
- **Address-is-the-key chains cannot migrate at all.** Solana, Stellar, Algorand,
  NEAR and Polkadot publish the key in the address. A vault is custody, not
  migration, and the original address stays exposed.
- **Nothing here is audited.** The scope is frozen in
  [packages/sdk/AUDIT.md](packages/sdk/AUDIT.md) for a firm to quote against.

## Post-quantum signatures

The on-chain verifier is pluggable behind `IPQCVerifier`. The default is
hash-based, because its security rests only on keccak256 preimage resistance —
no lattice assumptions, and Grover only halves the security level.

| Scheme                  | Signature | Total gas | Status                             |
| ----------------------- | --------- | --------- | ---------------------------------- |
| **Winternitz + Merkle** | 2,304 B   | 254,218   | Default. WOTS+, keccak256          |
| Lamport + Merkle        | 24,736 B  | 670,062   | Original verifier, still deployed  |
| Falcon-512              | —         | —         | Blocked: FIPS 206 is still a draft |

Figures measured by
[`VerifierGas.t.sol`](packages/contracts/test/VerifierGas.t.sol), not estimated.
Winternitz derives the one-time public key by finishing each hash chain instead
of transmitting it, which is where the tenfold calldata saving comes from. It is
the same construction family Ethereum's leanSig selected, instantiated on
keccak256 rather than Poseidon2.

**One-time keys sign once.** Reuse leaks the key, and Winternitz leaks more per
reuse than Lamport does. The SDK's signers are strictly monotonic and are the
only intended entry point.

## Layout

```
packages/sdk           @pqweave/sdk — scanners, PQC keys, Bitcoin suite, migration
packages/contracts     Foundry — account, verifiers, forwarder, factory, attestation
packages/solana-vault  Rust — PQ-gated vault (devnet)
packages/stellar-vault Rust — Soroban custom account (testnet)
apps/web               Next.js — scanner, migration, Bitcoin tools
```

## Develop

```bash
pnpm install
pnpm test            # 315 SDK tests (vitest)
pnpm contracts:test  # 74 contract tests (forge)
pnpm typecheck
pnpm dev             # web app
```

## Docs

| File                                             | What it covers                                    |
| ------------------------------------------------ | ------------------------------------------------- |
| [SECURITY.md](SECURITY.md)                       | Threat model, security levels, what is not solved |
| [LANDSCAPE.md](LANDSCAPE.md)                     | The wider PQ ecosystem and what to watch          |
| [CHAINS.md](CHAINS.md)                           | Per-chain coverage and endpoints                  |
| [packages/sdk/AUDIT.md](packages/sdk/AUDIT.md)   | Frozen audit scope, invariants, known gaps        |
| [packages/sdk/BIP360.md](packages/sdk/BIP360.md) | P2MR wire format and the anyone-can-spend hazard  |
| [DEPLOYMENT.md](DEPLOYMENT.md)                   | Deploy runbook                                    |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | How to contribute, and what gets rejected         |

## Security

Found a vulnerability? Email **security@pqweave.com** rather than opening an
issue. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
