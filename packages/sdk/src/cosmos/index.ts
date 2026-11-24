import type { RiskLevel } from '../scanner/index.js';

const DEFAULT_LCD = 'https://cosmos-rest.publicnode.com';

/** Cosmos SDK chain configuration. Defaults to the Cosmos Hub. */
export interface CosmosChain {
  name: string;
  prefix: string;
  denom: string;
  decimals: number;
  symbol: string;
  lcdUrl: string;
  /** Balance (in base units) at or above which exposure is critical. */
  criticalBaseUnits: bigint;
}

export const COSMOS_HUB: CosmosChain = {
  name: 'Cosmos Hub',
  prefix: 'cosmos',
  denom: 'uatom',
  decimals: 6,
  symbol: 'ATOM',
  lcdUrl: DEFAULT_LCD,
  criticalBaseUnits: 1_000_000_000n, // 1,000 ATOM
};

export interface CosmosScanResult {
  address: string;
  chain: string;
  symbol: string;
  exposed: boolean;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface CosmosScanOptions {
  chain?: CosmosChain;
  fetchImpl?: typeof fetch;
}

export function isCosmosAddress(address: string, prefix = 'cosmos'): boolean {
  return new RegExp(`^${prefix}1[02-9ac-hj-np-z]{38,58}$`).test(address.trim());
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

export function assessCosmosRisk(
  address: string,
  chain: CosmosChain,
  exposed: boolean,
  baseUnits: bigint,
): CosmosScanResult {
  const reasons: string[] = [];
  let score = 0;

  if (!exposed) {
    reasons.push('Public key not yet revealed; the account has not signed a transaction.');
    score = baseUnits > 0n ? 12 : 5;
    if (baseUnits > 0n) {
      reasons.push(
        'A first outgoing transaction can reveal the public key; review short-range exposure before signing.',
      );
    }
  } else {
    reasons.push('Public key is exposed: the account has signed at least one transaction.');
    if (baseUnits >= chain.criticalBaseUnits) {
      score = 90;
      reasons.push('Significant balance is exposed; protection needs a protocol-level fix.');
    } else if (baseUnits > 0n) {
      score = 70;
      reasons.push('Balance is exposed to a future quantum attacker.');
    } else {
      score = 35;
      reasons.push('No balance at risk now, but the key stays exposed for any future deposit.');
    }
  }

  return {
    address,
    chain: chain.name,
    symbol: chain.symbol,
    exposed,
    balance: formatUnits(baseUnits, chain.decimals),
    score,
    level: levelFromScore(score),
    reasons,
  };
}

/**
 * Scan a Cosmos SDK account for quantum exposure. The auth module stores an
 * account's public key only after its first signed transaction, so its presence
 * is a definitive exposure signal.
 */
export async function scanCosmosAddress(
  address: string,
  options: CosmosScanOptions = {},
): Promise<CosmosScanResult> {
  const chain = options.chain ?? COSMOS_HUB;
  const account = address.trim();
  if (!isCosmosAddress(account, chain.prefix)) {
    throw new Error(`unrecognized ${chain.name} address`);
  }
  const doFetch = options.fetchImpl ?? fetch;

  const authResponse = await doFetch(`${chain.lcdUrl}/cosmos/auth/v1beta1/accounts/${account}`);
  let exposed = false;
  if (authResponse.ok) {
    const auth = (await authResponse.json()) as { account?: { pub_key?: unknown } };
    exposed = Boolean(auth.account?.pub_key);
  } else if (authResponse.status !== 404) {
    throw new Error('failed to fetch Cosmos account');
  }

  const balanceResponse = await doFetch(`${chain.lcdUrl}/cosmos/bank/v1beta1/balances/${account}`);
  if (!balanceResponse.ok) throw new Error('failed to fetch Cosmos balance');
  const bank = (await balanceResponse.json()) as { balances?: { denom: string; amount: string }[] };
  const entry = bank.balances?.find((b) => b.denom === chain.denom);
  const baseUnits = BigInt(entry?.amount ?? '0');

  return assessCosmosRisk(account, chain, exposed, baseUnits);
}
