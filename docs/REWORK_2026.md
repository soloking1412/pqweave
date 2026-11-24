# PQWeave rework: post-quantum migration kit

Research, product decisions, and implementation status · 25 September 2026

## Implementation status

- **Shipped in this repository:** read-only `/kit` flow, SDK route selector,
  JSON plan export, and stateless `POST /api/kit` for batches of up to 50 public
  account records. The site now leads with chain-specific routes.
- **Corrected:** Algorand signer uncertainty and native rekey route, BIP-361
  Phase B rescue language, EIP-7702 revocability, and scanner claims about
  unverified smart-account protection.
- **Bitcoin/ETH first pass (25 Sep):** Bitcoin addresses now require valid
  checksums and matching networks; destination checks count unconfirmed
  activity; PSBTs reject duplicate inputs and a signed bundle whose unsigned
  transaction differs from the plan. The EVM sweep rejects ERC-20 transfers
  returning `false`; the site deploys and verifies the sole-authority account
  before sweeping, waits for receipts, and checks listed token balances after
  confirmation.
- **Verification:** 319 SDK tests; 77 local contract tests; 3 Base Sepolia
  fork tests against a public RPC; SDK and site type checks and production site
  build; browser smoke test of BTC/ETH pages, mobile widths, and bad-address
  rejection. No funded end-to-end wallet migration was performed.
- **Execution boundary:** asset-moving EVM and vault code remains unaudited.
  The web app gates execution by configured network and requires an explicit
  audit flag for mainnet. This flag is an operator control, not audit evidence.
- **Next:** funded signer/hardware-wallet drills, complete asset inventory
  (including NFTs and DeFi positions), transaction simulation, destination
  spend/recovery UI, full reconciliation and monitoring, institution approvals,
  and independent security review.

## Decision

Build **a wallet-embedded migration kit and institutional migration control plane**. Its common layer inventories assets and signing authority, selects a chain-supported path, prepares an inspectable transaction plan, verifies the result, and records evidence. The final protection mechanism must be chain-specific. Do not promise one cryptographic wrapper that makes every existing wallet quantum-safe.

The first customer is a wallet, custodian, or exchange that already has users and signing infrastructure. A public, watch-only scanner remains the acquisition and research surface. The kit must never ask for seed phrases or private keys. It should prepare plans for the customer's wallet or HSM to sign.

**Launch rule:** the current contracts and vaults are unaudited prototypes. Keep any asset-moving route on testnet until an independent review, reproducible end-to-end tests, recovery drills, and a constrained pilot are complete. A fast flow that moves assets into unaudited custom custody is not the most secure flow.

## What the latest evidence changes

