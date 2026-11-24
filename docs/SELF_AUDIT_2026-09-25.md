# BTC and ETH implementation self-audit — 25 September 2026

**Status: local qualification passed; independent review and production approval remain open.** This is an implementation self-audit, performed while modifying the software. It is not an independent security audit, a cryptographic proof, or a guarantee that all vulnerabilities have been found. No public-chain transactions or user funds were used.

## Scope and method

Reviewed the Bitcoin preparation, funding verification, PSBT comparison, indexer boundary and packaged website; Ethereum account authorization, both custom hash-signature verifiers, migration batch execution, factory, forwarder, destination verification, durable signing state, keystore handling and public website boundaries. Also checked dependency advisories and CI configuration. Other chain implementations run in the shared SDK suite but did not receive a new security audit in this pass.

Used manual source review, exploit regressions, deterministic generated cases, Solidity fuzzing, actual Bitcoin Core and Ethereum EntryPoint execution, independent signer processes, HTTP integration tests and browser checks. Assertions test particular properties; their count does not measure overall security. The initial failing leaf-alias regressions were observed before the fixes.

## Findings and changes

| ID     | Severity / classification                 | Finding                                                                                                                                                                                                                                                   | Resolution and evidence                                                                                                                                                                                                                                                             |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ETH-01 | High, conditional reuse-guard bypass      | Both verifiers accepted indices outside the tree. Lamport ignored all bits above the Merkle path; Winternitz also lost the upper 64 bits in its `uint256` chain tweak. Relabeling a valid signature could pass verification under an unused bitmap index. | Shared canonical ABI validator checks exact offsets, lengths, proof depth and `index < 2^depth` before decoding. SDK applies the same checks. Depth is limited to 12, or 4,096 leaves. Contract, SDK and actual EntryPoint regressions reject aliases.                              |
| ETH-02 | High for optional hybrid mode             | Token transfers and unknown selectors could bypass the PQ gate; a batch could split native value into individually sub-threshold calls.                                                                                                                   | Every nonempty payload and every call to an address with code requires PQ authorization. Native batch amounts are checked cumulatively without overflow. Fuzz tests cover arbitrary payloads and split amounts. Sole-PQ mode already required PQ authorization for every operation. |
| ETH-03 | Low, false success reporting              | The migration executor accepted an ERC-20 `transfer` call to an address without code as a successful legacy no-return transfer.                                                                                                                           | Reject no-code token targets; verify that failure rolls back an earlier native transfer. Real legacy tokens with no return value remain supported.                                                                                                                                  |
| ETH-04 | Configuration hardening                   | The optional forwarder accepted a nonzero verifier address without code.                                                                                                                                                                                  | Initialization rejects no-code verifiers, with a contract regression. Code existence alone does not establish verifier trust.                                                                                                                                                       |
| BTC-01 | Resource/cancellation hardening           | Indexer error response bodies were not released; cancellation after receiving headers did not stop a stalled body read; retry options lacked bounds.                                                                                                      | Cancel rejected response streams, propagate cancellation through body reading, validate retry/backoff/deadline limits, and test retries, timeouts, size limits, UTF-8 and cleanup.                                                                                                  |
| BTC-02 | Input/snapshot hardening                  | Confirmation policy accepted truthy non-booleans; exported plans retained references to mutable status/path metadata.                                                                                                                                     | Require literal `true` and snapshot nested metadata. Test all four input families and caller/bundle mutation independence.                                                                                                                                                          |
| WEB-01 | Low, malformed input causes server errors | Prototype property names such as `toString` passed object membership checks and were treated as chain/scanner entries.                                                                                                                                    | Use own-property checks in both the SDK chain allowlist and web scanner routing. Real HTTP regressions require controlled 400 responses. Also clear completed scan deadline timers.                                                                                                 |
| DEP-01 | Dependency advisories, varying severity   | Unused wallet connector dependencies brought runtime advisories. Development dependencies included a critical Vitest server advisory and Vite, esbuild, PostCSS and nanoid advisories.                                                                    | Upgrade Wagmi and Vitest/Vite, explicitly install required peers, remove unused automatically installed connector peers, and pin patched transitive packages. Full workspace and isolated Bitcoin dependency audits report zero known advisories at validation time.                |
| CI-01  | Supply-chain hardening                    | CI actions used mutable release tags and implicit permissions.                                                                                                                                                                                            | Pin actions to verified commits, pin Foundry to tested v1.4.2, use read-only repository permissions, set job deadlines, and add the full dependency audit and HTTP regression gate.                                                                                                 |

### ETH-01 impact precisely

An index alias does **not**, by itself, produce a signature over a different UserOperation hash or bypass the EntryPoint nonce. It defeats the on-chain one-time-key reuse guard when another valid or exposed signature exists under the same leaf. That guard is a critical defense against unsafe signing-state recovery and reuse. The account regression signs two different test digests with the same test-only key, consumes the first, and proves the relabeled second is now rejected. Neither production signers nor users should deliberately reuse a leaf.

### Changed deployment artifacts

The account, factory, verifiers, batch executor and forwarder bytecode/predictions changed. Old deployed contracts do not acquire these fixes. Do not reuse old runtime hashes, historical CREATE2 predictions or previously approved manifests. Rebuild, redeploy test prototypes and independently review a fresh deployment manifest. The CREATE2 regression now compares predicted and actually deployed **current** bytecode instead of expecting the historical Base Sepolia verifier address.

