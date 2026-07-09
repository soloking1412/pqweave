import { formatUnits } from 'viem';
import type { ChainKey } from '../chains/index.js';
import type { ExposureResult, RiskAssessment, RiskLevel, TokenHolding } from './types.js';

/** Balance (in wei of the native token) at or above which exposure is critical. */
const CRITICAL_BALANCE_WEI = 1_000_000_000_000_000_000n; // 1.0 native unit
/** Stablecoin units (≈ USD) at or above which exposure is critical. */
const CRITICAL_STABLE_UNITS = 1_000n;

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

function stableUnits(holdings: TokenHolding[]): bigint {
  return holdings
    .filter((h) => h.stable)
    .reduce((sum, h) => sum + h.amount / 10n ** BigInt(h.decimals), 0n);
}

/** Below 0.0001 of a token is dust: effectively no value at risk, and a
 *  display would round it to zero. */
function isDust(holding: TokenHolding): boolean {
  return holding.amount < 10n ** BigInt(holding.decimals) / 10_000n;
}

function formatHolding(holding: TokenHolding): string {
  const value = Number(formatUnits(holding.amount, holding.decimals));
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${holding.symbol}`;
}

/**
 * Score an address from its exposure, native balance, and known ERC-20
 * holdings. The model is intentionally transparent: a revealed public key is
 * the precondition for a quantum key-recovery attack, and the value it guards
 * (native + tokens) sets the impact.
 */
export function assessRisk(
  exposure: ExposureResult,
  nativeBalanceWei: bigint,
  chain: ChainKey,
  tokenHoldings: TokenHolding[] = [],
): RiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  const held = tokenHoldings.filter((h) => h.amount > 0n && !isDust(h));
  const holdsValue = nativeBalanceWei > 0n || held.length > 0;

  if (exposure.pqweaveProtected) {
    reasons.push(
      'This is a PQWeave post-quantum account: spending is gated by a hash-based signature no quantum computer can forge.',
    );
    score = 5;
  } else if (exposure.hardened) {
    reasons.push(
      'Delegated to a PQWeave account; high-value operations require a post-quantum signature.',
    );
    score = 10;
  } else if (exposure.isContract) {
    reasons.push(
      'Smart-contract account; quantum risk depends on the signing scheme its code enforces.',
    );
    score = 20;
  } else if (!exposure.exposed) {
    reasons.push('Public key not yet revealed; the address has never sent a transaction.');
    score = holdsValue ? 12 : 5;
    if (holdsValue) {
      reasons.push('Funds are safe until the first outgoing transaction exposes the public key.');
    }
  } else {
    reasons.push(
      'Public key is exposed: the address has sent transactions and is harvestable today.',
    );
    const critical =
      nativeBalanceWei >= CRITICAL_BALANCE_WEI || stableUnits(held) >= CRITICAL_STABLE_UNITS;
    if (critical) {
      score = 90;
      reasons.push(
        'Significant balance is at risk and should be migrated to a post-quantum account.',
      );
    } else if (holdsValue) {
      score = 70;
      reasons.push('Balance is at risk and should be migrated to a post-quantum account.');
    } else {
      score = 35;
      reasons.push(
        'No balance currently at risk, but the key remains exposed for future deposits.',
      );
    }
    if (held.length > 0) {
      reasons.push(`Token balances at risk: ${held.map(formatHolding).join(', ')}.`);
    }
    if (exposure.delegatedTo) {
      reasons.push('Delegated via EIP-7702, but not to a recognized PQWeave account.');
    }
  }

  return {
    ...exposure,
    chain,
    nativeBalanceWei,
    tokenHoldings: held,
    score,
    level: levelFromScore(score),
    reasons,
  };
}
