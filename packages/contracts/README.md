# @pqweave/contracts

Smart contracts for the PQWeave post-quantum account.

## Contracts

- **PQWeaveAccount** — hybrid ERC-4337 account. ECDSA authorizes routine
  operations; the policy-classified sensitive ones additionally require a
  post-quantum signature. Usable as a fresh account or as the EIP-7702 delegation
  target of an existing EOA.
- **QuantumPolicy** — the circuit-breaker. An operation requires a post-quantum
  signature when it moves native value above a threshold, grants token spend
  (`approve` / `setApprovalForAll`), or targets the account itself (admin changes).
- **LamportMerkleVerifier** — the default `IPQCVerifier`. Lamport one-time
  signatures committed in a Merkle tree (XMSS-style). Quantum resistance rests
  only on keccak256, with no lattice or discrete-log assumptions.
- **BatchExecutor** — minimal EIP-7702 delegation target. An EOA delegates to it
  and sweeps its entire balance (native, ERC-20, NFTs) into a safe account in a
  single transaction. The same address on every chain.
- **MigrationSweeper** — batched, approval-based ERC-20/721/1155 sweep, for moving
  assets from a still-exposed EOA without 7702.
- **PQWeaveFactory** — CREATE2 account deployment with the salt bound to the
  account's initialization parameters.

## Pluggable verifiers

`IPQCVerifier` decouples the account from the signature scheme. The default is
hash-based (most conservative security). Lattice verifiers such as
[ETHFALCON](https://github.com/ZKNoxHQ/ETHFALCON) (Falcon-512, ~1.9M gas) or
ETHDILITHIUM (ML-DSA) can be deployed and selected per account via
`setVerifier`, with no change to the account logic.

A single-leaf hash-based verification costs roughly 0.8M gas, so the
post-quantum gate is intended for L2s and high-value L1 operations, exactly the
operations the policy flags.

## Deterministic, shared deployment

`script/Deploy.s.sol` uses CREATE2 with a fixed salt, so the verifier, factory,
sweeper, and executor land at **identical addresses on every EVM chain**. Deploy
once per chain; everyone shares them.

## Develop

```bash
forge build
forge test                                   # unit tests (fork tests auto-skip)
RPC_URL_BASE_SEPOLIA=<url> forge test        # also runs the real-EntryPoint fork tests
forge script script/Deploy.s.sol --rpc-url <url> --broadcast
```

`test/integration/AccountLifecycleFork.t.sol` drives the full ERC-4337 lifecycle
against the real canonical EntryPoint on a Base Sepolia fork;
`test/OneClickMigration.t.sol` proves a one-transaction EIP-7702 wallet sweep.
