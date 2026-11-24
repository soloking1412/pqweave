# Bitcoin rebuild validation

Run on 25 September 2026 in the local workspace. This is engineering test evidence,
not an independent audit. Changes remain local; no public funds were moved.

| Check                              | Result                               | Coverage / limits                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK test suite                     | 340 passed, 32 files                 | Includes 21 strict-kit adversarial tests plus Bitcoin signing, PSBT compliance, funding validation, wallet scanning and property tests                                                               |
| Bitcoin Core integration           | 113 assertions passed on Core 29.1.0 | Four source script types, three fee tiers each, SDK/Core finalized bytes agree, invalid signatures rejected, mempool acceptance, RBF replacement, mining, destination receipt and destination spend  |
| Web production build               | Passed, Next.js 16.3.6               | Includes Bitcoin pages and both Bitcoin API route families                                                                                                                                           |
| Workspace typecheck                | Passed                               | SDK and web                                                                                                                                                                                          |
| Repository formatting / whitespace | Passed                               | `pnpm format:check` and `git diff --check`                                                                                                                                                           |
| Existing contract regressions      | 77 passed, 3 skipped                 | Fork tests skipped without external RPC; these contracts are outside the Bitcoin release                                                                                                             |
| Browser flow                       | Passed                               | Build, both acknowledgment gates, unsigned download, signed PSBT comparison/export, save/restore, stale source refusal, malformed PSBT refusal, input edit resets plan                               |
| Responsive browser checks          | Passed                               | Home, research and preparation pages at 1440px and 390px; no document overflow or page runtime errors                                                                                                |
| Actual HTTP route integration      | Passed                               | Private mock indexer used by scan and kit APIs; no-store; malformed upstream data rejected; missing mempool history yields warning; invalid network/path and broadcast rejected before upstream work |
| Production dependency audit        | 3 moderate; 0 high/critical          | Down from 88 findings. uuid/decode-uri-component in legacy EVM connector tree remain; see release scope                                                                                              |

Independent design evaluation passed on its second review: desktop, tablet and mobile; corrected heading visibility, button contrast, table navigation and tool labels. This was a design review, not a security audit.

## Recommended Bitcoin-only release verification

The separate release under `releases/bitcoin` was built and verified after the
initial rebuild:

- Independent production dependency audit: **zero known findings**, 108 dependencies.
- Standalone package booted from a temporary directory outside the repository.
- Five Bitcoin pages and their referenced static assets returned successfully.
- Nine legacy page/API routes returned 404; non-Bitcoin scans and broadcast requests were rejected.
- Private-indexer HTTP reads, security headers, invalid-data handling and missing-mempool refusal passed.
- Browser preparation, acknowledgment, export, restore and stale-plan flows passed against the packaged server.
- Four pages passed desktop/mobile overflow checks at 1440px and 390px with no runtime errors.
- SDK regression suite: **340 passed**. Core lifecycle suite: **113 assertions passed**.
- Release build, typecheck and repository formatting passed.

`pnpm bitcoin:test` is now a persisted CI check for the isolated runtime; it uses
synthetic data and never moves public funds. The independent release audit excludes
the research application's legacy connector dependency graph. The earlier three
moderate findings remain in that research graph, not in the recommended artifact.
See [build and run instructions](../releases/bitcoin/README.md).

## Reproduce the committed test harnesses

```bash
pnpm install --frozen-lockfile
pnpm --filter @pqweave/sdk build
pnpm --filter @pqweave/sdk test
pnpm --filter @pqweave/sdk test:bitcoin-core
pnpm --filter @pqweave/web build
pnpm typecheck
pnpm format:check
```

The Core harness is `packages/sdk/scripts/test-bitcoin-core.mjs` and is wired into
CI. It needs local Bitcoin Core binaries; CI downloads a checksum-pinned runtime.
It uses regtest only and cleans its own disposable data directory.

Browser and HTTP integration were local fixture-based checks, not physical wallet
or mainnet tests. Their session scripts are `/tmp/playwright-test-bitcoin.js` and
`/tmp/pqweave-bitcoin-api-test.mjs`; those temporary files are not release artifacts
or CI gates. Wallet-specific integration must be rerun with the actual supported
signers and deployment configuration before production approval.

## Remaining release gates

- Independent Bitcoin/PSBT and browser-to-signer security review.
- Physical signer/firmware compatibility and backup/recovery matrix.
- Review or remove remaining legacy connector dependency risks before broad deployment.
- Deployment abuse limits, privacy/retention verification, monitored pilot and rollback drill.
- QSB cryptographic, computational, miner-submission and recovery evaluation before any funded QSB product.

See [research](BITCOIN_RESEARCH_2026.md) and [release operations](BITCOIN_PRODUCTION.md).
