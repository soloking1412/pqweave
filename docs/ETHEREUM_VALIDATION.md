# Bitcoin → Ethereum validation record

Date: 25 September 2026. Local software verification; no public deployments or fund movement.

## Results

| Gate                              | Result                       | Scope                                                                                                                                                                               |
| --------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete SDK suite                | **492 passed, 39 files**     | Bitcoin, Ethereum, signing, keystore, planning and retained chain modules                                                                                                           |
| Bitcoin Core integration          | **113 assertions passed**    | Core 29.1 regtest: four input families, fee replacement, signed transaction agreement, confirmation and destination spending                                                        |
| Packaged Bitcoin server           | **Passed**                   | Standalone boot outside repo, 5 pages, assets, 9 excluded legacy routes, private indexer API, malformed data rejection and broadcast refusal                                        |
| Isolated Bitcoin dependency audit | **No known vulnerabilities** | Independent production lockfile; Ethereum dependencies excluded                                                                                                                     |
| Solidity suite                    | **94 passed, 3 skipped**     | Optional Base Sepolia fork tests skip without RPC; all local suites pass                                                                                                            |
| Ethereum lifecycle                | **122 assertions passed**    | Actual upstream EntryPoint 0.7.0 artifact on a disposable local Prague node; both custom signature schemes                                                                          |
| Ethereum browser checks           | **Passed**                   | Desktop 1440px and mobile 390px; readiness and migration pages; successful scan/download, malformed input, provider errors, wrong-chain results, stale responses and execution gate |
| Builds and static checks          | **Passed**                   | SDK build, main website build, isolated Bitcoin build, workspace typecheck and formatting                                                                                           |
| Broad prototype dependency audit  | **No known vulnerabilities** | Runtime and development dependencies checked after Wagmi/Vitest updates and patched build dependencies                                                                              |

The final randomized SDK run exposed an existing test-generator error: the parser intentionally trims outer whitespace, but the generator classified a final `0 ` segment as invalid. The generator now follows the documented normalization behavior, and fixed cases cover accepted outer whitespace versus rejected whitespace inside a path. The parser's behavior did not change.

See the [expanded BTC/ETH self-audit](SELF_AUDIT_2026-09-25.md) for reproduced verifier flaws, policy fixes, hostile-input tests, cross-process signer checks and the repeatable HTTP gate.

## Ethereum lifecycle exercised

1. Deploy EntryPoint, factory, verifier, batch executor and test token contracts from actual compiled artifacts.
2. Create a separate account, check zero ECDSA owner and its expected PQ root.
3. Authenticate destination code, verifier and EntryPoint through the strict planner, with a pinned block and revalidation.
4. Move ETH, ERC-20 and a separately selected ERC-721. Lamport exercises an actual EIP-7702 batch; Winternitz exercises ordinary wallet transfers after revoking the source delegation.
5. Produce signatures through the durable reservation journal and spend through real `handleOps` validation.
6. Reject replay, missing PQ signature and modified calldata.
7. Keep off-chain reservations consumed even when no corresponding on-chain leaf is used.
8. Confirm that insufficient-value execution and a false-return ERC-20 produce failed operation events while consuming their validated leaf.
9. Rotate to a fresh seed/root, then spend using leaf zero of the new root. Unit tests separately verify that returning to an old root preserves its consumed-leaf history.
10. Demonstrate delegation persistence after a reverted type-4 transaction and explicitly revoke it.

The harness uses trusted hashes only because it deploys the artifacts itself. Production expected hashes must originate from a reviewed deployment manifest, not from whichever RPC is being tested.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm ethereum:test
pnpm --filter @pqweave/sdk test
pnpm contracts:test
pnpm --filter @pqweave/sdk test:bitcoin-core
pnpm --filter @pqweave/web build
pnpm bitcoin:build
pnpm bitcoin:test
pnpm --dir releases/bitcoin/site audit --prod --audit-level low
pnpm typecheck
pnpm format:check
```

`ethereum:test` requires Foundry and is included in the cross-runtime CI job. The pinned EntryPoint artifact is a development-only dependency. `test-bitcoin-core` requires Bitcoin Core. Both integration harnesses use disposable local networks and clean their own processes/data.

Browser checks used synthetic public scan responses against the built local website, not a live exchange account, browser-wallet authorization or hardware signer. The session script is `/tmp/playwright-test-ethereum.js`; screenshots are `/tmp/pqweave-ethereum-1440.png` and `/tmp/pqweave-ethereum-390.png`. These temporary browser checks are not a committed CI gate.

## Release interpretation

Bitcoin's software release checks passed; independent review, physical wallet compatibility and deployment operations remain in [its release gates](BITCOIN_VALIDATION.md).

Ethereum is **a tested local/testnet candidate**. The public website does not enable mainnet by setting an environment flag. Browser signing-state recovery, distributed/rollback-resistant custody controls, cryptographic and contract review, public testnet qualification, supported wallet testing remain required. Passing the tests above does not establish safety for real funds or complete migration of arbitrary wallet assets.

See [research and architecture](ETHEREUM_RESEARCH_2026.md) and [deployment requirements](../DEPLOYMENT.md).
