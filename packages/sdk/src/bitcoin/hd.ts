import * as btc from '@scure/btc-signer';
import { base58check } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha2';

/**
 * Derive addresses from an extended public key (xpub / ypub / zpub) so a user
 * can scan a whole watch-only wallet, not one address at a time. Public keys
 * only — this module cannot spend and never touches a private key.
 *
 * ypub/zpub differ from xpub only in their 4-byte version prefix (they signal
 * the intended script type). We normalize any of them to an xpub for @scure/bip32,
 * then encode addresses in the script type the prefix implies.
 */

type ScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr';

// version bytes → script type. Mainnet + testnet variants.
const VERSION_SCRIPT: Record<string, ScriptType> = {
  '0488b21e': 'p2pkh', // xpub
  '049d7cb2': 'p2sh-p2wpkh', // ypub
  '04b24746': 'p2wpkh', // zpub
  '043587cf': 'p2pkh', // tpub (testnet)
  '044a5262': 'p2sh-p2wpkh', // upub (testnet)
  '045f1cf6': 'p2wpkh', // vpub (testnet)
};
const XPUB_VERSION = '0488b21e';
const TPUB_VERSION = '043587cf';
const TESTNET_VERSIONS = new Set(['043587cf', '044a5262', '045f1cf6']);

export interface ParsedXpub {
  scriptType: ScriptType;
  testnet: boolean;
  hdKey: HDKey;
}

/**
 * Parse and normalize an extended public key. Rewrites the version bytes to a
 * plain xpub/tpub so @scure/bip32 accepts it, and records the script type the
 * original prefix implied.
 */
export function parseExtendedKey(extendedKey: string): ParsedXpub {
  const raw = base58check(sha256).decode(extendedKey.trim());
  const version = bytesToHex4(raw.subarray(0, 4));
  const scriptType = VERSION_SCRIPT[version];
  if (!scriptType) throw new Error('unrecognized extended public key prefix');
  const testnet = TESTNET_VERSIONS.has(version);

  const normalized = new Uint8Array(raw);
  const target = testnet ? TPUB_VERSION : XPUB_VERSION;
  normalized.set(hex4ToBytes(target), 0);
  const hdKey = HDKey.fromExtendedKey(base58check(sha256).encode(normalized));
  return { scriptType, testnet, hdKey };
}

