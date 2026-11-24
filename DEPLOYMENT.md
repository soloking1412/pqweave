# Build and deployment targets

Requires Node 22.12+ and pnpm 9.15.9. Read the [self-audit and unresolved release gates](docs/SELF_AUDIT_2026-09-25.md) before deploying.

## Bitcoin

Use the [Bitcoin-only release instructions](releases/bitcoin/README.md). `pnpm bitcoin:build` produces a standalone artifact and `pnpm bitcoin:test` exercises that artifact outside the repository. Ethereum routes and dependencies are excluded.

## Ethereum: local qualification first

The website now focuses on Ethereum Sepolia for execution. Previous Base Sepolia instructions are superseded. Mainnet execution is disabled in code; `NEXT_PUBLIC_AUDIT_APPROVED=true` does not enable it.

```sh
pnpm install --frozen-lockfile
pnpm ethereum:test
pnpm --filter @pqweave/sdk test
pnpm contracts:test
pnpm --filter @pqweave/web build
```

`ethereum:test` compiles contracts and SDK, starts a disposable local Prague node, deploys the pinned upstream EntryPoint 0.7.0 artifact, and exercises the money lifecycle without a public RPC. Foundry (`forge` and `anvil`) is required. The three optional Base Sepolia fork tests are additional legacy coverage, not a substitute for this local gate.

The `/ethereum` page provides a public-address readiness scan and report export. `/migrate` remains a gated testnet prototype. Its browser does not yet provide production-qualified spending-state recovery; use only disposable test funds.

## Sepolia deployment and manifest

Use a fresh test-only deployer and a private Sepolia RPC. Keep credentials in the environment, never in command arguments or public frontend variables. From `packages/contracts`:

```sh
forge script script/Deploy.s.sol --rpc-url "$RPC_URL_SEPOLIA" --broadcast --slow
```

The deployment script reads `DEPLOYER_PRIVATE_KEY`; canonical v0.7 EntryPoint is its default. Independently verify that EntryPoint, the factory, verifier, executor and optional adapters match the reviewed build on chain 11155111. Source code and immutable values affect runtime hashes. A factory-created account's deployer immutable differs from the standalone delegation implementation: **do not substitute the implementation hash for the account hash**.

Create `packages/contracts/deployments/11155111.reviewed.json` only after reviewing the corresponding deployment:

```json
{
  "version": 1,
  "chainId": 11155111,
  "addresses": {
    "factory": "0x<deployed address>",
    "verifier": "0x<deployed address>",
    "batchExecutor": "0x<deployed address>",
    "forwarder": "0x<deployed address>",
    "accountImpl": "0x<deployed address>",
    "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
  },
  "codeHashes": {
    "factory": "0x<32-byte runtime hash>",
    "verifier": "0x<32-byte runtime hash>",
    "batchExecutor": "0x<32-byte runtime hash>",
    "account": "0x<factory-created account runtime hash>",
    "entryPoint": "0x<32-byte runtime hash>",
    "forwarder": "0x<32-byte runtime hash>",
    "accountImpl": "0x<32-byte runtime hash>"
  }
}
```

Placeholders above are documentation, not deployable values. Do not obtain the expected hashes solely from the untrusted RPC whose response they are meant to authenticate.

```sh
node script/write-web-env.mjs 11155111 --dry
node script/write-web-env.mjs 11155111
```

The writer verifies manifest addresses against the deployment record and writes chain ID, stage, addresses and hashes to the local web environment file. Rebuild the site because `NEXT_PUBLIC_*` values are build-time configuration. Missing hashes or a network mismatch leave execution unavailable.

This rework changes account bytecode, storage and CREATE2 predictions. Redeploy prototypes and regenerate predicted addresses; do not fund historical predictions. Already deployed accounts do not receive these fixes automatically.

See [Ethereum research](docs/ETHEREUM_RESEARCH_2026.md) and [validation](docs/ETHEREUM_VALIDATION.md) for the production gaps and test evidence.
