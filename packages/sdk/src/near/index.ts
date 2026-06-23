import type { RiskLevel } from '../scanner/index.js';

const YOCTO_PER_NEAR = 10n ** 24n;
const CRITICAL_YOCTO = 1_000n * YOCTO_PER_NEAR; // 1,000 NEAR
const DEFAULT_RPC = 'https://rpc.mainnet.near.org';
const NEAR_ACCOUNT = /^[a-z0-9._-]{2,64}$/;

export interface NearScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** True when the account exists: its Ed25519 access-key public keys are on-chain. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface NearScanOptions {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isNearAddress(address: string): boolean {
  return NEAR_ACCOUNT.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatNear(yocto: bigint): string {
  const whole = yocto / YOCTO_PER_NEAR;
  const frac = (yocto % YOCTO_PER_NEAR).toString().padStart(24, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessNearRisk(address: string, exists: boolean, yocto: bigint): NearScanResult {
  if (!exists) {
    return {
      address,
      chain: 'NEAR',
      symbol: 'NEAR',
      exposed: false,
      balance: '0',
      score: 5,
      level: 'safe',
      reasons: ['Account does not exist on-chain.'],
    };
  }
  const reasons = [
    'NEAR accounts are controlled by Ed25519 access keys whose public keys are stored on-chain, so the account is exposed.',
  ];
  let score: number;
  if (yocto >= CRITICAL_YOCTO) {
    score = 90;
    reasons.push('Significant balance is exposed; protection needs a protocol-level fix.');
  } else if (yocto > 0n) {
    score = 70;
    reasons.push('Balance is exposed to a future quantum attacker.');
  } else {
    score = 30;
    reasons.push('No balance at risk now, but the access key stays exposed.');
  }
  return {
    address,
    chain: 'NEAR',
    symbol: 'NEAR',
    exposed: true,
    balance: formatNear(yocto),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/** Scan a NEAR account for quantum exposure via the JSON-RPC view_account query. */
export async function scanNearAddress(
  address: string,
  options: NearScanOptions = {},
): Promise<NearScanResult> {
  const account = address.trim();
  if (!isNearAddress(account)) throw new Error('unrecognized NEAR account');
  const rpcUrl = options.rpcUrl ?? DEFAULT_RPC;
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: account },
    }),
  });
  if (!response.ok) throw new Error('failed to fetch NEAR account');
  const json = (await response.json()) as { result?: { amount?: string }; error?: unknown };
  if (json.error || !json.result) return assessNearRisk(account, false, 0n);
  return assessNearRisk(account, true, BigInt(json.result.amount ?? '0'));
}
