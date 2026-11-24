import type { RiskLevel } from '../scanner/index.js';

const MICRO_PER_ALGO = 1_000_000n;
const CRITICAL_MICRO = 10_000n * MICRO_PER_ALGO; // 10,000 ALGO
const DEFAULT_API = 'https://mainnet-api.algonode.cloud';
// Native Falcon and Ed25519 accounts share the same 58-character format.
const ALGO_ADDRESS = /^[A-Z2-7]{58}$/;

export interface AlgorandScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** Conservative exposure flag; the signing scheme cannot be inferred from address text. */
  exposed: boolean;
  /** Current authorized address, if the account has been rekeyed. */
  authorizationAddress?: string;
  /** This scanner has not verified whether the active signer is Ed25519 or Falcon. */
  currentAuthority: 'rekeyed-unknown' | 'unknown';
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

export function assessAlgorandRisk(
  address: string,
  micro: bigint,
  authorizationAddress?: string,
): AlgorandScanResult {
  const reasons = [
    'Algorand supports native Falcon-1024 accounts. Address format alone cannot identify the active signing scheme.',
  ];
  if (authorizationAddress)
    reasons.push(
      `Rekeyed to ${authorizationAddress}; the signer scheme is not verified by this scan.`,
    );
  let score: number;
  if (micro >= CRITICAL_MICRO) {
    score = 65;
    reasons.push(
      'Large balance. Verify its active signer before treating it as exposed or protected.',
    );
  } else if (micro > 0n) {
    score = 40;
    reasons.push('Balance at risk if a classical Ed25519 key still authorizes spending.');
  } else {
    score = 15;
    reasons.push('No balance at risk now. Verify signing authority before future deposits.');
  }
  return {
    address,
    chain: 'Algorand',
    symbol: 'ALGO',
    exposed: true,
    ...(authorizationAddress ? { authorizationAddress } : {}),
    currentAuthority: authorizationAddress ? 'rekeyed-unknown' : 'unknown',
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
  const json = (await response.json()) as { amount?: number; 'auth-addr'?: string };
  return assessAlgorandRisk(account, BigInt(json.amount ?? 0), json['auth-addr']);
}