Canonical signature encodings and trees of at most 4,096 leaves are now required. Normal existing signatures within that profile still verify; byte-for-byte SDK/contract vectors remain unchanged. Larger/noncanonical profiles require a separately reviewed migration, not an attempt to relax the validator.

## Validation results

| Gate                       | Result                                          | Practical coverage                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK unit/property suite    | **492 tests, 39 files passed**                  | BTC/ETH planners, signing, keystore, hostile inputs, retained SDK modules                                                                                                                                        |
| Solidity suite             | **94 passed, 3 skipped**                        | 512 runs per fuzz test; three optional legacy Base Sepolia fork tests need an external RPC                                                                                                                       |
| Bitcoin Core 29.1          | **113 integration assertions passed**           | P2PKH, P2WPKH, wrapped SegWit and key-path Taproot inputs; actual signing, fee replacement, mining, destination receipt and spending                                                                             |
| Ethereum local Prague node | **122 integration assertions passed**           | Actual upstream EntryPoint 0.7.0; both custom schemes; ETH/ERC-20/ERC-721 migration, spending, replay/tamper rejection, failed execution, key rotation and 7702 revocation                                       |
| Signer processes           | **8 processes / 16 unique reservations passed** | Real filesystem contention, persisted increments, restart after reservation without signing, refusal to recreate a journal; included in Ethereum count                                                           |
| Main website HTTP          | **38 assertions passed**                        | Invalid chains/addresses, inherited object names, method restrictions, BTC/ETH pages and security headers                                                                                                        |
| Isolated BTC package       | **Passed**                                      | Standalone boot outside repo, five pages/assets, nine excluded legacy routes, API input failures and refusal to broadcast                                                                                        |
| Browser checks             | **Passed**                                      | BTC plan restore/export/compare and stale-source refusal; ETH scan/download/errors/stale responses; 1440px/390px layouts; injected wallet connect/account change/chain change/disconnect; mainnet execution gate |
| Dependencies               | **Zero known advisories**                       | Full workspace and standalone BTC lockfiles, including development dependencies, on this date                                                                                                                    |
| Builds, types, formatting  | **Passed**                                      | SDK, main site, standalone BTC site, TypeScript and Solidity/Prettier checks                                                                                                                                     |
| Cross-runtime vectors      | **Unchanged**                                   | Regenerated SDK vectors match committed contract fixtures                                                                                                                                                        |

New generated tests include 512 arbitrary byte inputs and 256 out-of-tree aliases **per signature scheme**, plus 128 changed output amounts **per Bitcoin input family**. These are in addition to the existing Bitcoin arithmetic/derivation properties and Solidity fuzz cases.

A targeted credential-pattern scan of 228 tracked text files found no matching AWS access-key IDs, GitHub tokens, OpenAI tokens or private-key PEM headers. No `.env`, `.pem` or `.key` file paths were found in the queried Git history. This limited scan is not a full secret-history audit, and test private keys are intentional public fixtures.

## Reproduce

Requires Node 22.12+ (validated on 24.7), pnpm 9.15.9, Foundry 1.4.2 and Bitcoin Core 29.1.

```sh
pnpm install --frozen-lockfile
pnpm --filter @pqweave/sdk build
pnpm --filter @pqweave/sdk test
forge test --root packages/contracts --fuzz-runs 512
pnpm ethereum:test
pnpm --filter @pqweave/sdk test:bitcoin-core
pnpm --filter @pqweave/web build
pnpm web:test
pnpm bitcoin:build
pnpm bitcoin:test
pnpm audit --audit-level low
pnpm --dir releases/bitcoin/site audit --audit-level low
pnpm typecheck
pnpm format:check
forge fmt --root packages/contracts --check
```

Browser checks used the temporary session scripts `/tmp/playwright-test-ethereum.js`, `/tmp/playwright-test-wallet-audit.js` and `/tmp/playwright-test-bitcoin-release.js`, with synthetic responses/keys. They are session evidence, not committed browser CI coverage. The committed HTTP and blockchain harnesses are repeatable CI gates.

## Remaining release gates

- **Independent cryptographic and contract review.** The custom constructions are not standardized XMSS/WOTS+ implementations. Familiar primitives, a gas benchmark and passing tests are insufficient evidence of cryptographic security.
- **Signer recovery and operational custody.** The POSIX journal assumes a private local filesystem. It cannot prevent disk rollback, old backups, copied seeds or uncoordinated devices. Each authority/scheme/tree must use an independent seed; changing tree size or scheme does not safely create a new key from an old seed. A production browser journal, distributed custody coordination and disaster recovery are still required.
- **Ethereum public testnet and wallet qualification.** Local self-bundled EntryPoint execution is not commercial bundler/ERC-7562 qualification. Test supported wallets, gas/prefund limits, receiver behavior, partial ordinary transfers and recovery on Sepolia with reviewed deployments. The website remains mainnet-disabled.
- **Bitcoin signer and operations qualification.** Physical hardware devices, supported exchange withdrawal workflows, restoration drills, private indexer operations and final deployment controls remain unverified. The kit does not supply PQ signatures for ordinary Bitcoin outputs or independently verify imported signatures cryptographically; the wallet/Core must do that.
- **Coverage limits.** No load/capacity benchmark, malicious operating-system simulation, complete formal verification or arbitrary-token proof was performed. Fee-on-transfer/rebasing tokens, NFTs, DeFi positions, special Bitcoin assets, multisig and custom scripts need explicit support and their own tests.

Treat the software as an improved release candidate with documented local evidence. Do not present this report as approval to secure real funds.
