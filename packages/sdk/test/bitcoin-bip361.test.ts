import { describe, expect, it } from 'vitest';
import {
  BIP361,
  bip361Outlook,
  bip361Timeline,
  EC_DISABLING_MODELS,
  summarizeBip361,
} from '../src/bitcoin/bip361.js';
import type { UtxoAddressType, UtxoExposureResult } from '../src/bitcoin/types.js';

function exposure(
  type: UtxoAddressType,
  exposed = false,
  balanceSats = 100_000n,
): UtxoExposureResult {
  return {
    address: 'test',
    network: 'bitcoin',
    type,
    exposed,
    hasSpent: exposed,
    txCount: 1,
    balanceSats,
  };
}

describe('BIP-361 draft advice', () => {
  it('treats classical outputs as needing a future rescue check, not automatically frozen', () => {
    for (const type of ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr'] as UtxoAddressType[]) {
      const result = bip361Outlook(exposure(type));
      expect(result.inScope).toBe(true);
      expect(result.blockedFromReceivingAtPhaseA).toBe(true);
      expect(result.requiresRescueAtPhaseB).toBe(true);
      expect(result.rescueMechanismSpecified).toBe(false);
    }
  });

  it('does not classify unknown outputs as exempt', () => {
    const result = bip361Outlook(exposure('unknown'));
    expect(result.inScope).toBe(false);
    expect(result.notes.join(' ')).toMatch(/unclassified/i);
  });

  it('keeps key exposure separate from the proposal', () => {
    const hidden = bip361Outlook(exposure('p2wpkh'));
    const revealed = bip361Outlook(exposure('p2wpkh', true));
    expect(hidden.requiresRescueAtPhaseB).toBe(revealed.requiresRescueAtPhaseB);
    expect(revealed.notes.join(' ')).toMatch(/already revealed/i);
  });

  it('does not call a proposed P2MR output active on mainnet', () => {
    expect(bip361Outlook(exposure('p2mr')).notes.join(' ')).toMatch(/not active/i);
  });

  it('aggregates rescue exposure without inventing frozen balances', () => {
    const summary = summarizeBip361([
      exposure('p2pkh', true, 500_000n),
      exposure('p2wpkh', false, 300_000n),
      exposure('p2mr', false, 100_000n),
      exposure('unknown', false, 20_000n),
    ]);
    expect(summary.satsNeedingRescueAtPhaseB).toBe(800_000n);
    expect(summary.satsQuantumExposed).toBe(500_000n);
    expect(summary.addressesUnclassified).toBe(1);
    expect(summary.totalSats).toBe(920_000n);
  });

  it('does not invent an activation date or Phase C', () => {
    expect(BIP361.status).toBe('Draft');
    expect(bip361Timeline().map((event) => event.phase)).toEqual([
      'pre-activation',
      'phase-a',
      'phase-b',
    ]);
    expect(bip361Timeline().every((event) => event.estimatedAt === null)).toBe(true);
    const timeline = bip361Timeline(new Date('2030-01-01T00:00:00Z'));
    expect(timeline[1]!.estimatedAt!.getTime()).toBeLessThan(timeline[2]!.estimatedAt!.getTime());
  });

  it('keeps alternative trigger models identified as proposals', () => {
    expect(EC_DISABLING_MODELS).toHaveLength(3);
    expect(EC_DISABLING_MODELS.every((model) => /draft|proposal/i.test(model.status))).toBe(true);
  });
});
