import { classifyUtxoAddress } from './address.js';
import { getAddressStats, type EsploraOptions } from './esplora.js';
import { BITCOIN, type UtxoNetwork } from './networks.js';
import type {
  EsploraAddressStats,
  RiskLevel,
  UtxoExposureResult,
  UtxoRiskAssessment,
} from './types.js';

const SATS_PER_COIN = 100_000_000n;
const CRITICAL_SATS = SATS_PER_COIN; // 1 coin

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatCoins(sats: bigint): string {
  const whole = sats / SATS_PER_COIN;
  const frac = (sats % SATS_PER_COIN).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessUtxoExposure(
  address: string,
  network: UtxoNetwork,
  stats: EsploraAddressStats,
): UtxoExposureResult {
  const type = classifyUtxoAddress(address, network);
  const hasSpent =
    stats.chain_stats.spent_txo_count > 0 || (stats.mempool_stats?.spent_txo_count ?? 0) > 0;
  // Taproot key-path reveals the public key in the output itself; other types
  // reveal it only once the address has been spent from. BIP-360 (P2MR) commits
  // to a script tree with no internal key, so funding it exposes nothing — that
  // is the whole point of the output type.
  const exposed = type === 'p2tr' || hasSpent;
  const balanceSats =
    BigInt(stats.chain_stats.funded_txo_sum) -
    BigInt(stats.chain_stats.spent_txo_sum) +
    BigInt(stats.mempool_stats?.funded_txo_sum ?? 0) -
    BigInt(stats.mempool_stats?.spent_txo_sum ?? 0);
  return {
    address,
    network: network.id,
    type,
    exposed,
    hasSpent,
    txCount: stats.chain_stats.tx_count + (stats.mempool_stats?.tx_count ?? 0),
    balanceSats,
  };
}

export function assessUtxoRisk(exposure: UtxoExposureResult, symbol: string): UtxoRiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (exposure.type === 'p2mr') {
    // BIP-360 output. No key is committed, so nothing is exposed — but the
    // proposal is still a draft, which is the more urgent fact for a holder.
    reasons.push(
      'BIP-360 (P2MR) output: it commits to a script tree with no public key, so there is nothing for a quantum attacker to recover from the output.',
      'BIP-360 is still a draft and is not active on any network. Under current consensus rules a witness v2 output is anyone-can-spend, so funds here are not protected by the network today.',
    );
    return {
      ...exposure,
      symbol,
      balance: formatCoins(exposure.balanceSats),
      score: exposure.balanceSats > 0n ? 95 : 20,
      level: exposure.balanceSats > 0n ? 'critical' : 'low',
      reasons,
    };
  }

  if (!exposure.exposed) {
    reasons.push('Public key not yet revealed; the address has not been spent from.');
    score = exposure.balanceSats > 0n ? 12 : 5;
    if (exposure.balanceSats > 0n) {
      reasons.push(
        'A first spend can reveal the public key; review short-range exposure before spending.',
      );
    }
  } else {
    reasons.push(
      exposure.type === 'p2tr'
        ? 'Taproot output exposes the public key directly.'
        : 'Public key is exposed: the address has been spent from.',
    );
    if (exposure.balanceSats >= CRITICAL_SATS) {
      score = 90;
      reasons.push('Significant balance at risk; move it to a fresh, unspent address.');
    } else if (exposure.balanceSats > 0n) {
      score = 70;
      reasons.push('Balance at risk; move it to a fresh, unspent address.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
    if (exposure.type === 'p2tr' && exposure.balanceSats > 0n) {
      reasons.push(
        'Move to a hash-based address type (native SegWit, bc1q…) — a fresh Taproot address would re-expose the key immediately.',
      );
    }
    if (exposure.balanceSats > 0n) {
      reasons.push(
        'Moving funds is transitional, not quantum-safe: the spend itself reveals the key in the mempool, and every later spend re-exposes it.',
      );
    }
  }

  return {
    ...exposure,
    symbol,
    balance: formatCoins(exposure.balanceSats),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

export interface UtxoScanOptions extends EsploraOptions {
  /** Override the network's default Esplora API base URL. */
  apiUrl?: string;
  /** Fetch implementation, for testing or custom transports. */
  fetchImpl?: typeof fetch;
}

/** Scan a UTXO-chain address for quantum exposure via an Esplora-compatible API. */
export async function scanUtxoAddress(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: UtxoScanOptions = {},
): Promise<UtxoRiskAssessment> {
  if (classifyUtxoAddress(address, network) === 'unknown') {
    throw new Error(`unrecognized ${network.name} address`);
  }
  const stats = await getAddressStats(address, network, options);
  return assessUtxoRisk(assessUtxoExposure(address, network, stats), network.symbol);
}

/** Convenience wrapper for Bitcoin. */
export function scanBitcoinAddress(
  address: string,
  options: UtxoScanOptions = {},
): Promise<UtxoRiskAssessment> {
  return scanUtxoAddress(address, BITCOIN, options);
}
