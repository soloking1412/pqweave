/**
 * Per-chain coverage on two independent axes.
 *
 * Scanning and protecting are different problems, and collapsing them into one
 * "coming soon" badge hides the interesting part: *what shape* of protection a
 * chain can even have. That is fixed by how the chain exposes public keys, not
 * by our roadmap — so the work in flight is derived from the exposure family
 * rather than promised per chain.
 */

/** How a chain leaks its public key. Determines what protection is possible. */
export type ExposureFamily = 'recoverable' | 'first-spend' | 'address-is-key';

/** Whether the exposure scanner runs against this chain today. */
export type ScanStatus = 'live' | 'building';

/**
 * The protection shipped for this chain, or the one being built for it.
 *
 * - `migrate`  — move to a post-quantum account. Only possible where a contract
 *                layer can enforce a PQ signature, i.e. EVM.
 * - `evacuate` — pre-signed sweeps to a fresh address. Transitional: it shortens
 *                the reaction window, it does not make the chain quantum-safe.
 * - `vault`    — custody behind a PQ-gated program. Not in-place migration; the
 *                original address stays exposed.
 * - `building` — the above is the right shape for this chain and is in progress.
 */
export type ProtectionKind = 'migrate' | 'evacuate' | 'vault' | 'building';

export interface DirectoryChain {
  name: string;
  ticker: string;
  scan: ScanStatus;
  protection: ProtectionKind;
  exposure: ExposureFamily;
  /** Signature scheme, shown as the technical sub-label. */
  scheme: string;
  accent: string;
  /** What exists today, or what is being built. Kept factual. */
  note: string;
}

/** What each protection kind is called and how much it actually claims. */
export const PROTECTION_LABEL: Record<ProtectionKind, string> = {
  migrate: 'Migration',
  evacuate: 'Evacuation kit',
  vault: 'PQ vault',
  building: 'In development',
};

/** The honest ceiling for each exposure family, stated once. */
export const EXPOSURE_CEILING: Record<ExposureFamily, string> = {
  recoverable:
    'The public key is recoverable from any signature, so exposure starts at the first transaction. A contract layer can enforce a post-quantum signature, which makes a genuine quantum-safe migration possible.',
  'first-spend':
    'The address is a hash, so the key stays hidden until the first spend. Moving to a fresh address defers exposure but never removes it — a permanent fix has to come from the protocol.',
  'address-is-key':
    'The address is the public key, so it is exposed the moment it exists. Nothing at the application layer can migrate it; custody behind a post-quantum gate is the only honest option.',
};

/**
 * What is being built for a chain without shipped protection. The exposure
 * family fixes the answer — a first-spend chain gets Bitcoin's evacuation kit,
 * an address-is-the-key chain gets Solana and Stellar's vault — so this is a
 * consequence of the cryptography rather than a roadmap promise.
 */
export const PLANNED_KIND: Record<ExposureFamily, Exclude<ProtectionKind, 'building'>> = {
  recoverable: 'migrate',
  'first-spend': 'evacuate',
  'address-is-key': 'vault',
};

/** Where the pattern being ported came from, for the "building" footnote. */
export const PLANNED_PRECEDENT: Record<ExposureFamily, string> = {
  recoverable: 'porting the EVM path',
  'first-spend': 'porting Bitcoin’s kit',
  'address-is-key': 'porting the vault',
};

