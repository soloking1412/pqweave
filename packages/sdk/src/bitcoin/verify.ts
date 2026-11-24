import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import type { EvacuationPlan, EvacuationTier } from './evacuation.js';

/**
 * Dry run for a sweep PSBT.
 *
 * Signing is irreversible once broadcast, so a PSBT should be readable before
 * it is signed rather than trusted because we produced it. `describePsbt`
 * decodes the bundle and states plainly what it does — how much goes where,
 * what the fee is, whether it can be fee-bumped — and `verifySweepMatchesPlan`
 * checks that it matches the plan it claims to implement. Together they are the
 * artifact a careful custodian (or an auditor) inspects before a device ever
 * sees the transaction.
 */

export interface PsbtDescriptionInput {
  index: number;
  txid: string;
  vout: number;
  amountSats: bigint | undefined;
  /** Opt-in RBF (sequence < 0xfffffffe), so a stuck tx can be fee-bumped. */
  replaceable: boolean;
  hasNonWitnessUtxo: boolean;
  hasWitnessUtxo: boolean;
  hasDerivation: boolean;
}

export interface PsbtDescriptionOutput {
  index: number;
  address: string | undefined;
  amountSats: bigint;
}

export interface PsbtDescription {
  inputCount: number;
  outputCount: number;
  totalInputSats: bigint | undefined;
  totalOutputSats: bigint;
  /** Undefined when an input amount is missing and the fee cannot be derived. */
  feeSats: bigint | undefined;
  /** Effective sat/vB, using the estimated signed vsize. */
  feeRate: number | undefined;
  vsize: number;
  inputs: PsbtDescriptionInput[];
  outputs: PsbtDescriptionOutput[];
  /** Every input opts into RBF. */
  replaceable: boolean;
  /** Exactly one output — a true sweep leaves no change behind. */
  isSweep: boolean;
  /** Every input carries a BIP-32 derivation a hardware wallet can match. */
  hardwareReady: boolean;
  /** Human-readable notes for display next to the transaction. */
  notes: string[];
}

/**
 * Signed-vsize contribution per input, keyed by the script type OutScript
 * reports. `tx.vsize` only works on a finalized transaction, and the whole
 * point of a dry run is to inspect the PSBT *before* it is signed, so the size
 * (and therefore the fee rate) is estimated from the spent scripts instead.
 */
const INPUT_VSIZE_BY_SCRIPT: Record<string, number> = {
  pkh: 148,
  wpkh: 68,
  sh: 91, // assume P2SH-P2WPKH
  wsh: 105,
  tr: 58,
  pk: 114,
};
const TX_OVERHEAD_VSIZE = 11;

function spentScript(input: ReturnType<btc.Transaction['getInput']>): Uint8Array | undefined {
  if (input.witnessUtxo) return input.witnessUtxo.script;
  const prev = input.nonWitnessUtxo;
  if (prev && typeof input.index === 'number') return prev.outputs?.[input.index]?.script;
  return undefined;
}

function estimateVsize(tx: btc.Transaction): number {
  const compactSize = (n: number) => (n < 253 ? 1 : n <= 65535 ? 3 : 5);
  let total =
    TX_OVERHEAD_VSIZE + compactSize(tx.inputsLength) - 1 + compactSize(tx.outputsLength) - 1;
  for (let i = 0; i < tx.outputsLength; i++) {
    const size = tx.getOutput(i).script?.length ?? 0;
    total += 8 + compactSize(size) + size;
  }
  for (let i = 0; i < tx.inputsLength; i++) {
    const script = spentScript(tx.getInput(i));
    let type = 'pkh';
    try {
      if (script) type = btc.OutScript.decode(script).type;
    } catch {
      /* fall back to the conservative legacy size */
    }
    total += INPUT_VSIZE_BY_SCRIPT[type] ?? 148;
  }
  return Math.ceil(total);
}

