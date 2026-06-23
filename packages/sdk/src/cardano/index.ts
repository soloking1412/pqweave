import type { RiskLevel } from '../scanner/index.js';

const LOVELACE_PER_ADA = 1_000_000n;
const CRITICAL_LOVELACE = 10_000n * LOVELACE_PER_ADA; // 10,000 ADA
const DEFAULT_API = 'https://api.koios.rest/api/v1';
const TX_SCAN_LIMIT = 50;
// Shelley payment address (addr1…) in bech32.
const CARDANO_ADDRESS = /^addr1[02-9ac-hj-np-z]{40,120}$/;

export interface CardanoScanResult {
  address: string;
  chain: string;
  symbol: string;
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface CardanoScanOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isCardanoAddress(address: string): boolean {
  return CARDANO_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatAda(lovelace: bigint): string {
  const whole = lovelace / LOVELACE_PER_ADA;
  const frac = (lovelace % LOVELACE_PER_ADA).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessCardanoRisk(
  address: string,
  exposed: boolean,
  lovelace: bigint,
): CardanoScanResult {
  const reasons: string[] = [];
  let score = 0;

  if (!exposed) {
    reasons.push('Public key not yet revealed; the address has not been spent from.');
    score = lovelace > 0n ? 12 : 5;
    if (lovelace > 0n) {
      reasons.push('Funds are safe until the first spend reveals the payment public key.');
    }
  } else {
    reasons.push('Public key is exposed: the address has signed (been an input to) a transaction.');
    if (lovelace >= CRITICAL_LOVELACE) {
      score = 90;
      reasons.push('Significant balance is exposed; protection needs a protocol-level fix.');
    } else if (lovelace > 0n) {
      score = 70;
      reasons.push('Balance is exposed to a future quantum attacker.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }

  return {
    address,
    chain: 'Cardano',
    symbol: 'ADA',
    exposed,
    balance: formatAda(lovelace),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/**
 * Scan a Cardano address for quantum exposure via Koios. The payment public key
 * is revealed when the address is used as a transaction input, so the address is
 * exposed once it appears in the inputs of any of its transactions.
 */
export async function scanCardanoAddress(
  address: string,
  options: CardanoScanOptions = {},
): Promise<CardanoScanResult> {
  const account = address.trim();
  if (!isCardanoAddress(account)) throw new Error('unrecognized Cardano address');
  const apiUrl = options.apiUrl ?? DEFAULT_API;
  const doFetch = options.fetchImpl ?? fetch;

  const post = async (path: string, body: unknown) => {
    const response = await doFetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Cardano (Koios) request failed');
    return response.json();
  };

  const info = (await post('/address_info', { _addresses: [account] })) as { balance?: string }[];
  if (info.length === 0) return assessCardanoRisk(account, false, 0n);
  const lovelace = BigInt(info[0]?.balance ?? '0');

  const txs = (await post('/address_txs', {
    _addresses: [account],
    _after_block_height: 0,
  })) as { tx_hash: string }[];
  if (txs.length === 0) return assessCardanoRisk(account, false, lovelace);

  const txHashes = txs.slice(0, TX_SCAN_LIMIT).map((t) => t.tx_hash);
  const details = (await post('/tx_info', { _tx_hashes: txHashes, _inputs: true })) as {
    inputs?: { payment_addr?: { bech32?: string } }[];
  }[];
  const exposed = details.some((tx) =>
    tx.inputs?.some((input) => input.payment_addr?.bech32 === account),
  );

  return assessCardanoRisk(account, exposed, lovelace);
}
