# Bitcoin release scope and operations

25 September 2026. **Hardened release candidate, not independently audited.**
Production readiness applies to an explicitly reviewed deployment and signer
matrix. Passing software tests does not certify a universal Bitcoin migration
service or post-quantum protection.

See [recorded validation results](BITCOIN_VALIDATION.md) for this rebuild.

## Recommended release target

Use the [isolated Bitcoin release](../releases/bitcoin/README.md), built with `pnpm bitcoin:build`. It packages only Bitcoin routes and their dependencies. Its independent production dependency audit reports zero known findings; the older multi-chain research application remains separate. Signing and broadcasting stay in the user wallet.

## Supported scope

| Capability  | Supported boundary                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Network     | Bitcoin mainnet and testnet address formats; isolated Core regtest integration uses equivalent testnet-encoded scripts |
| Sources     | Single-key P2PKH, P2WPKH, P2SH-P2WPKH, key-only P2TR; valid matching public keys where required                        |
| Destination | Fresh P2WPKH from the user's own wallet; ownership confirmed on trusted signer                                         |
| Inputs      | Confirmed ordinary BTC only, at most 100; full funding transactions required                                           |
| Fees        | Positive bounded rates; every emitted tier at most 100,000 sats and 5% of input total                                  |
| Plans       | Versioned unsigned JSON, up to 8 MB on import, 24-hour maximum age before recheck/export                               |
| Website     | One source address per plan, three replacement fee tiers, exact transaction matching                                   |
| Signing     | External signer only; downloadable PSBT is the baseline integration                                                    |
| Broadcast   | User wallet or Bitcoin Core; hosted POST relay returns 405                                                             |
| Indexer     | Server-configured Esplora-compatible endpoints, bounded responses and timeouts, no cached history                      |

Multisig, arbitrary scripts, Taproot script trees, inscriptions, Runes, coinjoin
policies, automated fleet signing and QSB transactions are outside this release.
The UI must not be used to weaken an institution's existing custody policy.
Other-chain modules in this repository retain their own prototype status.

## Trust boundaries

An indexer can lie about completeness, confirmation and history. Full funding
transactions verify selected input amounts/scripts and txids, but do not prove
that an outpoint is unspent or currently confirmed. Revalidate with the signing
wallet's node. Address histories cannot detect every off-chain public-key leak.

`verifySweepMatchesPlan` compares transaction intent and input funding data.
It does **not** cryptographically validate every signature. The trusted wallet or
Core must validate signatures and current spendability before broadcast. The
Core integration exercises this boundary independently of the SDK signer.

A plan checksum detects accidental edits, not a malicious author who rebuilds a
checksum. Verify destination, amount, network and fees on a trusted wallet display.
A returned signed PSBT is sensitive spend authorization; do not upload it to
support tickets or logs. No recovery seed is part of the plan file.

## Reproducible validation

```bash
pnpm install --frozen-lockfile
pnpm --filter @pqweave/sdk build
pnpm --filter @pqweave/sdk typecheck
pnpm --filter @pqweave/sdk test
pnpm --filter @pqweave/sdk test:bitcoin-core
pnpm --filter @pqweave/web build
pnpm --filter @pqweave/web typecheck
pnpm audit --prod
```

The integration requires `bitcoind` and `bitcoin-cli` on PATH (or `BITCOIND` and
`BITCOIN_CLI`). It creates a disposable data directory and isolated regtest node,
mines test coins, signs all tiers for four source types, compares SDK/Core
finalization, checks mempool acceptance, replaces the low-fee transaction, mines
it, verifies receipt and spends the destination with its own wallet. It stops the
node and removes only its temporary directory. No public transactions are sent.
CI installs Bitcoin Core 29.1 with a pinned official SHA256. This is the tested
compatibility runtime, not a claim that it is the newest Core version.

