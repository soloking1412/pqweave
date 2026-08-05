import type { UtxoAddressType, UtxoExposureResult } from './types.js';

/**
 * BIP-361 "Post Quantum Migration and Legacy Signature Sunset" — a second,
 * independent clock on every bitcoin address.
 *
 * Quantum exposure and BIP-361 are different risks and holders conflate them:
 *
 * - **Quantum exposure** is a fact about an address today. If its public key has
 *   been revealed on-chain, the coins are stealable the moment a
 *   cryptographically relevant quantum computer exists. Nothing can un-reveal a
 *   key; the only remedy is to move the coins.
 * - **BIP-361** is a *policy* risk. As drafted it would eventually reject
 *   ECDSA/Schnorr spends from legacy outputs whether or not the key was ever
 *   exposed. An untouched, never-spent address is quantum-safe today and would
 *   still be caught by the sunset.
 *
 * So an address can be safe on one clock and not the other, which is exactly the
 * case people get wrong.
 *
 * **BIP-361 is `Status: Draft` and is not activated.** It is contentious —
 * it renders coins unspendable, and that is the explicit intent, not a side
 * effect. It may be amended, or may never activate. Everything here is
 * conditional on activation and must be presented that way.
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki
 */

/** Where a chain sits on the BIP-361 schedule. */
export type Bip361Phase = 'pre-activation' | 'phase-a' | 'phase-b' | 'phase-c';

/**
 * Published facts about the proposal. Dates and thresholds are the *proposal's*
 * targets, not commitments — no activation has occurred.
 */
export const BIP361 = {
  number: 361,
  title: 'Post Quantum Migration and Legacy Signature Sunset',
  status: 'Draft',
  /** Merged into bitcoin/bips. */
  published: '2026-04-14',
  /** Phase A is specified in blocks: "160,000 blocks (~3 years) after activation". */
  phaseABlocks: 160_000,
  /** Phase B is specified in time, not blocks: "2 years after Phase A activation". */
  phaseBYearsAfterA: 2,
  /** Proposed earliest mainnet activation, with a 90% miner signalling threshold. */
  proposedActivation: '2027-01-01T00:00:00Z',
  proposedThreshold: 0.9,
  /** Share of all bitcoin with a public key already revealed, as of 2026-03-01. */
  exposedSupplyShare: 0.34,
  specUrl: 'https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki',
} as const;

/**
 * Output types BIP-361 would sunset. Every script that authorizes with ECDSA or
 * Schnorr is in scope; only BIP-360's P2MR is out of it.
 *
 * `unknown` is deliberately treated as in-scope: an address we could not
 * classify is far more likely to be a legacy type we do not parse than a P2MR
 * output, and guessing "safe" is the dangerous direction to be wrong in.
 */
const SUNSET_TYPES: ReadonlySet<UtxoAddressType> = new Set([
  'p2pkh',
  'p2sh',
  'p2wpkh',
  'p2wsh',
  'p2tr',
  'unknown',
]);

/**
 * Whether Phase B invalidates ECDSA/Schnorr for *all* legacy outputs or only
 * for outputs whose key is already exposed.
 *
 * The BIP does not say. Its normative text is "at a predetermined block height,
 * nodes tighten requirements on verification of ECDSA/Schnorr", which does not
 * resolve the scope, and the rationale reads as the broad interpretation. We
 * plan against the broad reading because being wrong that way costs a user an
 * unnecessary migration, while the narrow reading costs them their coins.
 */
export const PHASE_B_SCOPE_IS_AMBIGUOUS = true;

export interface Bip361Outlook {
  /** The output type this outlook was computed for. */
  type: UtxoAddressType;
  /** In scope for the sunset at all. False only for P2MR today. */
  inScope: boolean;
  /**
   * True when the address could no longer receive at Phase A. As drafted,
   * Phase A permits sends only from legacy scripts to post-quantum scripts, so
   * every in-scope type stops being a valid destination.
   */
  blockedFromReceivingAtPhaseA: boolean;
  /**
   * True when the balance would become unspendable at Phase B under the broad
   * reading of the spec. See {@link PHASE_B_SCOPE_IS_AMBIGUOUS}.
   */
  frozenAtPhaseB: boolean;
  /**
   * True only under the narrow reading — the address's key is already revealed,
   * so it is in scope on any interpretation of Phase B.
   */
  frozenAtPhaseBUnderNarrowReading: boolean;
  /**
   * Phase C proposes recovering frozen coins by proving ownership of a BIP-39
   * seed with a zero-knowledge proof. It is unspecified and undeveloped, so this
   * is a possibility, not a plan. Never present it as a safety net.
   */
  phaseCRescueUnspecified: boolean;
  /** Plain-language statements safe to show a holder. */
  notes: string[];
}

/**
 * Assess one address against the BIP-361 schedule.
 *
 * Takes the scanner's existing exposure result so the two clocks are always
 * reported from the same observation of the chain.
 */
