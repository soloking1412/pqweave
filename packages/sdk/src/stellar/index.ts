import { withEndpointFailover } from '../endpoints.js';
import type { RiskLevel } from '../scanner/index.js';

const STROOPS_PER_XLM = 10_000_000n; // 7 decimals
const CRITICAL_STROOPS = 50_000n * STROOPS_PER_XLM; // 50,000 XLM
/** Tried in order; see `withEndpointFailover`. */
const DEFAULT_APIS = ['https://horizon.stellar.org', 'https://horizon.stellar.lobstr.co'] as const;
// A Stellar public key (G…) is 56 base32 characters.
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

export interface StellarScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** Always true: a Stellar address is its Ed25519 public key. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface StellarScanOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

/** Convert a Horizon balance string (e.g. "123.4500000") to stroops. */
function toStroops(balance: string): bigint {
  const [whole = '0', frac = ''] = balance.split('.');
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(frac.padEnd(7, '0').slice(0, 7));
}

function formatXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = (stroops % STROOPS_PER_XLM).toString().padStart(7, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessStellarRisk(address: string, stroops: bigint): StellarScanResult {
  const reasons = [
    'A Stellar address is its own Ed25519 public key, so it is exposed from creation — before any transaction.',
  ];
  let score: number;
  if (stroops >= CRITICAL_STROOPS) {
    score = 90;
    reasons.push(
      'Significant balance is permanently exposed; protection needs a protocol-level fix.',
    );
  } else if (stroops > 0n) {
    score = 70;
    reasons.push('Balance is permanently exposed to a future quantum attacker.');
  } else {
    score = 30;
    reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
  }
  return {
    address,
    chain: 'Stellar',
    symbol: 'XLM',
    exposed: true,
    balance: formatXlm(stroops),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/** Scan a Stellar address for quantum exposure via the Horizon API. */
async function scanStellarOnce(
  address: string,
  options: StellarScanOptions = {},
): Promise<StellarScanResult> {
  const account = address.trim();
  if (!isStellarAddress(account)) throw new Error('unrecognized Stellar address');
  const apiUrl = options.apiUrl ?? DEFAULT_APIS[0];
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(`${apiUrl}/accounts/${account}`);
  if (response.status === 404) return assessStellarRisk(account, 0n);
  if (!response.ok) throw new Error('failed to fetch Stellar account');
  const json = (await response.json()) as {
    balances?: { asset_type: string; balance: string }[];
  };
  const native = json.balances?.find((b) => b.asset_type === 'native');
  return assessStellarRisk(account, native ? toStroops(native.balance) : 0n);
}

export const scanStellarAddress = withEndpointFailover(scanStellarOnce, 'apiUrl', DEFAULT_APIS);
