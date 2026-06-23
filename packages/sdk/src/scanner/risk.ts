import type { ChainKey } from '../chains/index.js';
import type { ExposureResult, RiskAssessment, RiskLevel } from './types.js';

/** Balance (in wei of the native token) at or above which exposure is critical. */
const CRITICAL_BALANCE_WEI = 1_000_000_000_000_000_000n; // 1.0 native unit

function levelFromScore(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'safe';
}

/**
 * Score an address from its exposure and native balance. The model is
 * intentionally transparent: a revealed public key is the precondition for a
 * quantum key-recovery attack, and the balance it guards sets the impact.
 */
export function assessRisk(
  exposure: ExposureResult,
  nativeBalanceWei: bigint,
  chain: ChainKey,
): RiskAssessment {
  const reasons: string[] = [];
  let score = 0;

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
    score = nativeBalanceWei > 0n ? 12 : 5;
    if (nativeBalanceWei > 0n) {
      reasons.push('Funds are safe until the first outgoing transaction exposes the public key.');
    }
  } else {
    reasons.push(
      'Public key is exposed: the address has sent transactions and is harvestable today.',
    );
    score = 50;
    if (nativeBalanceWei >= CRITICAL_BALANCE_WEI) {
      score = 90;
      reasons.push(
        'Significant balance is at risk and should be migrated to a post-quantum account.',
      );
    } else if (nativeBalanceWei > 0n) {
      score = 70;
      reasons.push('Balance is at risk and should be migrated to a post-quantum account.');
    } else {
      score = 35;
      reasons.push(
        'No native balance currently at risk, but the key remains exposed for future deposits.',
      );
    }
    if (exposure.delegatedTo) {
      reasons.push('Delegated via EIP-7702, but not to a recognized PQWeave account.');
    }
  }

  return {
    ...exposure,
    chain,
    nativeBalanceWei,
    score,
    level: levelFromScore(score),
    reasons,
  };
}
