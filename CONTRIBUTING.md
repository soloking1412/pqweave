# Contributing

Contributions welcome. This is security tooling, so a few things are stricter
than usual — all of them are about the same thing: nobody should have to take a
claim on trust.

## Before you start

```bash
pnpm install
pnpm test            # 315 SDK tests
pnpm contracts:test  # 74 contract tests (needs foundry)
pnpm typecheck
pnpm format
```

For a security issue, **do not open an issue**. Email security@pqweave.com. See
[SECURITY.md](SECURITY.md).

## What gets merged quickly

- A failing test that demonstrates a bug, even with no fix attached. This is the
  most useful thing you can send.
- A new chain scanner, if it correctly identifies which of the three exposure
  families the chain belongs to and does not overstate what can be done about it.
- Corrections to the specs. BIP-360, BIP-361 and the Ethereum PQ work all move,
  and [LANDSCAPE.md](LANDSCAPE.md) goes stale. If something there is wrong, say
  so with a source.
- Documentation that removes an overclaim.

## What gets rejected

**Anything that claims more safety than it delivers.** No "audited", "perfect",
"unbreakable", or "quantum-proof". The contracts are not audited. Bitcoin cannot
be made quantum-safe at the application layer. Keeping your address via EIP-7702
is transitional, not safe. These limits go in the UI next to the feature, not in
a footnote.

**Migration for a chain that cannot support it.** Where the address is the public
key, no application-layer migration exists. A vault is custody and must be called
custody. See `migrationCapability()`.

**Anything that lets a one-time key sign twice.** This is the single most
dangerous invariant here. Use the monotonic signers; do not reach for the raw
sign functions.

**Guessing where a spec is ambiguous.** BIP-361 does not resolve the scope of
Phase B, so the code reports both readings. If you find another ambiguity, model
it, do not pick a side and hide the choice.

## Rules that exist because something went wrong

Each of these is a real bug that shipped:

- **PSBT inputs must carry what their script type requires.** Legacy and wrapped
  SegWit need `nonWitnessUtxo`, wrapped SegWit needs `redeemScript`, Taproot
  needs `tapInternalKey`. An input that cannot be made signable must **throw**,
  never be silently emitted. An unsignable escape hatch is worse than none,
  because it fails at the moment it is needed.
- **Never trust the indexer.** Every fact it supplies about a UTXO is
  cross-checked against the previous transaction it also supplies. Amount, txid,
  vout and script all have to agree, or the build aborts.
- **A P2MR script tree needs at least two leaves.** BIP-360 treats a depth-zero
  tree as anyone-can-spend on purpose.
- **Test every script type, not the convenient one.** The unsignable-PSBT bug
  survived because the tests only ever signed p2wpkh.

## Style

Match the surrounding code. Comments explain non-obvious cryptographic or threat
reasoning and nothing else — no narration, no restating what the line does.

Prefer a property-based test over an example where the property is the point.
`fast-check` is already set up.

## Cross-runtime changes

If you touch a signature scheme, the TypeScript and Solidity implementations
must still agree byte for byte. Regenerate the vectors and check the contracts
accept them:

```bash
pnpm --filter @pqweave/sdk build
node packages/sdk/scripts/gen-winternitz-vector.mjs
pnpm --filter @pqweave/contracts test
```

CI enforces this. One differing byte invalidates every signature, and the failure
would otherwise only surface on chain.

## Licence

MIT. By contributing you agree your work ships under it.
