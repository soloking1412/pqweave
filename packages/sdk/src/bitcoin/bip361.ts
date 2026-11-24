import type { UtxoAddressType, UtxoExposureResult } from './types.js';

/**
 * BIP-361 is a draft conditional on a future post-quantum output and rescue
 * protocol. Phase B would encumber classical spends with an additional rescue
 * check. The draft does not specify that check well enough to decide whether
 * any particular holder can complete it.
 * @see https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki
 */
export type Bip361Phase = 'pre-activation' | 'phase-a' | 'phase-b';

export const BIP361 = {
  number: 361,
  title: 'Post Quantum Migration and Legacy Signature Sunset',
  status: 'Draft',
  assigned: '2026-02-11',
  phaseABlocks: 160_000,
  phaseBYearsAfterA: 2,
  exposedSupplyShare: 0.34,
  specUrl: 'https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki',
} as const;

const CLASSICAL_TYPES: ReadonlySet<UtxoAddressType> = new Set([
  'p2pkh',
  'p2sh',
  'p2wpkh',
  'p2wsh',
  'p2tr',
]);

export interface Bip361Outlook {
  type: UtxoAddressType;
  /** Known classical output type. Unknown outputs remain unclassified. */
  inScope: boolean;
  blockedFromReceivingAtPhaseA: boolean;
  /** Phase B adds an unspecified rescue condition to ECDSA/Schnorr spends. */
  requiresRescueAtPhaseB: boolean;
  /** No complete rescue protocol is specified in the BIP. */
  rescueMechanismSpecified: false;
  notes: string[];
}

export function bip361Outlook(exposure: UtxoExposureResult): Bip361Outlook {
  const inScope = CLASSICAL_TYPES.has(exposure.type);
  const notes = [
    'BIP-361 is a draft, has not activated, and depends on a separate post-quantum output and rescue protocol.',
  ];
  if (exposure.type === 'unknown') {
    notes.push(
      'This output type is unclassified; do not infer that it is exempt from future rules.',
    );
  } else if (inScope) {
    notes.push(
      'Under the draft, Phase A would disallow receiving to this classical output type. Phase B would require an additional quantum-safe rescue check for an ECDSA/Schnorr spend; eligibility cannot yet be determined.',
    );
  } else {
    notes.push(
      'A proposed P2MR output is outside the classical signature sunset, but BIP-360 is not active on mainnet.',
    );
  }
  if (exposure.exposed) {
    notes.push('Its public key is already revealed, independently of any BIP-361 proposal.');
  }
  return {
    type: exposure.type,
    inScope,
    blockedFromReceivingAtPhaseA: inScope,
    requiresRescueAtPhaseB: inScope,
    rescueMechanismSpecified: false,
    notes,
  };
}

export interface Bip361Summary {
  addressesInScope: number;
  addressesOutOfScope: number;
  addressesUnclassified: number;
  satsNeedingRescueAtPhaseB: bigint;
  satsQuantumExposed: bigint;
  totalSats: bigint;
}

export function summarizeBip361(exposures: UtxoExposureResult[]): Bip361Summary {
  const summary: Bip361Summary = {
    addressesInScope: 0,
    addressesOutOfScope: 0,
    addressesUnclassified: 0,
    satsNeedingRescueAtPhaseB: 0n,
    satsQuantumExposed: 0n,
    totalSats: 0n,
  };
  for (const exposure of exposures) {
    const outlook = bip361Outlook(exposure);
    summary.totalSats += exposure.balanceSats;
    if (exposure.type === 'unknown') summary.addressesUnclassified += 1;
    else if (outlook.inScope) {
      summary.addressesInScope += 1;
      summary.satsNeedingRescueAtPhaseB += exposure.balanceSats;
    } else summary.addressesOutOfScope += 1;
    if (exposure.exposed) summary.satsQuantumExposed += exposure.balanceSats;
  }
  return summary;
}

export interface Bip361Timeline {
  phase: Bip361Phase;
  label: string;
  /** Estimated from a hypothetical activation date; null if none supplied. */
  estimatedAt: Date | null;
  effect: string;
}

const BLOCKS_PER_YEAR = 52_560;