function bytesToHex4(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
function hex4ToBytes(h: string): Uint8Array {
  return Uint8Array.from(h.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}

function encodeAddress(pubkey: Uint8Array, scriptType: ScriptType, testnet: boolean): string {
  const network = testnet ? btc.TEST_NETWORK : btc.NETWORK;
  switch (scriptType) {
    case 'p2pkh':
      return btc.p2pkh(pubkey, network).address!;
    case 'p2sh-p2wpkh':
      return btc.p2sh(btc.p2wpkh(pubkey, network), network).address!;
    case 'p2wpkh':
      return btc.p2wpkh(pubkey, network).address!;
    case 'p2tr':
      return btc.p2tr(pubkey, undefined, network).address!;
  }
}

/**
 * Where an extended key sits in its wallet's tree. Both values are shown by
 * every wallet that exports an xpub (Sparrow, Coldcard, Trezor, Ledger Live).
 * They are required to build the `bip32Derivation` field a hardware wallet uses
 * to recognize which of its keys signs an input — without them a device has
 * nothing to match against and will refuse to sign.
 */
export interface KeyOrigin {
  /** Master key fingerprint, 8 hex characters, e.g. "73c5da0a". */
  masterFingerprint: string;
  /** Account-level path the extended key was exported at, e.g. "m/84'/0'/0'". */
  accountPath: string;
}

const HARDENED = 0x80000000;

/**
 * Parse a BIP-32 path ("m/84'/0'/0'" or "84h/0h/0h") into raw path components,
 * applying the hardened bit. Throws rather than guessing, because a wrong path
 * silently produces a PSBT no device will sign.
 */
export function parseDerivationPath(path: string): number[] {
  const trimmed = path.trim().replace(/^m\//i, '').replace(/^m$/i, '');
  if (trimmed === '') return [];
  return trimmed.split('/').map((part) => {
    const hardened = /['h]$/i.test(part);
    const raw = hardened ? part.slice(0, -1) : part;
    if (!/^\d+$/.test(raw)) throw new Error(`invalid derivation path segment: ${part}`);
    const value = Number(raw);
    if (value >= HARDENED) throw new Error(`derivation index out of range: ${part}`);
    return hardened ? value + HARDENED : value;
  });
}

/** Render path components back to a readable path, e.g. "m/84'/0'/0'/0/3". */
export function formatDerivationPath(components: number[]): string {
  const parts = components.map((c) => (c >= HARDENED ? `${c - HARDENED}'` : String(c)));
  return ['m', ...parts].join('/');
}

/** Validate and normalize an 8-hex-character master fingerprint. */
export function parseMasterFingerprint(fingerprint: string): number {
  const clean = fingerprint.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(clean)) {
    throw new Error('master fingerprint must be 8 hex characters');
  }
  // PSBT stores the fingerprint as the big-endian u32 the wallet displays.
  return Number.parseInt(clean, 16);
}

export interface DerivedAddress {
  address: string;
  /** Relative path from the account key, e.g. "0/3" (chain/index). */
  path: string;
  chain: 'receive' | 'change';
  index: number;
  /** 33-byte compressed public key controlling this address. */
  pubkey: Uint8Array;
  /**
   * Full BIP-32 path components (account prefix + chain + index) when a
   * {@link KeyOrigin} was supplied. Undefined otherwise, which means the
   * resulting PSBT input cannot carry `bip32Derivation`.
   */
  pathComponents?: number[];
  /** Master fingerprint from the origin, if provided. */
  masterFingerprint?: string;
}

export interface DeriveAddressOptions {
  /** Addresses to derive per chain before the gap-limit check. */
  gapLimit?: number;
  /** Hard cap on addresses per chain, regardless of gap. */
  maxPerChain?: number;
  /** Wallet origin, needed for hardware-signable PSBTs. */
  origin?: KeyOrigin;
  /** Restrict derivation to one chain (used by the resumable wallet scan). */
  chains?: ('receive' | 'change')[];
  /** Start index, so a scan can continue past the first window. */
  startIndex?: number;
}

/**
 * Derive receive (0/*) and change (1/*) addresses from a parsed account key.
 * Returns the full requested window; the caller checks on-chain usage and applies
 * the gap limit (stop after `gapLimit` consecutive unused). We derive up to
 * `maxPerChain` so the caller can decide where the wallet ends.
 */
export function deriveAddresses(
  parsed: ParsedXpub,
  options: DeriveAddressOptions = {},
): DerivedAddress[] {
  const maxPerChain = options.maxPerChain ?? 25;
  const startIndex = options.startIndex ?? 0;
  const wanted = options.chains ?? ['receive', 'change'];
  const accountPrefix = options.origin ? parseDerivationPath(options.origin.accountPath) : null;

  const out: DerivedAddress[] = [];
  for (const [chain, chainIndex] of [
    ['receive', 0],
    ['change', 1],
  ] as const) {
    if (!wanted.includes(chain)) continue;
    const branch = parsed.hdKey.deriveChild(chainIndex);
    for (let index = startIndex; index < startIndex + maxPerChain; index++) {
      const child = branch.deriveChild(index);
      if (!child.publicKey) continue;
      out.push({
        address: encodeAddress(child.publicKey, parsed.scriptType, parsed.testnet),
        path: `${chainIndex}/${index}`,
        chain,
        index,
        pubkey: child.publicKey,
        ...(accountPrefix
          ? {
              pathComponents: [...accountPrefix, chainIndex, index],
              masterFingerprint: options.origin!.masterFingerprint,
            }
          : {}),
      });
    }
  }
  return out;
}

/** True if the string looks like an extended public key we can parse. */
export function isExtendedKey(value: string): boolean {
  return /^(x|y|z|t|u|v)pub[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(value.trim());
}
