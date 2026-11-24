import type { RiskLevel } from '../scanner/index.js';

const MIST_PER_SUI = 1_000_000_000n;
const CRITICAL_MIST = 1_000n * MIST_PER_SUI; // 1,000 SUI
const DEFAULT_RPC = 'https://fullnode.mainnet.sui.io:443';
const SUI_ADDRESS = /^0x[0-9a-fA-F]{64}$/;

export interface SuiScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** True once the account has sent a transaction, revealing its public key. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface SuiScanOptions {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isSuiAddress(address: string): boolean {
  return SUI_ADDRESS.test(address.trim());
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

export function assessSuiRisk(address: string, exposed: boolean, mist: bigint): SuiScanResult {
  const reasons: string[] = [];
  let score = 0;
  if (!exposed) {
    reasons.push('Public key not yet revealed; the address has not sent a transaction.');
    score = mist > 0n ? 12 : 5;
    if (mist > 0n) {
      reasons.push(
        'A first transaction can reveal the public key; review short-range exposure before signing.',
      );
    }
  } else {
    reasons.push(
      'Public key is exposed: the address is a hash of the key, revealed once it transacts.',
    );
    if (mist >= CRITICAL_MIST) {
      score = 90;
      reasons.push('Significant balance is exposed; move it to a fresh, never-used address.');
    } else if (mist > 0n) {
      score = 70;
      reasons.push('Balance is exposed; move it to a fresh, never-used address.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }
  return {
    address,
    chain: 'Sui',
    symbol: 'SUI',
    exposed,
    balance: formatUnits(mist, 9),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

async function rpc<T>(
  url: string,
  doFetch: typeof fetch,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await doFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Sui RPC ${method} failed`);
  const json = (await response.json()) as { result?: T; error?: { message?: string } };
  if (json.error || json.result === undefined) {
    throw new Error(json.error?.message ?? `Sui RPC ${method} returned no result`);
  }
  return json.result;
}

/**
 * Scan a Sui account for quantum exposure. A Sui address is a Blake2b hash of the
 * scheme flag and Ed25519 public key, so the key stays hidden until the address
 * signs its first transaction (first-spend exposure).
 */
export async function scanSuiAddress(
  address: string,
  options: SuiScanOptions = {},
): Promise<SuiScanResult> {
  const account = address.trim();
  if (!isSuiAddress(account)) throw new Error('unrecognized Sui address');
  const url = options.rpcUrl ?? DEFAULT_RPC;
  const doFetch = options.fetchImpl ?? fetch;

  const balance = await rpc<{ totalBalance?: string }>(url, doFetch, 'suix_getBalance', [account]);
  const mist = BigInt(balance.totalBalance ?? '0');

  const txs = await rpc<{ data?: unknown[] }>(url, doFetch, 'suix_queryTransactionBlocks', [
    { filter: { FromAddress: account } },
    null,
    1,
    false,
  ]);
  const exposed = (txs.data ?? []).length > 0;

  return assessSuiRisk(account, exposed, mist);
}
