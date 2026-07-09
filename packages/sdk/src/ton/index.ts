import type { RiskLevel } from '../scanner/index.js';

const NANO_PER_TON = 1_000_000_000n;
const CRITICAL_NANO = 1_000n * NANO_PER_TON; // 1,000 TON
const DEFAULT_API = 'https://toncenter.com/api/v2';
// User-friendly (base64 or base64url, 48 chars) or raw (workchain:hex) forms.
const TON_FRIENDLY = /^[A-Za-z0-9+/_-]{48}$/;
const TON_RAW = /^-?\d+:[0-9a-fA-F]{64}$/;

export interface TonScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** True once the wallet contract is deployed (active), revealing its public key. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface TonScanOptions {
  apiUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function isTonAddress(address: string): boolean {
  const a = address.trim();
  return TON_FRIENDLY.test(a) || TON_RAW.test(a);
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

export function assessTonRisk(address: string, exposed: boolean, nano: bigint): TonScanResult {
  const reasons: string[] = [];
  let score = 0;
  if (!exposed) {
    reasons.push('Wallet not yet deployed; the Ed25519 public key has not been revealed on-chain.');
    score = nano > 0n ? 12 : 5;
    if (nano > 0n) {
      reasons.push('Funds are safe until the wallet is deployed by its first outgoing transfer.');
    }
  } else {
    reasons.push(
      'Public key is exposed: the wallet contract is deployed and reveals its Ed25519 key.',
    );
    if (nano >= CRITICAL_NANO) {
      score = 90;
      reasons.push('Significant balance is exposed; protection needs a protocol-level fix.');
    } else if (nano > 0n) {
      score = 70;
      reasons.push('Balance is exposed to a future quantum attacker.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }
  return {
    address,
    chain: 'TON',
    symbol: 'TON',
    exposed,
    balance: formatUnits(nano, 9),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/**
 * Scan a TON account for quantum exposure. A TON wallet's Ed25519 public key is
 * committed in the contract that the address is derived from; it is revealed
 * on-chain once the wallet is deployed (its first outgoing transfer).
 */
export async function scanTonAddress(
  address: string,
  options: TonScanOptions = {},
): Promise<TonScanResult> {
  const account = address.trim();
  if (!isTonAddress(account)) throw new Error('unrecognized TON address');
  const apiUrl = options.apiUrl ?? DEFAULT_API;
  const doFetch = options.fetchImpl ?? fetch;
  const suffix = options.apiKey ? `&api_key=${options.apiKey}` : '';

  const response = await doFetch(
    `${apiUrl}/getAddressInformation?address=${encodeURIComponent(account)}${suffix}`,
  );
  if (!response.ok) throw new Error('failed to fetch TON account');
  const json = (await response.json()) as {
    ok?: boolean;
    result?: { balance?: string; state?: string };
  };
  if (!json.ok || !json.result) throw new Error('TON account lookup failed');
  const nano = BigInt(json.result.balance ?? '0');
  const exposed = json.result.state === 'active';

  return assessTonRisk(account, exposed, nano);
}
