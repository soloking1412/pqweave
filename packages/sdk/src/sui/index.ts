import type { RiskLevel } from '../scanner/index.js';

const MIST_PER_SUI = 1_000_000_000n;
const CRITICAL_MIST = 1_000n * MIST_PER_SUI; // 1,000 SUI
/**
 * Sui retired JSON-RPC on public fullnodes in 2026, so this reads the GraphQL
 * service. One query returns the SUI balance and whether the address has ever
 * sent a transaction.
 */
const DEFAULT_API = 'https://graphql.mainnet.sui.io/graphql';

const QUERY = `query ($address: SuiAddress!) {
  address(address: $address) {
    balance(coinType: "0x2::sui::SUI") { totalBalance }
    transactions(first: 1, relation: SENT) { nodes { digest } }
  }
}`;
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
  /** GraphQL endpoint. */
  apiUrl?: string;
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
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(options.apiUrl ?? DEFAULT_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { address: account } }),
  });
  if (!response.ok) throw new Error('failed to fetch Sui account');
  const json = (await response.json()) as {
    data?: {
      address?: {
        balance?: { totalBalance?: string } | null;
        transactions?: { nodes?: unknown[] } | null;
      } | null;
    } | null;
    errors?: { message?: string }[];
  };
  if (json.errors?.length || !json.data) {
    throw new Error(json.errors?.[0]?.message ?? 'Sui GraphQL returned no data');
  }
  const mist = BigInt(json.data.address?.balance?.totalBalance ?? '0');
  const exposed = (json.data.address?.transactions?.nodes ?? []).length > 0;

  return assessSuiRisk(account, exposed, mist);
}
