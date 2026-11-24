# Bitcoin-only release

This is the recommended release target for PQWeave's noncustodial Bitcoin
preparation kit. It has an independent dependency lockfile and an explicit list
of permitted source files. Legacy chain routes, EVM wallets, vaults, partner data
collection and their dependencies are excluded from the generated application.

## Build and verify

From the repository root, using Node 22.12 or newer and pnpm 9.15.9:

```bash
pnpm install --frozen-lockfile
pnpm bitcoin:build
pnpm bitcoin:test
pnpm --dir releases/bitcoin/site audit --prod
```

`bitcoin:build` regenerates the source tree, installs the isolated frozen lockfile,
builds Next.js, validates source checksums and creates a standalone server in
`releases/bitcoin/site/dist`. It includes static assets and a source manifest.
`bitcoin:test` copies that server into a temporary directory outside the repository,
starts it with a synthetic private indexer, and exercises its real HTTP routes.

The generated `site/` directory is disposable and ignored by Git. Edit the shared
Bitcoin implementation under `packages/sdk/src/bitcoin`, shared UI under
`apps/web`, or the Bitcoin-specific route/security overrides here. Regenerate
instead of editing generated files. No environment file is copied. The SDK's
Node ESM imports are compiled to JavaScript using the repository's TypeScript
compiler; copied TypeScript remains available for the release typecheck.

## Run the artifact

```bash
cd releases/bitcoin/site/dist
PORT=3002 HOSTNAME=127.0.0.1 node server.js
```

For a remote host, copy the entire `dist` directory and run `server.js` behind your
HTTPS reverse proxy. Set `BITCOIN_ESPLORA_URL` and `BITCOIN_TESTNET_ESPLORA_URL` at
runtime to your own Esplora-compatible indexers; otherwise the documented public
Blockstream defaults apply. These are not Bitcoin Core RPC URLs. Configure edge
rate/concurrency limits and prevent address/query-string logging at your host.

The source tree supports these pages:

- `/` — Bitcoin product overview
- `/protect/bitcoin` — prepare, inspect, restore and export plans
- `/bitcoin/research` — dated research and route comparison
- `/exposure/bitcoin` — Bitcoin exposure explanation
- `/security` — the supported Bitcoin security boundaries

Only `/api/btc`, its allowlisted Esplora read proxy, and Bitcoin `/api/scan` ship.
The scan endpoint rejects other chains. The Bitcoin API rejects broadcast writes.

## Dependency updates

Edit the pinned versions and overrides in `package.json`, run `pnpm bitcoin:prepare`,
then run `pnpm --dir releases/bitcoin/site install --lockfile-only`. Review and copy
that generated lockfile to `releases/bitcoin/pnpm-lock.yaml`. Run the full build,
artifact test and audit before accepting the update. Normal builds always use
`--frozen-lockfile`; they do not silently resolve newer versions.

The isolated production dependency audit reported zero known findings on
25 September 2026. The old research application's three moderate dependency
findings are not included in this artifact. An audit result is a database snapshot,
not a guarantee about unknown vulnerabilities.

## Release boundary

This implements the standard-wallet preparation approach. Signing and broadcasting
remain in the owner's wallet. It does not create post-quantum Bitcoin signatures
or add custody. QSB remains research-only. Independent security review, physical
signer compatibility, recovery drills and a deployment pilot remain release gates.
See [operations](../../docs/BITCOIN_PRODUCTION.md) and [research](../../docs/BITCOIN_RESEARCH_2026.md).