function inputAmount(input: ReturnType<btc.Transaction['getInput']>): bigint | undefined {
  if (input.witnessUtxo) return input.witnessUtxo.amount;
  const prev = input.nonWitnessUtxo;
  if (prev && typeof input.index === 'number') {
    const out = prev.outputs?.[input.index];
    if (out) return out.amount;
  }
  return undefined;
}

/**
 * Decode a PSBT and report exactly what it does. Works on unsigned and signed
 * bundles alike, so the same description can be shown before signing and again
 * before broadcast.
 */
export function describePsbt(psbtBase64: string, testnet = false): PsbtDescription {
  const tx = btc.Transaction.fromPSBT(base64.decode(psbtBase64));
  const network = testnet ? btc.TEST_NETWORK : btc.NETWORK;

  const inputs: PsbtDescriptionInput[] = [];
  let totalInputSats = 0n;
  let inputAmountsKnown = true;

  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const amount = inputAmount(input);
    if (amount === undefined) inputAmountsKnown = false;
    else totalInputSats += amount;
    inputs.push({
      index: i,
      txid: input.txid ? hex.encode(input.txid) : '',
      vout: input.index ?? 0,
      amountSats: amount,
      replaceable: (input.sequence ?? 0xffffffff) < 0xfffffffe,
      hasNonWitnessUtxo: Boolean(input.nonWitnessUtxo),
      hasWitnessUtxo: Boolean(input.witnessUtxo),
      hasDerivation: Boolean(input.bip32Derivation || input.tapBip32Derivation),
    });
  }

  const outputs: PsbtDescriptionOutput[] = [];
  let totalOutputSats = 0n;
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    const amount = output.amount ?? 0n;
    totalOutputSats += amount;
    let address: string | undefined;
    try {
      if (output.script) {
        const decoded = btc.OutScript.decode(output.script);
        address = btc
          .Address(network)
          .encode(decoded as Parameters<ReturnType<typeof btc.Address>['encode']>[0]);
      }
    } catch {
      address = undefined;
    }
    outputs.push({ index: i, address, amountSats: amount });
  }

  const feeSats = inputAmountsKnown ? totalInputSats - totalOutputSats : undefined;
  const vsize = estimateVsize(tx);
  const replaceable = inputs.length > 0 && inputs.every((i) => i.replaceable);
  const hardwareReady = inputs.length > 0 && inputs.every((i) => i.hasDerivation);

  const notes: string[] = [];
  if (!replaceable) {
    notes.push('Not replaceable: a stuck transaction cannot be fee-bumped with RBF.');
  }
  if (tx.outputsLength !== 1) {
    notes.push(
      `This is not a clean sweep — it has ${tx.outputsLength} outputs. A sweep should have exactly one, with no change.`,
    );
  }
  if (!hardwareReady) {
    notes.push('Some inputs have no key derivation, so a hardware wallet will not sign them.');
  }
  if (feeSats !== undefined && feeSats < 0n) {
    notes.push('Outputs exceed inputs — this transaction is invalid and will be rejected.');
  }

  return {
    inputCount: tx.inputsLength,
    outputCount: tx.outputsLength,
    totalInputSats: inputAmountsKnown ? totalInputSats : undefined,
    totalOutputSats,
    feeSats,
    feeRate:
      feeSats !== undefined && vsize > 0
        ? Math.round((Number(feeSats) / vsize) * 100) / 100
        : undefined,
    vsize,
    inputs,
    outputs,
    replaceable,
    isSweep: tx.outputsLength === 1,
    hardwareReady,
    notes,
  };
}

export interface PlanMatch {
  ok: boolean;
  /** Every mismatch found between the PSBT and the plan it claims to be. */
  mismatches: string[];
  description: PsbtDescription;
}

/**
 * Assert a PSBT really implements the tier it is presented as. Catches a
 * tampered bundle, a mixed-up tier, and any bug that would otherwise only
 * surface after broadcast.
 */