export function bip361Outlook(exposure: UtxoExposureResult): Bip361Outlook {
  const inScope = SUNSET_TYPES.has(exposure.type);
  const notes: string[] = [];

  if (!inScope) {
    notes.push(
      'This is a BIP-360 (P2MR) output, which is not covered by the signature sunset. BIP-360 is itself a draft and is not active on any network.',
    );
    return {
      type: exposure.type,
      inScope: false,
      blockedFromReceivingAtPhaseA: false,
      frozenAtPhaseB: false,
      frozenAtPhaseBUnderNarrowReading: false,
      phaseCRescueUnspecified: false,
      notes,
    };
  }

  notes.push(
    `If BIP-361 activates as drafted, this address stops being a valid destination about 3 years later (Phase A), and coins left here become unspendable ${BIP361.phaseBYearsAfterA} years after that (Phase B).`,
  );

  if (exposure.exposed) {
    notes.push(
      'The public key here is already revealed on-chain, so this address is in scope for Phase B on any reading of the spec — and it is already exposed to quantum key recovery regardless of whether BIP-361 ever activates.',
    );
  } else {
    notes.push(
      'The public key here has not been revealed yet, so there is no quantum exposure today. The sunset would still apply: as drafted it turns on the signature type, not on whether a key leaked.',
    );
  }

  if (exposure.balanceSats > 0n) {
    notes.push(
      'Phase C proposes a zero-knowledge recovery path for frozen coins, but it is unspecified and undeveloped. Do not treat it as a fallback.',
    );
  }

  return {
    type: exposure.type,
    inScope: true,
    blockedFromReceivingAtPhaseA: true,
    frozenAtPhaseB: true,
    frozenAtPhaseBUnderNarrowReading: exposure.exposed,
    phaseCRescueUnspecified: true,
    notes,
  };
}

export interface Bip361Summary {
  addressesInScope: number;
  addressesOutOfScope: number;
  /** Balance that would freeze at Phase B under the broad reading. */
  satsAtRiskBroad: bigint;
  /** Balance in scope on any reading, because the key is already exposed. */
  satsAtRiskNarrow: bigint;
  /** Balance already exposed to quantum key recovery, independent of BIP-361. */
  satsQuantumExposed: bigint;
  totalSats: bigint;
}

/**
 * Roll a set of scanned addresses up into wallet-level BIP-361 figures.
 *
 * Reported under both readings of Phase B rather than one number, because the
 * gap between them is the part a holder actually has to make a decision about.
 */
export function summarizeBip361(exposures: UtxoExposureResult[]): Bip361Summary {
  const summary: Bip361Summary = {
    addressesInScope: 0,
    addressesOutOfScope: 0,
    satsAtRiskBroad: 0n,
    satsAtRiskNarrow: 0n,
    satsQuantumExposed: 0n,
    totalSats: 0n,
  };

  for (const exposure of exposures) {
    const outlook = bip361Outlook(exposure);
    summary.totalSats += exposure.balanceSats;
    if (outlook.inScope) {
      summary.addressesInScope += 1;
      summary.satsAtRiskBroad += exposure.balanceSats;
      if (outlook.frozenAtPhaseBUnderNarrowReading) {
        summary.satsAtRiskNarrow += exposure.balanceSats;
      }
    } else {
      summary.addressesOutOfScope += 1;
    }
    if (exposure.exposed) summary.satsQuantumExposed += exposure.balanceSats;
  }

  return summary;
}

export interface Bip361Timeline {
  phase: Bip361Phase;
  label: string;
  /** Estimated date, or null when the schedule has no fixed anchor. */
  estimatedAt: Date | null;
  effect: string;
}

const BLOCKS_PER_YEAR = 52_560; // 10-minute target

/**
 * Project the phase schedule from a hypothetical activation date.
 *
 * Every date is an estimate: Phase A is specified in blocks, so its real date
 * depends on how fast blocks are found, and no activation has been scheduled.
 * Pass the proposed activation to see the earliest timeline the BIP contemplates.
 */
export function bip361Timeline(
  activation: Date = new Date(BIP361.proposedActivation),
): Bip361Timeline[] {
  const yearsToPhaseA = BIP361.phaseABlocks / BLOCKS_PER_YEAR;
  const phaseA = addYears(activation, yearsToPhaseA);
  const phaseB = addYears(phaseA, BIP361.phaseBYearsAfterA);

  return [
    {
      phase: 'pre-activation',
      label: 'Not activated',
      estimatedAt: activation,
      effect:
        'BIP-361 is a draft. Nothing changes until it activates, and it may be amended or rejected.',
    },
    {
      phase: 'phase-a',
      label: `Phase A (${BIP361.phaseABlocks.toLocaleString('en-US')} blocks after activation)`,
      estimatedAt: phaseA,
      effect:
        'Sends to quantum-vulnerable addresses are rejected. Legacy addresses can still be spent from, but can no longer receive.',
    },
    {
      phase: 'phase-b',
      label: `Phase B (${BIP361.phaseBYearsAfterA} years after Phase A)`,
      estimatedAt: phaseB,
      effect:
        'ECDSA and Schnorr spends from legacy outputs are rejected. Coins that have not moved are unspendable.',
    },
    {
      phase: 'phase-c',
      label: 'Phase C (unscheduled)',
      estimatedAt: null,
      effect:
        'A proposed zero-knowledge recovery path for frozen coins, based on proving possession of a BIP-39 seed. Not specified and not built.',
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
    status: 'Draft, published 2026-04-14. Contentious — it freezes coins by design.',
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