export function bip361Timeline(activation?: Date): Bip361Timeline[] {
  const phaseA = activation ? addYears(activation, BIP361.phaseABlocks / BLOCKS_PER_YEAR) : null;
  const phaseB = phaseA ? addYears(phaseA, BIP361.phaseBYearsAfterA) : null;
  return [
    {
      phase: 'pre-activation',
      label: 'Not activated',
      estimatedAt: activation ?? null,
      effect: 'BIP-361 is a draft. No activation date has been set.',
    },
    {
      phase: 'phase-a',
      label: `Phase A (${BIP361.phaseABlocks.toLocaleString('en-US')} blocks after activation)`,
      estimatedAt: phaseA,
      effect: 'Sends to quantum-vulnerable output types would be disallowed.',
    },
    {
      phase: 'phase-b',
      label: `Phase B (${BIP361.phaseBYearsAfterA} years after Phase A)`,
      estimatedAt: phaseB,
      effect:
        'ECDSA/Schnorr spends would need an additional quantum-safe rescue check. Its details are not specified.',
    },
  ];
}

function addYears(from: Date, years: number): Date {
  return new Date(from.getTime() + years * 365.2425 * 24 * 60 * 60 * 1000);
}

/* -------------------------------------------------------------------------- */
/*  Evidence-triggered disabling — a third clock                              */
/* -------------------------------------------------------------------------- */

/**
 * How elliptic-curve spending might be switched off.
 *
 * BIP-361 runs on a calendar: phases fire at a block height whether or not a
 * quantum computer ever appears, which is why it is contentious. Pieter Wuille
 * proposed (Bitcoin Optech, 3 July 2026) codifying disabling that fires on
 * *evidence* instead, inside post-quantum output types that initially allow a
 * cheaper EC spend.
 *
 * The distinction matters to a holder. A schedule can be planned against. A
 * tripwire cannot: it fires when someone demonstrates the break, which is
 * precisely the moment an attacker is already spending other people's coins.
 * Anyone relying on "I will migrate when it gets close" is relying on a warning
 * the tripwire model does not give.
 */
export type EcDisablingTrigger = 'scheduled' | 'tripwire' | 'miner-lockdown';

export interface EcDisablingModel {
  trigger: EcDisablingTrigger;
  label: string;
  /** What causes EC spending to stop. */
  condition: string;
  /** How much warning a holder gets before it takes effect. */
  warning: string;
  /** Status of the proposal itself. */
  status: string;
}

/**
 * The three disabling models under discussion. None is activated; all are
 * drafts or discussion posts, and they are not mutually exclusive.
 */
export const EC_DISABLING_MODELS: EcDisablingModel[] = [
  {
    trigger: 'scheduled',
    label: 'Scheduled sunset (BIP-361)',
    condition:
      'A predetermined block height, fixed at activation. Fires whether or not a quantum computer exists.',
    warning:
      'Years. Phase A is 160,000 blocks after activation and Phase B two years after that, so the dates are known in advance.',
    status: 'Draft; Phase B rescue conditions remain unspecified.',
  },
  {
    trigger: 'tripwire',
    label: 'NUMS-point tripwire (Wuille)',
    condition:
      'A successful spend from a nothing-up-my-sleeve point, which is only possible if secp256k1 is actually broken. The chain observes the break and reacts to it.',
    warning:
      'Effectively none. The trigger is a demonstration of the break, and by then an attacker capable of that demonstration can also derive keys from exposed public keys.',
    status: 'Proposal, discussed 2026-07-03. Not written up as a BIP.',
  },
  {
    trigger: 'miner-lockdown',
    label: 'Miner lockdown (Wuille)',
    condition: 'A hashrate majority signals to disable EC spending.',
    warning:
      'Depends entirely on how quickly miners coordinate; it could be fast, and it is not a published schedule.',
    status: 'Proposal, discussed 2026-07-03. Not written up as a BIP.',
  },
];

/**
 * The planning consequence of the tripwire model, stated once.
 *
 * This is the part worth surfacing to a holder: under a scheduled sunset,
 * waiting is a strategy with known costs. Under a tripwire, waiting is a bet
 * that nobody demonstrates the break before you act — and the demonstration is
 * the starting gun, not the warning.
 */
export const EVIDENCE_TRIGGER_CONSEQUENCE =
  'A scheduled sunset can be planned against. An evidence-triggered one cannot: it fires at the moment the break is demonstrated, which is also the moment exposed keys start being drained. Preparation has to be finished before the trigger, not started at it.';