export function verifySweepMatchesPlan(
  psbtBase64: string,
  plan: EvacuationPlan,
  tier: EvacuationTier,
): PlanMatch {
  const description = describePsbt(psbtBase64, plan.network === 'testnet');
  const mismatches: string[] = [];
  const candidateTx = btc.Transaction.fromPSBT(base64.decode(psbtBase64));
  const plannedTx = btc.Transaction.fromPSBT(base64.decode(tier.psbtBase64));
  if (hex.encode(candidateTx.unsignedTx) !== hex.encode(plannedTx.unsignedTx)) {
    mismatches.push(
      'transaction inputs, outputs, version, or locktime differ from the planned PSBT',
    );
  }

  if (description.outputCount !== 1) {
    mismatches.push(`expected exactly one output, found ${description.outputCount}`);
  }
  const output = description.outputs[0];
  if (output) {
    const sameAddress =
      output.address === plan.destination ||
      ((output.address?.toLowerCase().startsWith('bc1') ||
        output.address?.toLowerCase().startsWith('tb1')) &&
        output.address?.toLowerCase() === plan.destination.toLowerCase());
    if (!sameAddress) {
      mismatches.push(`destination is ${output.address}, expected ${plan.destination}`);
    }
    if (output.amountSats !== tier.outputSats) {
      mismatches.push(`output is ${output.amountSats} sats, expected ${tier.outputSats}`);
    }
  }
  if (description.feeSats === undefined)
    mismatches.push('input amounts are missing; fee cannot be verified');
  if (description.feeSats !== undefined && description.feeSats !== tier.feeSats) {
    mismatches.push(`fee is ${description.feeSats} sats, expected ${tier.feeSats}`);
  }
  for (let i = 0; i < candidateTx.inputsLength; i++) {
    const candidate = candidateTx.getInput(i);
    const planned = i < plannedTx.inputsLength ? plannedTx.getInput(i) : undefined;
    if (
      !planned ||
      inputAmount(candidate) !== inputAmount(planned) ||
      hex.encode(spentScript(candidate) ?? new Uint8Array()) !==
        hex.encode(spentScript(planned) ?? new Uint8Array())
    ) {
      mismatches.push(`input ${i} funding amount or script differs from plan`);
    }
    if (
      candidate.sighashType !== undefined &&
      candidate.sighashType !== 0 &&
      candidate.sighashType !== 1
    ) {
      mismatches.push(`input ${i} uses an unsafe signature hash mode`);
    }
    const safeEcdsa = (sig: Uint8Array) => sig.length > 0 && sig[sig.length - 1] === 1;
    const safeTaproot = (sig: Uint8Array) =>
      sig.length === 64 || (sig.length === 65 && sig[64] === 1);
    if (
      candidate.partialSig?.some(([, sig]) => !safeEcdsa(sig)) ||
      (candidate.tapKeySig && !safeTaproot(candidate.tapKeySig))
    ) {
      mismatches.push(`input ${i} signature does not commit to the complete transaction`);
    }
    const script = spentScript(candidate);
    const kind = script ? btc.OutScript.decode(script).type : undefined;
    if (candidate.finalScriptWitness?.length) {
      const sig = candidate.finalScriptWitness[0]!;
      if (!(kind === 'tr' ? safeTaproot(sig) : safeEcdsa(sig))) {
        mismatches.push(`input ${i} final witness uses an unsafe signature hash mode`);
      }
    }
    if (kind === 'pkh' && candidate.finalScriptSig?.length) {
      const sig = btc.Script.decode(candidate.finalScriptSig)[0];
      if (!(sig instanceof Uint8Array) || !safeEcdsa(sig)) {
        mismatches.push(`input ${i} final script uses an unsafe signature hash mode`);
      }
    }
  }
  if (!description.replaceable) mismatches.push('not all inputs opt into RBF');

  return { ok: mismatches.length === 0, mismatches, description };
}
