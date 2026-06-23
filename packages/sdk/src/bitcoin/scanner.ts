import { classifyUtxoAddress } from './address.js';
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
  const hasSpent = stats.chain_stats.spent_txo_count > 0;
  // Taproot key-path reveals the public key in the output itself; other types
  // reveal it only once the address has been spent from.
  const exposed = type === 'p2tr' || hasSpent;
  const balanceSats =
    BigInt(stats.chain_stats.funded_txo_sum) - BigInt(stats.chain_stats.spent_txo_sum);
  return {
    address,
    network: network.id,
    type,
    exposed,
    hasSpent,
    txCount: stats.chain_stats.tx_count,
    balanceSats,
  };
}

export function assessUtxoRisk(exposure: UtxoExposureResult, symbol: string): UtxoRiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (!exposure.exposed) {
    reasons.push('Public key not yet revealed; the address has not been spent from.');
    score = exposure.balanceSats > 0n ? 12 : 5;
    if (exposure.balanceSats > 0n) {
      reasons.push('Funds are safe until the first spend reveals the public key.');
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

export interface UtxoScanOptions {
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
  const apiUrl = options.apiUrl ?? network.apiUrl;
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${apiUrl}/address/${address}`);
  if (!response.ok) throw new Error(`failed to fetch ${network.name} address stats`);
  const stats = (await response.json()) as EsploraAddressStats;
  return assessUtxoRisk(assessUtxoExposure(address, network, stats), network.symbol);
}

/** Convenience wrapper for Bitcoin. */
export function scanBitcoinAddress(
  address: string,
  options: UtxoScanOptions = {},
): Promise<UtxoRiskAssessment> {
  return scanUtxoAddress(address, BITCOIN, options);
}