Tests also cover modified amounts/outpoints/destinations, missing funding data,
network mismatch, invalid keys, dust, fee arithmetic, script formats, duplicate
inputs, malformed indexer bodies, stream timeouts, expired plans, reorged/unconfirmed
coins and changed source sets. The web release needs both responsive review and
interactive build/export/restore/error-flow checks.

## Deployment

1. Build from the reviewed commit with the lockfile, pinned Node runtime and
   a reproducible CI artifact. Deploy behind HTTPS; protect deploy credentials
   and require reviewed changes to dependencies and signing UI.
2. Set `BITCOIN_ESPLORA_URL` and `BITCOIN_TESTNET_ESPLORA_URL` to private,
   Esplora-compatible services for institutional use. Defaults use public
   Blockstream endpoints. URLs are server configuration, never request input.
   Do not point these variables at Bitcoin Core RPC; it is a different protocol.
3. Suppress query-string/address logging at the proxy and application host.
   Disable analytics/session replay on wallet tools. Public indexers can link
   queried addresses; publish the actual deployment's retention policy.
4. Enforce edge request/concurrency limits and a finite upstream timeout.
   Serverless memory-local rate counters are not a distributed abuse control.
   The code bounds input count and response sizes; the deployment must bound
   total concurrent work and request volume.
5. Monitor only aggregate failure/latency metrics. Alert on indexer failures,
   mismatched funding data, changed plans and unusual error rates without
   recording public-key bundles or signed PSBTs.
6. Keep the Bitcoin endpoint read-only. Do not expose wallet RPC credentials,
   automatic signing or a raw transaction relay through it.

## User execution and recovery

- Back up the destination wallet using its own tested backup process. Verify a
  fresh receiving address on the signer. The application cannot restore keys.
- Review whether moving coins is justified. Consider fees, address linkage and
  special assets; do not blindly sweep every address marked exposed.
- Build the plan, review each output and fee, save the unsigned bundle if needed.
  Rebuild after any coin change, fee-policy change, reorg or 24-hour expiry.
- Sign only after the app's recheck and independent wallet verification. Select
  one tier. Higher tiers conflict with the lower tier and are replacements, not
  additional payments. A prebuilt tier is not guaranteed to meet future relay fees.
- Validate/finalize in the wallet, optionally use Core `testmempoolaccept`, then
  broadcast there. Check confirmation and destination receipt with your node.
- Keep wallet backups after migration. A later destination spend reveals its key;
  send change to a fresh wallet-controlled address. Test recovery before scaling.

## Gates before a public funds-handling claim

- Independent Bitcoin/PSBT review of the full browser-to-signer boundary.
- Physical signer tests with named firmware versions, including wrong-network,
  wrong-key, cancellation, restored-plan, fee-replacement and recovery behavior.
- Deployment-specific dependency risk review, HTTPS/security headers, edge limits,
  monitoring, incident response, rollback and privacy verification.
- Bounded pilot with ordinary BTC and measurable success/failure criteria.
- Multisig/fleet support requires its own policy-preservation tests and review.

No independent audit, hardware test or mainnet pilot was performed by this rebuild.
Those are external release gates, not tasks that unit tests can replace.

## Dependency review snapshot

The 25 September rebuild updated Next.js to 16.3.6 and compatible direct
packages, aligned SDK/web dependencies, and pinned patched transitive versions
for Axios, Valibot, ws, Hono, socket.io-parser, baseline-browser-mapping and
smol-toml. The production dependency scan fell from 88 findings (including two
critical and 28 high) to three moderate findings with zero high/critical.

Remaining findings are in uuid and decode-uri-component beneath the legacy EVM
connector dependency tree. The Bitcoin pages do not configure WalletConnect;
the legacy EVM flow uses an injected connector. This is a scope observation, not
an exploitability proof or a blanket waiver. Before broad site deployment,
review/remediate that dependency tree or isolate the Bitcoin release. Forcing an
ESM-only decoder into an older CommonJS consumer without compatibility review
would introduce a different failure mode. Do not report the dependency audit as
clean. Physical signer compatibility and an independent audit remain open.
