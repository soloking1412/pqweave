import type { RiskLevel } from '../scanner/index.js';

const MICRO_PER_ALGO = 1_000_000n;
const CRITICAL_MICRO = 10_000n * MICRO_PER_ALGO; // 10,000 ALGO
const DEFAULT_API = 'https://mainnet-api.algonode.cloud';
// An Algorand address is 58 base32 characters (Ed25519 public key + checksum).
const ALGO_ADDRESS = /^[A-Z2-7]{58}$/;

export interface AlgorandScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** Always true: an Algorand address is its Ed25519 public key. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface AlgorandScanOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isAlgorandAddress(address: string): boolean {
  return ALGO_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatAlgo(micro: bigint): string {
  const whole = micro / MICRO_PER_ALGO;
  const frac = (micro % MICRO_PER_ALGO).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessAlgorandRisk(address: string, micro: bigint): AlgorandScanResult {
  const reasons = [
    'An Algorand address is its own Ed25519 public key, so it is exposed from creation — before any transaction.',
  ];
  let score: number;
  if (micro >= CRITICAL_MICRO) {
    score = 90;
    reasons.push(
      'Significant balance is permanently exposed; protection needs a protocol-level fix.',
    );
  } else if (micro > 0n) {
    score = 70;
    reasons.push('Balance is permanently exposed to a future quantum attacker.');
  } else {
    score = 30;
    reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
  }
  return {
    address,
    chain: 'Algorand',
    symbol: 'ALGO',
    exposed: true,
    balance: formatAlgo(micro),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/** Scan an Algorand address for quantum exposure via the algod REST API. */
export async function scanAlgorandAddress(
  address: string,
  options: AlgorandScanOptions = {},
): Promise<AlgorandScanResult> {
  const account = address.trim();
  if (!isAlgorandAddress(account)) throw new Error('unrecognized Algorand address');
  const apiUrl = options.apiUrl ?? DEFAULT_API;
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(`${apiUrl}/v2/accounts/${account}`);
  if (response.status === 404) return assessAlgorandRisk(account, 0n);
  if (!response.ok) throw new Error('failed to fetch Algorand account');
  const json = (await response.json()) as { amount?: number };
  return assessAlgorandRisk(account, BigInt(json.amount ?? 0));
}
