import type { RiskLevel } from '../scanner/index.js';

const LAMPORTS_PER_SOL = 1_000_000_000n;
const CRITICAL_LAMPORTS = 100n * LAMPORTS_PER_SOL; // 100 SOL
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface SolanaScanResult {
  address: string;
  /** Always true: a Solana address is its Ed25519 public key. */
  exposed: boolean;
  lamports: bigint;
  balanceSol: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface SolanaScanOptions {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
}

/** A Solana address is a base58-encoded 32-byte Ed25519 public key. */
export function isSolanaAddress(address: string): boolean {
  return BASE58.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessSolanaRisk(address: string, lamports: bigint): SolanaScanResult {
  const reasons = [
    'A Solana address is its own Ed25519 public key, so it is exposed from creation — before any transaction.',
  ];
  let score: number;
  if (lamports >= CRITICAL_LAMPORTS) {
    score = 90;
    reasons.push(
      'Significant balance is permanently exposed; protection needs a protocol-level fix.',
    );
  } else if (lamports > 0n) {
    score = 70;
    reasons.push('Balance is permanently exposed to a future quantum attacker.');
  } else {
    score = 30;
    reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
  }
  return {
    address,
    exposed: true,
    lamports,
    balanceSol: formatSol(lamports),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/** Scan a Solana address for quantum exposure via the JSON-RPC `getBalance`. */
export async function scanSolanaAddress(
  address: string,
  options: SolanaScanOptions = {},
): Promise<SolanaScanResult> {
  const account = address.trim();
  if (!isSolanaAddress(account)) throw new Error('unrecognized Solana address');
  const rpcUrl = options.rpcUrl ?? DEFAULT_RPC;
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [account] }),
  });
  if (!response.ok) throw new Error('failed to fetch Solana balance');
  const json = (await response.json()) as { result?: { value?: number }; error?: unknown };
  if (json.error || !json.result) throw new Error('Solana RPC returned an error');

  return assessSolanaRisk(account, BigInt(json.result.value ?? 0));
}
