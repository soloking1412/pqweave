import type { RiskLevel } from '../scanner/index.js';

const OCTAS_PER_APT = 100_000_000n;
const CRITICAL_OCTAS = 1_000n * OCTAS_PER_APT; // 1,000 APT
const DEFAULT_API = 'https://fullnode.mainnet.aptoslabs.com';
const APT_COIN_TYPE = '0x1::aptos_coin::AptosCoin';
const APTOS_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

export interface AptosScanResult {
  address: string;
  chain: string;
  symbol: string;
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface AptosScanOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isAptosAddress(address: string): boolean {
  return APTOS_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatApt(octas: bigint): string {
  const whole = octas / OCTAS_PER_APT;
  const frac = (octas % OCTAS_PER_APT).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessAptosRisk(address: string, exposed: boolean, octas: bigint): AptosScanResult {
  const reasons: string[] = [];
  let score = 0;

  if (!exposed) {
    reasons.push('Public key not yet revealed; the account has not signed a transaction.');
    score = octas > 0n ? 12 : 5;
    if (octas > 0n) {
      reasons.push('Funds are safe until the first transaction reveals the public key.');
    }
  } else {
    reasons.push('Public key is exposed: the account has signed at least one transaction.');
    if (octas >= CRITICAL_OCTAS) {
      score = 90;
      reasons.push('Significant balance is exposed; protection needs a protocol-level fix.');
    } else if (octas > 0n) {
      score = 70;
      reasons.push('Balance is exposed to a future quantum attacker.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }

  return {
    address,
    chain: 'Aptos',
    symbol: 'APT',
    exposed,
    balance: formatApt(octas),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/**
 * Scan an Aptos account for quantum exposure. Its sequence number is greater
 * than zero once it has signed a transaction, which reveals its public key.
 */
export async function scanAptosAddress(
  address: string,
  options: AptosScanOptions = {},
): Promise<AptosScanResult> {
  const account = address.trim();
  if (!isAptosAddress(account)) throw new Error('unrecognized Aptos address');
  const apiUrl = options.apiUrl ?? DEFAULT_API;
  const doFetch = options.fetchImpl ?? fetch;

  const accountResponse = await doFetch(`${apiUrl}/v1/accounts/${account}`);
  if (accountResponse.status === 404) return assessAptosRisk(account, false, 0n);
  if (!accountResponse.ok) throw new Error('failed to fetch Aptos account');
  const info = (await accountResponse.json()) as { sequence_number?: string };
  const exposed = (info.sequence_number ?? '0') !== '0';

  // The coin::balance view is Fungible-Asset aware, so it covers both the legacy
  // CoinStore and the newer FA representation of APT.
  let octas = 0n;
  const balanceResponse = await doFetch(`${apiUrl}/v1/view`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      function: '0x1::coin::balance',
      type_arguments: [APT_COIN_TYPE],
      arguments: [account],
    }),
  });
  if (balanceResponse.ok) {
    const result = (await balanceResponse.json()) as string[];
    octas = BigInt(result[0] ?? '0');
  }

  return assessAptosRisk(account, exposed, octas);
}
