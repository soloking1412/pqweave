# Roadmap

Written 25 November 2026. This replaces the sequencing in
[REWORK_2026.md](REWORK_2026.md); the product decisions there still stand.

## Where things are

- Estimates to break secp256k1 have settled around 1,200 to 1,450 logical
  qubits. The largest demonstrated machines are near one hundred. Nobody can
  break a wallet today.
- Bitcoin's BIP-360 and BIP-361 are still drafts, with no activation date and no
  chosen signature scheme. Preparation tooling is the only thing a holder or a
  custodian can use now.
- Ethereum targets a post-quantum base layer around 2029. EIP-8141 would let
  accounts choose their own signature scheme and is a candidate for Hegotá.
- Several chains now have native paths: Algorand ships Falcon accounts, Aptos
  and Stellar have published key-rotation plans. A migration tool has to follow
  each chain's own route, not wrap them all in one scheme.
- Regulators and large holders have started asking custodians how much of what
  they hold is exposed.

## What we are building

One integration that gives the right route for each chain, starting with the two
that hold most of the value.

### Now: Bitcoin readiness for holders and custodians

Watch-only, so it does not wait on a contract audit.

1. Hardware-wallet matrix. Sign the kit's PSBTs on Coldcard, Jade, Trezor,
   Ledger and Sparrow, and publish what each accepts per script type.
2. Fleet report. Scan many xpubs and address lists in one resumable job, with a
   printable report built on the published methodology.
3. Independent review of the Bitcoin money path: PSBT construction, funding
   verification, destination checks.
4. Track BIP-360, BIP-361 and the alternatives, and publish when they move.

### Next: Ethereum, behind an audit

1. Redeploy the current contracts to a public testnet and publish the manifest.
2. Independent audit of the account, both verifiers, the forwarder and factory.
3. Funded end-to-end drills with real wallets and a recovery exercise.
4. Mainnet only after all three. Follow EIP-8141 and EIP-8164 and add an adapter
   when either ships.

### Then: native routes on other chains

Add an executable route only where the chain itself supports one and a wallet
can sign it. First candidates, each to be verified against the live network
before any claim: Algorand rekey to Falcon, Aptos authentication-key rotation,
Stellar's staged migration. Solana and Stellar vaults stay research prototypes.

## What we will not do

- Promise one wrapper that makes every wallet quantum-safe.
- Move real funds through unaudited contracts.
- Call a prepared or transitional route "protected".
- Quote a date for a quantum attack.

## How to help

A failing test is the most useful contribution. See
[CONTRIBUTING.md](../CONTRIBUTING.md). Wallets and custodians who want an
exposure report on their own addresses can ask at
[pqweave.com/partners](https://www.pqweave.com/partners).