| Finding                                                                                                                                                                                                                                                               | Evidence and status on 24 Sep 2026                                                                                                                                                                                                                                                        | Product consequence                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NIST has finalized ML-DSA and SLH-DSA; FN-DSA remains in development.                                                                                                                                                                                                 | [NIST PQC project](https://csrc.nist.gov/Projects/Post-Quantum-Cryptography/Post_Quantum_Cryptography-Standardization)                                                                                                                                                                    | Prefer standardized schemes when the chain can verify them. Keep verifier choice replaceable; do not claim the custom WOTS+ verifier is standardized or equivalent to Ethereum leanXMSS.                                                           |
| Google estimates ECDLP-256 could require under 1,200 logical qubits and under 500,000 physical qubits with specific hardware assumptions. This is a resource estimate, not a forecast of attack date.                                                                 | [Google Quantum AI, 31 Mar 2026](https://research.google/blog/safeguarding-cryptocurrency-by-disclosing-quantum-vulnerabilities-responsibly/)                                                                                                                                             | Prepare migration now; avoid a “Q-Day in year X” sales claim.                                                                                                                                                                                      |
| Ethereum's execution-layer plan centers on account abstraction and cryptographic agility. EIP-7702 exists; EIP-8141 and EIP-8164 are proposals. EIP-8164 would retire an EOA's ECDSA authority in place, but is not a shipped migration path.                         | [Ethereum PQ roadmap](https://pq.ethereum.org/), [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141), [EIP-8164](https://eips.ethereum.org/EIPS/eip-8164)                                                                            | Today, sweep into a separate sole-PQ-authority smart account for genuine account-level protection. Treat 7702 in-place hardening as transitional because its ECDSA key can change delegation. Keep an adapter slot for later native-key migration. |
| Algorand native Falcon-1024 accounts are live, and an existing account can rekey to one while retaining its address. Pera supports this. Rekeying can break unsupported wallet and dapp flows; closing and recreating an account restores the original authorization. | [Algorand PQ overview](https://algorand.co/technology/post-quantum), [developer migration guide](https://dev.algorand.co/concepts/accounts/post-quantum/), [Pera launch report](https://algorand.co/blog/pera-wallet-surpasses-1-million-post-quantum-resilient-transactions-on-algorand) | The repository's “Algorand cannot migrate” statement is wrong. Add a native rekey adapter after checking actual signer support and post-rekey transaction ability. Do not call a 58-character address Ed25519 merely from its format.              |
| BIP-360 and BIP-361 remain drafts. BIP-360 proposes P2MR against long exposure, without a post-quantum signature opcode. BIP-361's current Phase B describes a rescue protocol; older repo text describes a blanket freeze.                                           | [BIP-360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki), [BIP-361](https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki)                                                                                                                                      | Bitcoin is readiness and watch-only evacuation now. Never create a mainnet P2MR destination before activation. Do not tell users their coins will definitely freeze.                                                                               |
| Solana's existing wallet authority is Ed25519. This repo's program vault can protect deposited assets, but changes the custody model and has not been audited.                                                                                                        | [Local vault design](../SOLANA_VAULT.md)                                                                                                                                                                                                                                                  | Offer exposure inventory and an optional research pilot; no production “wallet migration” claim.                                                                                                                                                   |

**Adapter watch list:** [Sei SIP-5](https://github.com/sei-protocol/sips/blob/main/sips/sip-5.md) proposes an ML-DSA-44 binding and staged EVM-account migration, while the [Cosmos SDK upgrade notes](https://github.com/cosmos/cosmos-sdk/blob/main/UPGRADING.md) describe ML-DSA-65 user keys. These are ecosystem-specific capabilities; verify the exact network's activation and wallet support before adding either as an executable route. [Blockstream's Liquid deployment](https://blog.blockstream.com/blockstream-research-demonstrates-quantum-resistant-transaction-signing-on-liquid-using-simplicity-smart-contracts/) demonstrates a working PQ path on Liquid, not Bitcoin mainnet.

## Product boundaries

The common promise is **“one integration, the right migration path for each asset and chain.”** Outcomes must be explicit:

| Outcome        | Meaning                                                                                               | Current examples                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Protected      | Classical spend authority removed or made unable to override a PQ signer, under verified chain rules. | EVM sole-authority smart account after audited deployment; Algorand native Falcon account or verified rekey.   |
| Transitional   | Reduces exposure or reaction time, but a classical key still authorizes some path.                    | EIP-7702 guard on the old EOA; Bitcoin fresh unused address.                                                   |
| Custody change | Funds move under a contract/program with PQ verification and new contract risk.                       | Solana or Stellar vault prototype.                                                                             |
| Prepared       | Inventory, simulation, signer readiness, and a saved plan; no asset has moved.                        | Bitcoin watch-only PSBT; exchange fleet assessment.                                                            |
| Unsupported    | No safe route with the available signer, network, and asset type.                                     | Unsupported smart-contract positions, an exchange account with no withdrawal API, or an unactivated PQ output. |

Never equate “public key exposed” with “funds currently stealable,” or label a key rekeyed to a PQ authority as vulnerable based on its old address alone. Separate **historical exposure**, **current authorized signer**, **migration readiness**, and **residual risk** in every report.

## Customer journeys

### Individual user through an existing wallet

1. Wallet supplies public account identifiers and supported signing methods; kit inventories balances, tokens, NFTs, approvals, positions, and chains.
2. Kit shows what can be migrated, what cannot, and all fees/destination addresses. User can export the plan.
3. Wallet generates and backs up a new PQ key through its own secure signer. Kit proves a test signature and verifies the destination is controlled by that key before funds move.
4. User approves a small canary, then a bounded main transfer. Every signature is shown in the wallet with the exact target, chain, assets, and maximum value.
5. Kit verifies settlement, residual balances, allowances, and ability to spend from the destination; it issues a receipt and a follow-up list for remaining positions.

### Enterprise treasury or custodian

Inventory account fleets and contract dependencies; rank by value, public-key exposure, signer compatibility, and operational friction. Create approved waves, require separate proposer/approver roles, enforce destination allowlists and per-wave limits, and feed unsigned plans to existing HSM/MPC policy engines. Capture simulation, approvals, transaction hashes, and post-migration evidence. Reconcile inbound deposit addresses and third-party allowlists before decommissioning old accounts.

### Exchange

Treat exchange-owned deposit and hot/cold wallets as the target, not customers' exchange balances. Classify address reuse, unspent BTC outputs, EVM token contracts, pending deposits, withdrawal queues, and key-management topology. Run a shadow scan and test withdrawals before changing production signing. Ensure old deposit addresses remain monitored and new deposits are swept according to policy. Partner API must support bulk scans, resumable jobs, webhooks, and signed exportable reports.

## Kit architecture

```
Wallet / exchange / custodian signer
              │ public inventory + signed approval
              ▼
  PQWeave Migration Orchestrator
    1. Inventory and exposure evidence
    2. Capability registry (chain + account + signer + asset)
    3. Plan compiler and independent simulation
    4. Approval and policy checks
    5. Chain adapter creates unsigned payload
    6. Receipt verifier and continuous monitoring
              │
              ├─ EVM: audited sole-PQ smart account + sweep
              ├─ Algorand: native Falcon rekey / new account
              ├─ Bitcoin: PSBT to fresh supported address, readiness only
              └─ Solana/Stellar: research vault pilot, separate custody warning
```

**Adapter contract:** `discover → classify → checkCapabilities → prepare → simulate → signExternally → broadcastExternally → verify → reconcile`. Every adapter returns a machine-readable `outcome`, `confidence`, `unsupportedAssets`, `requiredSignerCapabilities`, `expectedFees`, `rollbackOrRecovery`, and `evidence`. The orchestrator must refuse an asset-moving plan if the destination authority cannot be verified, the plan omits known holdings without explicit acknowledgment, the network feature is inactive, or signing support is absent.

**Trust boundary:** the hosted service may see addresses and operational metadata. It must not see seed phrases, raw private keys, or unencrypted PQ keystores. Minimize retention; make self-hosting possible. The wallet/HSM signs, and the chain executes. The service's job is to produce inspectable plans and verify their effect, not to become a custodian.

**Cryptographic policy:** use existing chain-native PQ where available. For EVM before native PQ transactions, keep the custom verifier testnet-only until audited. Stateful one-time hash signatures require atomic leaf allocation across tabs, devices, retries, and restored backups; the current monotonic local signer is insufficient evidence for fleet production. Document rekey, key loss, signer compromise, verifier upgrade, and gas-sponsorship failure paths. Do not reuse one seed across independent chains merely for convenience unless derivation domains and recovery semantics have been independently reviewed.

## Scope and sequence

| Phase                     | Deliverable                                                                                                                                                | Exit condition                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Correctness           | Fix stale Algorand and BIP-361 claims; separate exposure from current authority in data model; publish source and status dates.                            | No UI claims that all address-is-key chains lack migration; no draft proposal shown as activated.                                 |
| 1 · Partner discovery     | Interview 10 wallets/custodians/exchanges; obtain 3 anonymized wallet inventories; record signer, recovery, and asset coverage requirements.               | At least 2 partners commit to a testnet integration or design review.                                                             |
| 2 · Read-only kit         | Capability registry, bulk inventory API, evidence receipts, policy preview, unsupported-asset manifest, embeddable risk UI.                                | Partners can run it without moving assets and reproduce the classification.                                                       |
| 3 · Safe execution pilots | EVM testnet sweep and Algorand testnet rekey adapter; Bitcoin PSBT as watch-only readiness. External signer interface, canary, simulation, reconciliation. | Independent review of money paths; end-to-end wallet and hardware-signer tests; successful restore and failed-transaction drills. |
| 4 · Limited production    | Audited, capped-value, opted-in EVM/Algorand partner pilot with incident runbook and monitoring.                                                           | Independent audit findings resolved, public scope stated, partner support and loss limits agreed.                                 |
| 5 · Expansion             | More EVM assets and networks, enterprise reporting, later protocol adapters.                                                                               | Demand and signer support proven; no “all wallets” milestone until actual chain capabilities exist.                               |

## Measures that decide whether to continue

- Coverage: percent of inventoried value and asset types with a verified route; **unknown** must be counted, never hidden.
- Safety: simulation agreement, destination-control proof rate, failed/aborted migration rate, post-migration signer test rate, unresolved residual balance.
- Speed: median time from inventory to approved plan and from signature to reconciled receipt, measured per chain and signer type.
- Adoption: partner testnet integrations, pilot wallets, completed waves, recurring exposure-report demand.
- Security: independent audit status, open critical findings, recovery-drill success, one-time-key collision incidents (target zero).

## Repository rework backlog

1. **Immediately correct docs and copy:** `README.md`, `CHAINS.md`, `LANDSCAPE.md`, home/scan/partners/security pages. Remove blanket Algorand impossibility, BIP-361 freeze certainty, and phrases that imply EIP-7702 in-place hardening is fully PQ safe.
2. **Model current authority:** extend scan results for Algorand rekey status and verified signer scheme; split historical exposure from present authorization. Do not infer Falcon or Ed25519 from address length. Introduce capability data per chain, wallet, and asset rather than a single exposure-family switch.
3. **EVM safety work:** audit factory/account/verifier/one-click sweep, verify token/NFT coverage and omitted positions, independent transaction simulation, external signer and recovery support, gas and counterfactual tests.
4. **Algorand adapter:** use official SDK and Pera flows; verify rekey destination, signer backup, fee calculation, transaction signing after rekey, and close-out hazard. Start testnet.
5. **Bitcoin kit:** keep PSBT watch-only and activation guards; remove “BIP-361 will freeze your coins” marketing; track proposal revisions and node activation status.
6. **Enterprise interface:** signed manifests, bulk jobs, approval policies, status webhooks, audit exports, resumable waves, and role separation.

## Research limitations and next checks

This is a protocol and product review, not a security audit, real-funds readiness certification, or proof that a specific wallet/HSM supports a scheme. BIP and EIP text can change. Verify chain activation and wallet capability at execution time. Validate all partner assumptions through interviews and testnet signing rather than extrapolating from public announcements.

The existing codebase is a useful starting point, not a production kit: [README](../README.md), [security model](../SECURITY.md), [Bitcoin audit scope](../packages/sdk/AUDIT.md). The commercial repository's existing positioning says distribution and audits are the bottleneck; that remains consistent with this plan.
