import { withEndpointFailover } from '../endpoints.js';
import type { RiskLevel } from '../scanner/index.js';

/** Tried in order; see `withEndpointFailover`. */
const DEFAULT_RPCS = [
  'https://xrplcluster.com/',
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
  'https://xrpl.ws/',
] as const;
const DROPS_PER_XRP = 1_000_000n;
const CRITICAL_DROPS = 10_000n * DROPS_PER_XRP; // 10,000 XRP
// XRP Ledger base58 alphabet.
const XRP_ADDRESS = /^r[rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz]{24,34}$/;

export interface XrpScanResult {
  address: string;
  chain: string;
  symbol: string;
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface XrpScanOptions {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isXrpAddress(address: string): boolean {
  return XRP_ADDRESS.test(address.trim());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function formatXrp(drops: bigint): string {
  const whole = drops / DROPS_PER_XRP;
  const frac = (drops % DROPS_PER_XRP).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function assessXrpRisk(address: string, exposed: boolean, drops: bigint): XrpScanResult {
  const reasons: string[] = [];
  let score = 0;

  if (!exposed) {
    reasons.push('Public key not yet revealed; the account has not signed a transaction.');
    score = drops > 0n ? 12 : 5;
    if (drops > 0n) {
      reasons.push(
        'A first outgoing transaction can reveal the public key; review short-range exposure before signing.',
      );
    }
  } else {
    reasons.push('Public key is exposed: the account has signed at least one transaction.');
    if (drops >= CRITICAL_DROPS) {
      score = 90;
      reasons.push('Significant balance is exposed; protection needs a protocol-level fix.');
    } else if (drops > 0n) {
      score = 70;
      reasons.push('Balance is exposed to a future quantum attacker.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }

  return {
    address,
    chain: 'XRP Ledger',
    symbol: 'XRP',
    exposed,
    balance: formatXrp(drops),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

interface XrpTxEntry {
  tx?: { Account?: string };
  tx_json?: { Account?: string };
}

/**
 * Scan an XRP Ledger account for quantum exposure. An account's signing public
 * key is revealed in every transaction it submits, so the account is exposed
 * once it has signed at least one transaction.
 */
async function scanXrpOnce(address: string, options: XrpScanOptions = {}): Promise<XrpScanResult> {
  const account = address.trim();
  if (!isXrpAddress(account)) throw new Error('unrecognized XRP address');
  const rpcUrl = options.rpcUrl ?? DEFAULT_RPCS[0];
  const doFetch = options.fetchImpl ?? fetch;

  const call = async (method: string, params: Record<string, unknown>) => {
    const response = await doFetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, params: [params] }),
    });
    if (!response.ok) throw new Error('XRP RPC request failed');
    return (await response.json()) as { result?: Record<string, unknown> & { error?: string } };
  };

  const info = await call('account_info', { account, ledger_index: 'validated' });
  if (info.result?.error === 'actNotFound') {
    return assessXrpRisk(account, false, 0n);
  }
  if (info.result?.error) throw new Error('XRP RPC error');
  const accountData = info.result?.account_data as { Balance?: string } | undefined;
  const drops = BigInt(accountData?.Balance ?? '0');

  // Read the account's earliest transactions (forward), where its first
  // outgoing transaction — and thus its first public-key reveal — lives.
  const history = await call('account_tx', {
    account,
    ledger_index_min: -1,
    ledger_index_max: -1,
    limit: 200,
    forward: true,
    binary: false,
  });
  if (history.result?.error) throw new Error('XRP RPC error');
  const transactions = (history.result?.transactions as XrpTxEntry[] | undefined) ?? [];
  const exposed = transactions.some(
    (entry) => (entry.tx?.Account ?? entry.tx_json?.Account) === account,
  );

  return assessXrpRisk(account, exposed, drops);
}

export const scanXrpAddress = withEndpointFailover(scanXrpOnce, 'rpcUrl', DEFAULT_RPCS);