export const DIRECTORY_CHAINS: DirectoryChain[] = [
  {
    name: 'Ethereum & EVM',
    ticker: 'EVM',
    scan: 'live',
    protection: 'migrate',
    exposure: 'recoverable',
    scheme: 'ECDSA secp256k1',
    accent: '#8a93ff',
    note: 'One-transaction sweep into a post-quantum account, or harden in place via EIP-7702.',
  },
  {
    name: 'Bitcoin',
    ticker: 'BTC',
    scan: 'live',
    protection: 'evacuate',
    exposure: 'first-spend',
    scheme: 'ECDSA / Schnorr',
    accent: '#f7931a',
    note: 'Watch-only PSBT sweeps, whole-wallet xpub scanning, on-chain key attestation, BIP-360/361 tracking.',
  },
  {
    name: 'Solana',
    ticker: 'SOL',
    scan: 'live',
    protection: 'vault',
    exposure: 'address-is-key',
    scheme: 'Ed25519',
    accent: '#19fb9b',
    note: 'Vault program live on devnet. Hash-based signature verified on-chain, one-time leaf enforced.',
  },
  {
    name: 'Stellar',
    ticker: 'XLM',
    scan: 'live',
    protection: 'vault',
    exposure: 'address-is-key',
    scheme: 'Ed25519',
    accent: '#dce2ea',
    note: 'Soroban custom-account vault uploaded to testnet. Verification fits in one transaction.',
  },
  {
    name: 'Litecoin',
    ticker: 'LTC',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'ECDSA secp256k1',
    accent: '#a3b1c2',
    note: 'Shares Bitcoin’s UTXO model, so the evacuation kit ports directly.',
  },
  {
    name: 'Dogecoin',
    ticker: 'DOGE',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'ECDSA secp256k1',
    accent: '#c2a633',
    note: 'UTXO chain; the same watch-only sweep applies.',
  },
  {
    name: 'Cardano',
    ticker: 'ADA',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'Ed25519',
    accent: '#4a78e0',
    note: 'Key stays behind a hash until first spend, so evacuation is the right shape.',
  },
  {
    name: 'Cosmos',
    ticker: 'ATOM',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'ECDSA secp256k1',
    accent: '#7c87f8',
    note: 'Account key revealed on the first signature; evacuation path in design.',
  },
  {
    name: 'XRP Ledger',
    ticker: 'XRP',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'Ed25519 / secp256k1',
    accent: '#c9cdd3',
    note: 'Key revealed on the first send, which is the oldest transaction — the scanner reads forward for it.',
  },
  {
    name: 'Aptos',
    ticker: 'APT',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'Ed25519',
    accent: '#3ad6b0',
    note: 'Address is a hash of the key until the account transacts.',
  },
  {
    name: 'Sui',
    ticker: 'SUI',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'Ed25519',
    accent: '#4da2ff',
    note: 'Key revealed once the account sends, so the same watch-only sweep applies.',
  },
  {
    name: 'TON',
    ticker: 'TON',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'Ed25519',
    accent: '#4aa8ef',
    note: 'The wallet contract publishes its key on deployment.',
  },
  {
    name: 'Tron',
    ticker: 'TRX',
    scan: 'live',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'ECDSA secp256k1',
    accent: '#ff5b5b',
    note: 'Key revealed on the first signed transaction.',
  },
  {
    name: 'NEAR',
    ticker: 'NEAR',
    scan: 'live',
    protection: 'building',
    exposure: 'address-is-key',
    scheme: 'Ed25519',
    accent: '#36f097',
    note: 'Implicit accounts are the public key itself; a vault is the only honest fix.',
  },
  {
    name: 'Algorand',
    ticker: 'ALGO',
    scan: 'live',
    protection: 'building',
    exposure: 'address-is-key',
    scheme: 'Ed25519',
    accent: '#d7dde3',
    note: 'Address encodes the key directly, so exposure is permanent from creation.',
  },
  {
    name: 'Polkadot',
    ticker: 'DOT',
    scan: 'live',
    protection: 'building',
    exposure: 'address-is-key',
    scheme: 'sr25519',
    accent: '#e6007a',
    note: 'SS58 addresses encode the public key; exposure is structural.',
  },
  {
    name: 'Bitcoin Cash',
    ticker: 'BCH',
    scan: 'building',
    protection: 'building',
    exposure: 'first-spend',
    scheme: 'ECDSA secp256k1',
    accent: '#0ac18e',
    note: 'Scanner is written; blocked on a public indexer that is not rate-walled.',
  },
];

export const LIVE_CHAIN_COUNT = DIRECTORY_CHAINS.filter((c) => c.scan === 'live').length;

/** Chains with a protection path shipped, however limited. */
export const PROTECTED_CHAIN_COUNT = DIRECTORY_CHAINS.filter(
  (c) => c.protection !== 'building',
).length;
