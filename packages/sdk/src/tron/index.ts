import type { RiskLevel } from '../scanner/index.js';

const SUN_PER_TRX = 1_000_000n;
const CRITICAL_SUN = 50_000n * SUN_PER_TRX; // 50,000 TRX
const DEFAULT_API = 'https://api.trongrid.io';
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export interface TronScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** True once the account has signed a transaction, revealing its public key. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface TronScanOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isTronAddress(address: string): boolean {
  return TRON_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatUnits(base: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = base / unit;
  const frac = (base % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessTronRisk(address: string, exposed: boolean, sun: bigint): TronScanResult {
  const reasons: string[] = [];
  let score = 0;
  if (!exposed) {
    reasons.push('Public key not yet revealed; the account has not signed a transaction.');
    score = sun > 0n ? 12 : 5;
    if (sun > 0n) {
      reasons.push(
        'A first outgoing transaction can reveal the public key; review short-range exposure before signing.',
      );
    }
  } else {
    reasons.push(
      'Public key is exposed: Tron uses secp256k1, recoverable from any signed transaction.',
    );
    if (sun >= CRITICAL_SUN) {
      score = 90;
      reasons.push('Significant balance is exposed; move it to a fresh, never-used address.');
    } else if (sun > 0n) {
      score = 70;
      reasons.push('Balance is exposed; move it to a fresh, never-used address.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }
  return {
    address,
    chain: 'Tron',
    symbol: 'TRX',
    exposed,
    balance: formatUnits(sun, 6),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/**
 * Scan a Tron account for quantum exposure. Tron addresses are a hash of a
 * secp256k1 public key that is recoverable from any signed transaction, so a
 * single outgoing transaction is a definitive exposure signal (first-spend).
 */
export async function scanTronAddress(
  address: string,
  options: TronScanOptions = {},
): Promise<TronScanResult> {
  const account = address.trim();
  if (!isTronAddress(account)) throw new Error('unrecognized Tron address');
  const apiUrl = options.apiUrl ?? DEFAULT_API;
  const doFetch = options.fetchImpl ?? fetch;

  const accountResponse = await doFetch(`${apiUrl}/v1/accounts/${account}`);
  if (!accountResponse.ok) throw new Error('failed to fetch Tron account');
  const accountJson = (await accountResponse.json()) as { data?: { balance?: number }[] };
  const sun = BigInt((accountJson.data ?? [])[0]?.balance ?? 0);

  const txResponse = await doFetch(
    `${apiUrl}/v1/accounts/${account}/transactions?only_from=true&limit=1`,
  );
  if (!txResponse.ok) throw new Error('failed to fetch Tron transactions');
  const txJson = (await txResponse.json()) as { data?: unknown[] };
  const exposed = (txJson.data ?? []).length > 0;

  return assessTronRisk(account, exposed, sun);
}
