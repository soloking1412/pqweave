import { describe, expect, it } from 'vitest';
import {
  BIP361,
  bip361Outlook,
  bip361Timeline,
  EC_DISABLING_MODELS,
  EVIDENCE_TRIGGER_CONSEQUENCE,
  summarizeBip361,
} from '../src/bitcoin/bip361.js';
import type { UtxoAddressType, UtxoExposureResult } from '../src/bitcoin/types.js';

/**
 * BIP-361 is a draft, so these tests pin the *shape* of the advice rather than
 * any claim that the sunset will happen. The property that matters is that the
 * two clocks stay separate: quantum exposure is a fact about the chain, the
 * sunset is a policy that would apply regardless.
 */

function exposure(
  type: UtxoAddressType,
  opts: { exposed?: boolean; balanceSats?: bigint } = {},
): UtxoExposureResult {
  return {
    address: 'test',
    network: 'bitcoin',
    type,
    exposed: opts.exposed ?? false,
    hasSpent: opts.exposed ?? false,
    txCount: 1,
    balanceSats: opts.balanceSats ?? 100_000n,
  };
}

describe('scope', () => {
  const legacyTypes: UtxoAddressType[] = ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr'];

  it('covers every ECDSA/Schnorr output type', () => {
    for (const type of legacyTypes) {
      const outlook = bip361Outlook(exposure(type));
      expect(outlook.inScope).toBe(true);
      expect(outlook.blockedFromReceivingAtPhaseA).toBe(true);
      expect(outlook.frozenAtPhaseB).toBe(true);
    }
  });

  it('excludes P2MR, the one output type the sunset spares', () => {
    const outlook = bip361Outlook(exposure('p2mr'));
    expect(outlook.inScope).toBe(false);
    expect(outlook.frozenAtPhaseB).toBe(false);
    // The honest caveat has to travel with the good news.
    expect(outlook.notes.join(' ')).toMatch(/draft/i);
  });

  it('treats an unclassifiable address as in scope, not as safe', () => {
    expect(bip361Outlook(exposure('unknown')).inScope).toBe(true);
  });
});

describe('the two clocks stay separate', () => {
  it('an unexposed legacy address is quantum-safe today but still sunsets', () => {
    const outlook = bip361Outlook(exposure('p2wpkh', { exposed: false }));
    expect(outlook.frozenAtPhaseB).toBe(true);
    expect(outlook.frozenAtPhaseBUnderNarrowReading).toBe(false);
    expect(outlook.notes.join(' ')).toMatch(/no quantum exposure today/i);
  });

  it('an exposed address is caught on either reading of Phase B', () => {
    const outlook = bip361Outlook(exposure('p2pkh', { exposed: true }));
    expect(outlook.frozenAtPhaseB).toBe(true);
    expect(outlook.frozenAtPhaseBUnderNarrowReading).toBe(true);
  });

  it('never presents Phase C as a safety net', () => {
    const notes = bip361Outlook(exposure('p2pkh', { balanceSats: 1n })).notes.join(' ');
    expect(notes).toMatch(/not specified|unspecified|do not treat it as a fallback/i);
  });
});

describe('wallet rollup', () => {
  const wallet = [
    exposure('p2pkh', { exposed: true, balanceSats: 500_000n }),
    exposure('p2wpkh', { exposed: false, balanceSats: 300_000n }),
    exposure('p2tr', { exposed: true, balanceSats: 200_000n }),
    exposure('p2mr', { exposed: false, balanceSats: 100_000n }),
  ];

  it('separates the broad and narrow readings', () => {
    const summary = summarizeBip361(wallet);
    expect(summary.addressesInScope).toBe(3);
    expect(summary.addressesOutOfScope).toBe(1);
    // Everything legacy freezes under the broad reading.
    expect(summary.satsAtRiskBroad).toBe(1_000_000n);
    // Only the already-exposed coins freeze under the narrow one.
    expect(summary.satsAtRiskNarrow).toBe(700_000n);
  });

  it('reports quantum exposure independently of the sunset', () => {
    const summary = summarizeBip361(wallet);
    expect(summary.satsQuantumExposed).toBe(700_000n);
    expect(summary.totalSats).toBe(1_100_000n);
  });

  it('arithmetic is consistent: narrow <= broad <= total', () => {
    const summary = summarizeBip361(wallet);
    expect(summary.satsAtRiskNarrow <= summary.satsAtRiskBroad).toBe(true);
    expect(summary.satsAtRiskBroad <= summary.totalSats).toBe(true);
  });

  it('an empty wallet rolls up to zero, not NaN', () => {
    const summary = summarizeBip361([]);
    expect(summary.totalSats).toBe(0n);
    expect(summary.addressesInScope).toBe(0);
  });
});

describe('evidence-triggered disabling', () => {
  it('covers all three proposed triggers', () => {
    expect(EC_DISABLING_MODELS.map((m) => m.trigger)).toEqual([
      'scheduled',
      'tripwire',
      'miner-lockdown',
    ]);
  });

  it('states plainly that the tripwire gives no warning', () => {
    const tripwire = EC_DISABLING_MODELS.find((m) => m.trigger === 'tripwire')!;
    expect(tripwire.warning).toMatch(/effectively none/i);
    // The whole point: it fires when the break is demonstrated, not before.
    expect(tripwire.condition).toMatch(/broken|demonstrat/i);
  });

  it('marks every model as unactivated', () => {
    for (const model of EC_DISABLING_MODELS) {
      expect(model.status).toMatch(/draft|proposal/i);
    }
  });

  it('says preparation must finish before the trigger, not start at it', () => {
    expect(EVIDENCE_TRIGGER_CONSEQUENCE).toMatch(/before the trigger/i);
  });
});

describe('timeline', () => {
  const activation = new Date('2027-01-01T00:00:00Z');

  it('orders the phases and spaces them as the spec states', () => {
    const [pre, a, b, c] = bip361Timeline(activation);
    expect(pre!.phase).toBe('pre-activation');
    expect(c!.phase).toBe('phase-c');
    // Phase A is 160,000 blocks at a 10-minute target: about 3 years.
    const yearsToA = (a!.estimatedAt!.getTime() - activation.getTime()) / (365.2425 * 864e5);
    expect(yearsToA).toBeGreaterThan(2.9);
    expect(yearsToA).toBeLessThan(3.2);
    const yearsAtoB = (b!.estimatedAt!.getTime() - a!.estimatedAt!.getTime()) / (365.2425 * 864e5);
    expect(yearsAtoB).toBeCloseTo(2, 5);
  });

  it('leaves Phase C without a date, because it has none', () => {
    expect(bip361Timeline(activation)[3]!.estimatedAt).toBeNull();
  });

  it('defaults to the proposed activation date', () => {
    expect(bip361Timeline()[0]!.estimatedAt!.getTime()).toBe(
      new Date(BIP361.proposedActivation).getTime(),
    );
  });

  it('states the draft status up front', () => {
    expect(BIP361.status).toBe('Draft');
    expect(bip361Timeline(activation)[0]!.effect).toMatch(/draft/i);
  });
});
