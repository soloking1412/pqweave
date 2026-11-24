import * as btc from '@scure/btc-signer';
import { decodeP2mrAddress } from './p2mr.js';
import { BITCOIN, type UtxoNetwork } from './networks.js';
import type { UtxoAddressType } from './types.js';

// Base58Check body charset (excludes 0, O, I, l).
const BASE58 = '[1-9A-HJ-NP-Za-km-z]';
// Bech32 / Bech32m data charset (excludes 1, b, i, o).
const BECH32 = '[02-9ac-hj-np-z]';

/**
 * Classify a UTXO address by output type from its encoding. The type determines
 * quantum exposure: Taproot (P2TR) reveals the public key in the output itself,
 * while hash-based types (P2PKH, P2WPKH) hide it until the first spend.
 */
export function classifyUtxoAddress(
  address: string,
  network: UtxoNetwork = BITCOIN,
): UtxoAddressType {
  const a = address.trim();
  const lower = a.toLowerCase();

  if (network.id === 'bitcoin') {
    const decodedP2mr = decodeP2mrAddress(a);
    if (decodedP2mr) return 'p2mr';
    for (const candidate of [
      btc.NETWORK,
      btc.TEST_NETWORK,
      { ...btc.TEST_NETWORK, bech32: 'bcrt' },
    ]) {
      try {
        const decoded = btc.Address(candidate).decode(a);
        if (!decoded) continue;
        switch (decoded.type) {
          case 'pkh':
            return 'p2pkh';
          case 'sh':
            return 'p2sh';
          case 'wpkh':
            return 'p2wpkh';
          case 'wsh':
            return 'p2wsh';
          case 'tr':
            return 'p2tr';
          default:
            return 'unknown';
        }
      } catch {
        // Try the next Bitcoin address network.
      }
    }
    return 'unknown';
  }

  if (network.bech32Hrps.length > 0) {
    const hrpAlternation = network.bech32Hrps.join('|');
    if (new RegExp(`^(${hrpAlternation})${BECH32}+$`).test(lower)) {
      for (const hrp of network.bech32Hrps) {
        if (!lower.startsWith(hrp)) continue;
        const witnessChar = lower[hrp.length];
        // bech32m encodes the witness version as its first data character:
        // q = v0, p = v1 (Taproot), z = v2 (BIP-360 P2MR).
        const body = lower.slice(hrp.length);
        if (network.taproot && witnessChar === 'p') return 'p2tr';
        if (witnessChar === 'q') {
          // Witness v0: 20-byte program (P2WPKH) vs 32-byte program (P2WSH).
          return body.length <= 39 ? 'p2wpkh' : 'p2wsh';
        }
        if (witnessChar === 'z') {
          // P2MR commits to a 32-byte Merkle root; any other length is not P2MR.
          return body.length > 39 ? 'p2mr' : 'unknown';
        }
        return 'unknown';
      }
    }
  }

  if (new RegExp(`^[${network.base58P2pkh.join('')}]${BASE58}{24,34}$`).test(a)) return 'p2pkh';
  if (new RegExp(`^[${network.base58P2sh.join('')}]${BASE58}{24,34}$`).test(a)) return 'p2sh';
  return 'unknown';
}

export function isUtxoAddress(address: string, network: UtxoNetwork = BITCOIN): boolean {
  return classifyUtxoAddress(address, network) !== 'unknown';
}

export function classifyBitcoinAddress(address: string): UtxoAddressType {
  return classifyUtxoAddress(address, BITCOIN);
}

export function isBitcoinAddress(address: string): boolean {
  return isUtxoAddress(address, BITCOIN);
}

/** The encoded Bitcoin network, validated by its checksum and version bytes. */
export function bitcoinAddressNetwork(address: string): 'bitcoin' | 'testnet' | 'regtest' | null {
  const clean = address.trim();
  const p2mr = decodeP2mrAddress(clean);
  if (p2mr)
    return p2mr.network === 'bitcoin'
      ? 'bitcoin'
      : p2mr.network === 'regtest'
        ? 'regtest'
        : 'testnet';
  for (const [name, candidate] of [
    ['bitcoin', btc.NETWORK],
    ['testnet', btc.TEST_NETWORK],
    ['regtest', { ...btc.TEST_NETWORK, bech32: 'bcrt' }],
  ] as const) {
    try {
      const decoded = btc.Address(candidate).decode(clean);
      if (!decoded) continue;
      return name;
    } catch {
      // Wrong checksum or another network.
    }
  }
  return null;
}

export function isBitcoinAddressOnNetwork(
  address: string,
  network: 'bitcoin' | 'testnet',
): boolean {
  return bitcoinAddressNetwork(address) === network;
}
