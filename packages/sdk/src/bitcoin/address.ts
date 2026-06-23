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

  if (network.bech32Hrps.length > 0) {
    const hrpAlternation = network.bech32Hrps.join('|');
    if (new RegExp(`^(${hrpAlternation})${BECH32}+$`).test(lower)) {
      for (const hrp of network.bech32Hrps) {
        if (!lower.startsWith(hrp)) continue;
        const witnessChar = lower[hrp.length];
        if (network.taproot && witnessChar === 'p') return 'p2tr';
        if (witnessChar === 'q') {
          // Witness v0: 20-byte program (P2WPKH) vs 32-byte program (P2WSH).
          return lower.slice(hrp.length).length <= 39 ? 'p2wpkh' : 'p2wsh';
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
