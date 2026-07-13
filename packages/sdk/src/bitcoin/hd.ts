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

export interface DerivedAddress {
  address: string;
  /** Relative path from the account key, e.g. "0/3" (chain/index). */
  path: string;
  chain: 'receive' | 'change';
  index: number;
}

export interface DeriveAddressOptions {
  /** Addresses to derive per chain before the gap-limit check. */
  gapLimit?: number;
  /** Hard cap on addresses per chain, regardless of gap. */
  maxPerChain?: number;
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
  const out: DerivedAddress[] = [];
  for (const [chain, chainIndex] of [
    ['receive', 0],
    ['change', 1],
  ] as const) {
    const branch = parsed.hdKey.deriveChild(chainIndex);
    for (let index = 0; index < maxPerChain; index++) {
      const child = branch.deriveChild(index);
      if (!child.publicKey) continue;
      out.push({
        address: encodeAddress(child.publicKey, parsed.scriptType, parsed.testnet),
        path: `${chainIndex}/${index}`,
        chain,
        index,
      });
    }
  }
  return out;
}

/** True if the string looks like an extended public key we can parse. */
export function isExtendedKey(value: string): boolean {
  return /^(x|y|z|t|u|v)pub[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(value.trim());
}
