/** A read-only migration plan. This module never creates a signature or moves funds. */
export type MigrationOutcome =
  | 'protected'
  | 'transitional'
  | 'custody-change'
  | 'prepared'
  | 'unsupported';

export type RouteAvailability = 'native' | 'testnet' | 'watch-only' | 'research';

export interface MigrationKitInput {
  chain: string;
  address: string;
  /** Historical exposure and present signing authority are separate facts. */
  exposure: 'exposed' | 'hidden' | 'unknown';
  currentAuthority?: 'classical' | 'post-quantum' | 'rekeyed-unknown' | 'unknown';
  isContract?: boolean;
  knownAssets?: number;
}

export interface MigrationKitPlan {
  chain: string;
  address: string;
  route: string;
  outcome: MigrationOutcome;
  availability: RouteAvailability;
  summary: string;
  actions: string[];
  checks: string[];
  limitations: string[];
  source: string;
}

const EVM = new Set([
  'ethereum',
  'base',
  'arbitrum',
  'optimism',
  'polygon',
  'sepolia',
  'base-sepolia',
]);

/**
 * Select a route supported by current chain rules. The output is deliberately
 * conservative: an address scan does not prove signer access or asset coverage.
 */
export function planMigration(input: MigrationKitInput): MigrationKitPlan {
  const chain = input.chain.toLowerCase();
  const common = { chain: input.chain, address: input.address };

  if (EVM.has(chain)) {
    if (input.isContract) {
      return {
        ...common,
        route: 'Existing smart account review',
        outcome: 'prepared',
        availability: 'watch-only',
        summary:
          'This account has code. Its signing policy must be reviewed before any migration plan is made.',
        actions: [
          'Identify the account implementation and every authorized signer.',
          'Inventory assets, approvals, positions, and inbound payment routes.',
        ],
        checks: ['Verify whether any classical key can still change the account policy.'],
        limitations: ['An address scan cannot establish the safety of arbitrary account code.'],
        source: 'https://pq.ethereum.org/',
      };
    }
    return {
      ...common,
      route: 'Sweep to a sole-authority post-quantum smart account',
      outcome: 'protected',
      availability: 'testnet',
      summary:
        'A separate smart account can remove the old ECDSA key from its spending policy. PQWeave execution remains a testnet prototype pending independent audit.',
      actions: [
        'Inventory all assets and positions, including items this scan may miss.',
        'Generate and test a separate post-quantum key in a supported signer.',
        'Simulate a bounded sweep, sign in the existing wallet, then reconcile balances and test the destination signer.',
      ],
      checks: [
        'Prove destination control before sending.',
        'Confirm no ECDSA owner or recovery path can override the post-quantum key.',
        'Review omitted assets and gas requirements.',
      ],
      limitations: [
        'EIP-7702 hardening of the original EOA remains revocable by its ECDSA key.',
        'The current PQWeave contracts are unaudited and should not secure real funds.',
      ],
      source: 'https://eips.ethereum.org/EIPS/eip-7702',
    };
  }

  if (chain === 'algorand') {
    const pqAuthority = input.currentAuthority === 'post-quantum';
    return {
      ...common,
      route: pqAuthority
        ? 'Verify existing Falcon authority'
        : 'Native Falcon-1024 account or rekey',
      outcome: 'protected',
      availability: 'native',
      summary: pqAuthority
        ? 'A post-quantum authority is reported; verify it with the wallet and a signed transaction.'
        : 'Algorand supports native Falcon-1024 accounts and rekeying an existing account to one while keeping its address.',
      actions: pqAuthority
        ? ['Confirm the current authorization and test a Falcon-signed transaction.']
        : [
            'Check that your wallet and applications support Falcon signing.',
            'Generate and back up a Falcon account with supported wallet tooling.',
            'Rekey with the existing signer, then test a Falcon-signed transaction.',
          ],
      checks: [
        'Verify the authorized address and scheme on chain.',
        'Confirm backup and recovery before rekeying.',
        'Confirm the account will not be closed out and later recreated under its old key.',
      ],
      limitations: [
        'A 58-character address does not identify its signing scheme.',
        'Unsupported wallets or applications may be unusable after rekeying.',
      ],
      source: 'https://dev.algorand.co/concepts/accounts/post-quantum/',
    };
  }

  if (chain === 'bitcoin' || chain === 'litecoin' || chain === 'dogecoin') {
    return {
      ...common,
      route: 'Watch-only UTXO inventory and evacuation plan',
      outcome: 'transitional',
      availability: 'watch-only',
      summary:
        'A fresh unused address can reduce long exposure, but current mainnet rules do not provide a full post-quantum signature migration.',
      actions: [
        'Inventory UTXOs from a watch-only descriptor or xpub.',
        'Prepare an unsigned PSBT for an independently verified fresh destination.',
        'Sign with your own wallet or hardware device and verify the result.',
      ],
      checks: [
        'Verify destination ownership, fees, change handling, and every input.',
        'Check proposal activation before considering a new output type.',
      ],
      limitations: [
        'A later spend can reveal a classical public key.',
        'BIP-360 and BIP-361 are drafts; no mainnet P2MR destination should be used before activation.',
      ],
      source: 'https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki',
    };
  }

  if (chain === 'solana' || chain === 'stellar') {
    return {
      ...common,
      route: 'Program-controlled vault research pilot',
      outcome: 'custody-change',
      availability: 'research',
      summary:
        'Funds can move to a program or contract that checks a post-quantum signature, changing the custody and recovery model.',
      actions: [
        'Inventory supported assets and vault constraints.',
        'Use testnet or devnet to test deposit, withdrawal, recovery, and failure paths.',
      ],
      checks: [
        'Review program security and upgrade authority.',
        'Verify the original wallet remains classical and exposed.',
      ],
      limitations: [
        'The repository vaults are unaudited prototypes.',
        'This does not convert the original wallet to a post-quantum signer.',
      ],
      source: 'https://pq.ethereum.org/',
    };
  }

  return {
    ...common,
    route: 'Chain capability assessment',
    outcome: 'prepared',
    availability: 'watch-only',
    summary:
      'No verified post-quantum asset-moving route is available in this kit for this chain and signer.',
    actions: [
      'Record current signing authority and asset inventory.',
      'Monitor protocol and wallet support before scheduling migration.',
    ],
    checks: ['Do not assume moving to a new classical key gives permanent protection.'],
    limitations: ['Chain-specific capabilities and wallet support require further verification.'],
    source:
      'https://csrc.nist.gov/Projects/Post-Quantum-Cryptography/Post_Quantum_Cryptography-Standardization',
  };
}
