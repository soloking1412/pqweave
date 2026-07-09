import type { RiskLevel } from '../scanner/index.js';

const DEFAULT_API = 'https://polkadot.api.subscan.io';
// Polkadot mainnet SS58 (prefix 0) addresses start with '1' and are 47–48 chars.
const POLKADOT_ADDRESS = /^1[1-9A-HJ-NP-Za-km-z]{45,47}$/;

export interface PolkadotScanResult {
  address: string;
  chain: string;
  symbol: string;
  /** Always true: the address is the SS58-encoded public key. */
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface PolkadotScanOptions {
  apiUrl?: string;
  /** Subscan API key. Without it, exposure is still reported (it is structural); balance is omitted. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function isPolkadotAddress(address: string): boolean {
  return POLKADOT_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

/**
 * Polkadot addresses are the SS58 encoding of the account public key itself, so
 * the key is exposed the moment the address exists — there is no "first spend"
 * grace period and no application-layer fix. Balance is enrichment only.
 */
export function assessPolkadotRisk(address: string, dot: number | null): PolkadotScanResult {
  const reasons = [
    'Polkadot addresses are the SS58-encoded public key, so the key is exposed the moment the address exists.',
  ];
  let score: number;
  if (dot === null) {
    score = 55;
    reasons.push('Balance lookup needs a Subscan API key; exposure is structural regardless.');
  } else if (dot >= 1_000) {
    score = 90;
    reasons.push('Significant balance is exposed; protection needs a protocol-level fix.');
  } else if (dot > 0) {
    score = 70;
    reasons.push('Balance is exposed to a future quantum attacker.');
  } else {
    score = 35;
    reasons.push('No balance at risk now, but the public key stays permanently exposed.');
  }
  return {
    address,
    chain: 'Polkadot',
    symbol: 'DOT',
    exposed: true,
    balance: dot === null ? '—' : String(dot),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/** Scan a Polkadot address. Exposure is structural (address-is-key); balance is
 *  fetched from Subscan only when an API key is supplied. */
export async function scanPolkadotAddress(
  address: string,
  options: PolkadotScanOptions = {},
): Promise<PolkadotScanResult> {
  const account = address.trim();
  if (!isPolkadotAddress(account)) throw new Error('unrecognized Polkadot address');

  const apiKey = options.apiKey;
  if (!apiKey) return assessPolkadotRisk(account, null);

  try {
    const apiUrl = options.apiUrl ?? DEFAULT_API;
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch(`${apiUrl}/api/v2/scan/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ key: account }),
    });
    if (!response.ok) return assessPolkadotRisk(account, null);
    const json = (await response.json()) as { data?: { account?: { balance?: string } } };
    const raw = json.data?.account?.balance;
    return assessPolkadotRisk(account, raw === undefined ? null : Number(raw));
  } catch {
    return assessPolkadotRisk(account, null);
  }
}
