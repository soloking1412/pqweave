# Bitcoin: research, decision and architecture

Research checked 25 September 2026. This supersedes Bitcoin conclusions in the
older multi-chain rework. It describes the evidence reviewed, not a cryptographic
certification or a prediction of the date a quantum attack becomes practical.

## Decision

Build a noncustodial preparation layer that works with existing Bitcoin signers.
Ship a narrowly supported standard-wallet route, maintain QSB as a separate
research track, and keep future consensus adapters disabled until the relevant
network actually enforces them. No token, bridge, custodial deposit or seed import
is required for the standard route.

This is our engineering judgment for the requested combination of ease, speed,
security and existing-wallet compatibility. There is no demonstrated universal
solution that simultaneously gives all Bitcoin holders transparent migration,
standard wallet support and strong end-to-end post-quantum protection today.
A standard P2WPKH transfer still uses ECDSA and reveals its source key when spent.

## What changed in the research

| Evidence                                                                                                                         | Finding                                                                                                                                                                                                   | Product consequence                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [QSB mainnet demonstration, 26 August](https://starkware.co/blog/the-first-quantum-safe-bitcoin-transaction-has-been-mined/)     | A specific quantum-resistant construction was demonstrated under current consensus, using direct miner submission. It does not make Bitcoin as a whole quantum safe.                                      | Remove the blanket claim that every possible PQ construction requires a soft fork.            |
| [QSB implementation](https://github.com/avihu28/Quantum-Safe-Bitcoin-Transactions)                                               | Specialized hash/signature-puzzle machinery, GPU grinding and secret preimages need a dedicated implementation and recovery process. The documented v16 GPU fix matters when reproducing results.         | Do not translate a demo into a retail wallet promise or copy old kernels into the spend path. |
| [Optimization challenge, 16 September](https://starkware.co/blog/quantum-safe-bitcoin-optimization-challenge/)                   | The original run required roughly 3,100 GPU-hours; the challenge optimizes its computational kernels.                                                                                                     | Benchmarking needs a pinned implementation and end-to-end measurement.                        |
| [Cost update, 23 September](https://starkware.co/blog/ai-research-competition-cut-quantum-safe-bitcoin-costs-by-79-in-a-week/)   | About $67 is a modeled compute estimate after a 79% improvement, not a quoted price or Bitcoin fee. Benchmarks do not construct transactions; nonstandard relay and the reduced security margin remain.   | No “$67 migration” offer or automatic QSB activation.                                         |
| [BIP 360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki)                                                        | Draft P2MR removes Taproot's key path; it does not itself supply post-quantum signature opcodes.                                                                                                          | Future destination adapter only; no current public-network funding.                           |
| [BIP 361](https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki)                                                        | A draft migration/sunset proposal, not an activated deadline.                                                                                                                                             | Track proposal status; do not invent a countdown.                                             |
| [OP_CHECKSHRINCS proposal](https://blog.blockstream.com/op_checkshrincs-a-hash-based-signature-opcode-for-post-quantum-bitcoin/) | Proposed hash-based signature verification combines compact stateful use with a recovery path. Bitcoin deployment requires a consensus change.                                                            | Strong candidate for future research, not a supported destination today.                      |
| [Hardware-wallet research](https://blog.blockstream.com/hardware-wallets-post-quantum-signatures/)                               | Device measurements help assess implementation feasibility.                                                                                                                                               | Measurements are not proof that a shipping wallet accepts our plans.                          |
| [ECDSA.Fail paper, September revision](https://arxiv.org/abs/2609.09582)                                                         | Better reversible secp256k1 point-addition circuits reduce estimated arithmetic cost. Different interfaces and accounting prevent simple comparisons; logical circuits are not a working physical attack. | Prepare now, but do not claim a demonstrated break or a known Q-day.                          |

The QSB authors estimate roughly 118-bit second-preimage security and approximately
59 bits under a rough Grover reduction. This is a meaningful limitation, not a
NIST security-level certification. Faster grinding does not resolve it. See the
[September technical caveats](https://starkware.co/blog/ai-research-competition-cut-quantum-safe-bitcoin-costs-by-79-in-a-week/).

## Route comparison

| Route                                  | Existing signer fit                                     | Native BTC                  | Post-quantum boundary                                                 | Recommendation                                                   |
| -------------------------------------- | ------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Fresh P2WPKH with reviewed PSBT        | Good for supported single-key scripts; tested with Core | Yes                         | Hides destination key until spending, subject to leaks; ECDSA remains | Default preparation route                                        |
| Existing Taproot wallet                | Good                                                    | Yes                         | Output public key is already visible when funded                      | Supported source; not the default destination                    |
| QSB                                    | Specialist software, computation and miner cooperation  | Yes                         | Specific experimental construction and assumptions                    | Research only pending independent review and recovery validation |
| P2MR plus a future PQ signature rule   | Requires activated consensus and wallet support         | Intended                    | Depends on the chosen signature and every recovery branch             | Future adapter, disabled now                                     |
| Liquid/Simplicity experiments          | Different infrastructure and peg assumptions            | Sidechain representation    | Sidechain controls do not upgrade Bitcoin's own signatures            | Excluded from default migration                                  |
| An off-chain PQ signature or timestamp | Easy to attach                                          | Coins remain where they are | Bitcoin consensus does not enforce that extra authorization           | Evidence/intent only, never protection                           |

Blockstream's [Liquid/Simplicity demonstration](https://blog.blockstream.com/blockstream-research-demonstrates-quantum-resistant-transaction-signing-on-liquid-using-simplicity-smart-contracts/)
is relevant research, but its network and peg boundaries must remain explicit.

## Threat analysis

- **Already public keys:** P2PK, Taproot output keys and reused spending keys can
  present long exposure windows. A future attacker that already knows the key
  can race the owner's migration. An application cannot undo earlier disclosure.
- **Keys behind hashes:** unused P2PKH/P2WPKH hide keys in the output. Leaked
  xpubs, public descriptors or off-chain signatures can invalidate that assumption.
  An indexer cannot prove that a key has never leaked elsewhere.
- **Spend-time exposure:** standard signing does not add data to the chain, but
  a signed transaction shared with any service is a spend authorization and may
  reveal the public key before confirmation. Pre-signing is not a guarantee of
  winning a future quantum race.
- **Migration errors today:** wrong destinations, unsupported scripts, inaccurate
  amounts, fees, unconfirmed replacements and recovery failures can lose money
  without any quantum attacker. These are immediate engineering priorities.
- **Institutional policies:** never collapse an existing multisig policy into a
  single-key destination for convenience. Treasury and exchange multisig require
  a separately implemented and audited adapter.

## Implemented architecture

```text
Existing wallet / public address
          |
          v
Validated indexer reads ----> exposure report (limited to observed data)
          |
          v
Full funding tx checks + script/key matching + strict fee policy
          |
          v
Unsigned versioned plan bundle ----> restore + rebuild + checksum
          |
          v
Current UTXO and destination recheck (24-hour maximum plan age)
          |
          v
Existing signer: verify address / amount / fees on trusted display
          |
          v
Exact transaction comparison ----> wallet/Core signature validation
          |
          v
Wallet/Core broadcasts ----> confirms receipt ----> recovery drill
```

PSBT follows [BIP 174](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki).
Construction and policy checks occur locally. The hosted Bitcoin API only reads
public chain data. The website never requests seed phrases or private keys.
Server-selected indexer URLs prevent clients from turning the proxy into an
arbitrary URL fetcher. Integrators can self-host an Esplora-compatible indexer.

The UI handles one source address at a time, up to 100 confirmed ordinary BTC
inputs. The SDK supports reviewed batches within the same bound. Fees are limited
to both 100,000 sats and 5% of input value. These conservative limits are product
policy, not Bitcoin consensus rules. Large fleets need separately reviewed
batches and their existing approval system.

## QSB research admission criteria

Before any funded QSB product: reproduce the exact public demonstration against
pinned source; independently review the cryptographic assumptions, script and
GPU/CPU agreement; measure complete construction and spend latency; prove backup
and recovery with fresh test data; prevent reuse of one-time material; establish
miner submission availability and fallback procedures; audit the supply chain;
and verify what happens when the original EC key is already exposed.

This rebuild does not claim to have executed QSB or audited its cryptography.
Those unresolved requirements are why it remains a visibly separate route.

## Delivery sequence

1. Release candidate: read-only inventory, standard PSBT preparation, restore,
   freshness checks and independent Core lifecycle tests (implemented).
2. External Bitcoin/PSBT security review and physical signer matrix, followed by
   a bounded pilot with measured failures and recovery drills (release gates).
3. Institutional multisig/descriptor policy adapter with dual approval and
   private indexer deployment; prove its full lifecycle before enabling it.
4. Separate QSB research evaluation; do not bypass its admission criteria.
5. Consensus PQ adapter only after actual activation, independent implementation
   agreement, wallet support and recovery testing.

See [release scope and operations](BITCOIN_PRODUCTION.md) for concrete boundaries.
