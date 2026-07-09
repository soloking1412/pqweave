import type { RiskLevel } from '../scanner/index.js';

const KOINU_PER_DOGE = 100_000_000n;
const CRITICAL_KOINU = 100_000n * KOINU_PER_DOGE; // 100,000 DOGE
const DEFAULT_API = 'https://api.blockcypher.com/v1/doge/main';
// Dogecoin base58: P2PKH 'D', P2SH 'A' or '9'; 34 characters.
const DOGE_ADDRESS = /^[DA9][1-9A-HJ-NP-Za-km-z]{33}$/;

export interface DogecoinScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** True once the address has been spent from, revealing its public key. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface DogecoinScanOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isDogecoinAddress(address: string): boolean {
  return DOGE_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatCoins(koinu: bigint): string {
  const whole = koinu / KOINU_PER_DOGE;
  const frac = (koinu % KOINU_PER_DOGE).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessDogecoinRisk(
  address: string,
  exposed: boolean,
  koinu: bigint,
): DogecoinScanResult {
  const reasons: string[] = [];
  let score = 0;
  if (!exposed) {
    reasons.push('Public key not yet revealed; the address has not been spent from.');
    score = koinu > 0n ? 12 : 5;
    if (koinu > 0n) {
      reasons.push('Funds are safe until the first spend reveals the public key.');
    }
  } else {
    reasons.push('Public key is exposed: the address has been spent from.');
    if (koinu >= CRITICAL_KOINU) {
      score = 90;
      reasons.push('Significant balance at risk; move it to a fresh, unspent address.');
    } else if (koinu > 0n) {
      score = 70;
      reasons.push('Balance at risk; move it to a fresh, unspent address.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }
  return {
    address,
    chain: 'Dogecoin',
    symbol: 'DOGE',
    exposed,
    balance: formatCoins(koinu),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/**
 * Scan a Dogecoin address for quantum exposure. Dogecoin shares Bitcoin's UTXO
 * model: the secp256k1 public key is hidden behind the address hash until the
 * address is first spent from. Served via the BlockCypher API.
 */
export async function scanDogecoinAddress(
  address: string,
  options: DogecoinScanOptions = {},
): Promise<DogecoinScanResult> {
  const account = address.trim();
  if (!isDogecoinAddress(account)) throw new Error('unrecognized Dogecoin address');
  const apiUrl = options.apiUrl ?? DEFAULT_API;
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(`${apiUrl}/addrs/${account}?limit=1`);
  if (!response.ok) throw new Error('failed to fetch Dogecoin address');
  const json = (await response.json()) as {
    balance?: number;
    final_balance?: number;
    total_sent?: number;
  };
  const koinu = BigInt(json.final_balance ?? json.balance ?? 0);
  const exposed = (json.total_sent ?? 0) > 0;

  return assessDogecoinRisk(account, exposed, koinu);
}
