import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { classifyUtxoAddress, isBitcoinAddressOnNetwork } from './address.js';
import { parseMasterFingerprint } from './hd.js';
import { BITCOIN, type UtxoNetwork } from './networks.js';
import type { EsploraUtxo } from './esplora.js';
import type { UtxoAddressType } from './types.js';

/**
 * Evacuation kit: build RBF-enabled *sweep* transactions (all inputs → one
 * fresh destination, no change) as unsigned PSBTs at several fee tiers. Signing
 * happens entirely in the user's own wallet; this module never sees a private
 * key. Pre-signing reveals nothing on-chain — the public key only appears when
 * the transaction is broadcast — so the bundle can sit ready and be broadcast
 * within minutes of a quantum-trigger event. This is reaction-time reduction,
 * not quantum safety: the broadcast still races the mempool.
 *
 * A PSBT is only useful if a real signer accepts it, so each input carries the
 * fields its script type requires:
 *
 *   - legacy (p2pkh) and wrapped segwit (p2sh) need `nonWitnessUtxo`, the full
 *     previous transaction. Without it the input cannot be signed at all.
 *   - wrapped segwit also needs the `redeemScript`, derived from the pubkey.
 *   - taproot needs `tapInternalKey`, the x-only internal key.
 *   - every type takes `bip32Derivation` when the wallet origin is known; a
 *     hardware wallet uses it to match an input against its own keys, and
 *     refuses to sign without it.
 *
 * Inputs that cannot be made signable are rejected outright rather than
 * silently emitted, because an unsignable escape hatch is worse than none: it
 * is discovered at the moment it is needed.
 */

/**
 * Signed vsize contribution per input type (vbytes), **single-signature only**.
 *
 * A multisig input is several times larger than these figures, so estimating
 * one here would underpay the fee and leave the sweep stuck in the mempool —
 * which, during an evacuation, is indistinguishable from failing. We do not
 * guess: script types whose true size cannot be known from a watch-only address
 * are rejected outright in `buildInput`, and a key that does not derive its own
 * address (the way a P2SH-multisig would not) is rejected by
 * `verifyPubkeyControlsAddress`. The entries below are reachable only for the
 * single-sig types those checks let through.
 */
const INPUT_VSIZE: Record<UtxoAddressType, number> = {
  p2wpkh: 68,
  p2tr: 58,
  p2sh: 91, // P2SH-P2WPKH; any other P2SH shape is rejected before it gets here
  p2pkh: 148,
  p2wsh: 105, // rejected at build — kept so the public estimator stays total
  p2mr: 105, // BIP-360 script-path spend; not spendable until activation
  unknown: 148,
};
const TX_OVERHEAD_VSIZE = 11;
/** Below this, an output is dust and the sweep is not worth broadcasting. */
const DUST_SATS = 546n;

type BtcNetwork = typeof btc.NETWORK;

function scriptFor(address: string, network: BtcNetwork): Uint8Array {
  const decoded = btc.Address(network).decode(address);
  return btc.OutScript.encode(decoded as Parameters<typeof btc.OutScript.encode>[0]);
}

/** Estimate the signed vsize of a sweep spending `inputs` to one P2WPKH output. */
export function estimateSweepVsize(inputTypes: UtxoAddressType[], outputScriptBytes = 22): number {
  const inputs = inputTypes.reduce((sum, type) => sum + (INPUT_VSIZE[type] ?? 148), 0);
  const countBytes = inputTypes.length < 253 ? 1 : inputTypes.length <= 65535 ? 3 : 5;
  const scriptLengthBytes = outputScriptBytes < 253 ? 1 : 3;
  return Math.ceil(
    TX_OVERHEAD_VSIZE + countBytes - 1 + inputs + 8 + scriptLengthBytes + outputScriptBytes,
  );
}

export interface EvacuationInput extends EsploraUtxo {
  /** The address that holds this UTXO (its scriptPubKey is derived from it). */
  address: string;
  /**
   * Full previous transaction, hex. Required for legacy (p2pkh) and wrapped
   * segwit (p2sh) inputs — they cannot be signed without it. Fetch with
   * {@link getTxHex}.
   */
  prevTxHex?: string;
  /** 33-byte compressed public key controlling this UTXO. */
  pubkey?: Uint8Array;
  /** Full BIP-32 path components, from {@link deriveAddresses} with an origin. */
  pathComponents?: number[];
  /** Master fingerprint, 8 hex characters. */
  masterFingerprint?: string;
}

/** Why a given input can or cannot be signed, per signer class. */
export interface InputSignability {
  index: number;
  address: string;
  type: UtxoAddressType;
  /** The PSBT carries `bip32Derivation`, so a hardware wallet can match a key. */
  hardwareSignable: boolean;
  /** Notes worth showing the user (not fatal — fatal cases throw instead). */
  issues: string[];
}

export interface SignabilityReport {
  /** Every input carries the derivation a hardware wallet needs. */
  ready: boolean;
  inputs: InputSignability[];
  warnings: string[];
}

export interface EvacuationTier {
  label: 'economy' | 'standard' | 'priority';
  /** sat/vB used for this tier. */
  feeRate: number;
  /** Total fee in sats. */
  feeSats: bigint;
  /** Amount delivered to the destination after fee. */
  outputSats: bigint;
  /** Unsigned PSBT, base64-encoded. */
  psbtBase64: string;
}

export interface EvacuationPlan {
  destination: string;
  network: 'bitcoin' | 'testnet';
  totalInputSats: bigint;
  vsize: number;
  tiers: EvacuationTier[];
  /** Tiers dropped because the fee would leave a dust (or negative) output. */
  skipped: { label: string; reason: string }[];
  /** Which inputs a real signer can handle, and what is missing. */
  signability: SignabilityReport;
}

export interface BuildEvacuationParams {
  inputs: EvacuationInput[];
  /** Fresh, never-used destination address (see `checkDestination`). */
  destination: string;
  /** sat/vB rates keyed by tier. */
  feeRates: { economy: number; standard: number; priority: number };
  network?: UtxoNetwork;
  /** Testnet address params (tb1…). Defaults to mainnet. */
  testnet?: boolean;
}

/** Thrown when an input cannot be turned into a signable PSBT input. */
export class UnsignableInputError extends Error {
  constructor(
    message: string,
    readonly address: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = 'UnsignableInputError';
  }
}

const XONLY = (pubkey: Uint8Array) => pubkey.subarray(1, 33);

/**
 * Thrown when the facts supplied about a UTXO contradict each other — the
 * previous transaction does not match the outpoint, the amount disagrees, or
 * the public key does not control the address.
 *
 * Distinct from {@link UnsignableInputError} because the cause is different and
 * so is the fix: that one means "your signer cannot handle this input", this
 * one means "the data you were given is wrong, and possibly hostile".
 */
export class InconsistentUtxoError extends Error {
  constructor(
    message: string,
    readonly address: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = 'InconsistentUtxoError';
  }
}

/**
 * Check the supplied previous transaction really is the one being spent.
 *
 * The indexer is untrusted. If it can put a previous transaction into a PSBT
 * that does not correspond to the outpoint, it controls what the signing device
 * believes the input is worth — and the difference between the believed amount
 * and the real one is paid to the miner. That is the fee-inflation attack that
 * forced hardware wallets to demand full previous transactions in the first
 * place (CVE-2020-14199), and attaching `nonWitnessUtxo` without checking it
 * reintroduces exactly the hole the field exists to close.
 */
function verifyPrevTx(utxo: EvacuationInput, script: Uint8Array): void {
  let prev: btc.Transaction;
  try {
    prev = btc.Transaction.fromRaw(hex.decode(utxo.prevTxHex!), {
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch (error) {
    throw new InconsistentUtxoError(
      `Cannot sweep ${utxo.address}: the supplied previous transaction could not be parsed (${(error as Error).message}).`,
      utxo.address,
      'prevtx-unparseable',
    );
  }

  if (prev.id !== utxo.txid.toLowerCase()) {
    throw new InconsistentUtxoError(
      `Cannot sweep ${utxo.address}: the supplied previous transaction hashes to ${prev.id}, but this UTXO is on ${utxo.txid}. Refusing to build a PSBT from mismatched data.`,
      utxo.address,
      'prevtx-txid-mismatch',
    );
  }

  if (utxo.vout >= prev.outputsLength) {
    throw new InconsistentUtxoError(
      `Cannot sweep ${utxo.address}: output index ${utxo.vout} does not exist in transaction ${utxo.txid} (it has ${prev.outputsLength}).`,
      utxo.address,
      'prevtx-vout-out-of-range',
    );
  }

  const output = prev.getOutput(utxo.vout);
  if (output.amount !== BigInt(utxo.value)) {
    throw new InconsistentUtxoError(
      `Cannot sweep ${utxo.address}: the indexer reports ${utxo.value} sats but the previous transaction pays ${output.amount} sats to this outpoint. Signing against a wrong amount hands the difference to the miner.`,
      utxo.address,
      'prevtx-amount-mismatch',
    );
  }

  if (!output.script || hex.encode(output.script) !== hex.encode(script)) {
    throw new InconsistentUtxoError(
      `Cannot sweep ${utxo.address}: the previous transaction pays a different script than this address. The UTXO does not belong to it.`,
      utxo.address,
      'prevtx-script-mismatch',
    );
  }
}

/**
 * Check the supplied public key actually controls the address.
 *
 * Every script we build from a key — the wrapped-SegWit redeem script, the
 * Taproot internal key — is only correct if the key is the right one. Rebuilding
 * the address from the key and comparing is the cheapest possible proof.
 *
 * It also closes the multisig hole: a P2SH-multisig address classifies as
 * `p2sh`, and without this check it would be handed a single-sig redeem script,
 * producing a PSBT that no signer can use and whose fee estimate is far too low.
 */
function verifyPubkeyControlsAddress(
  utxo: EvacuationInput,
  type: UtxoAddressType,
  btcNet: BtcNetwork,
): void {
  const pubkey = utxo.pubkey;
  if (!pubkey) return; // absence is handled by the per-type required checks

  let derived: string | undefined;
  try {
    switch (type) {
      case 'p2pkh':
        derived = btc.p2pkh(pubkey, btcNet).address;
        break;
      case 'p2wpkh':
        derived = btc.p2wpkh(pubkey, btcNet).address;
        break;
      case 'p2sh':
        derived = btc.p2sh(btc.p2wpkh(pubkey, btcNet), btcNet).address;
        break;
      case 'p2tr':
        derived = btc.p2tr(XONLY(pubkey), undefined, btcNet).address;
        break;
      default:
        return;
    }
  } catch {
    derived = undefined;
  }

  if (
    !derived ||
    hex.encode(scriptFor(derived, btcNet)) !== hex.encode(scriptFor(utxo.address, btcNet))
  ) {
    throw new InconsistentUtxoError(
      `Cannot sweep ${utxo.address}: the supplied public key derives ${derived ?? 'nothing'} for a ${type} address, not this one. Either the key is wrong, or this is a script (e.g. multisig) address that only looks single-sig.`,
      utxo.address,
      'pubkey-address-mismatch',
    );
  }
}

/**
 * Build the PSBT input fields for one UTXO, or throw if the result would be
 * unsignable. Returns the fields plus a signability note.
 */
function buildInput(
  utxo: EvacuationInput,
  type: UtxoAddressType,
  index: number,
  btcNet: BtcNetwork,
): { fields: Record<string, unknown>; note: InputSignability } {
  const issues: string[] = [];
  const amount = BigInt(utxo.value);
  const needsPrevTx = type === 'p2pkh' || type === 'p2sh';

  // Validate before touching the address codec, so an unrecognized address
  // surfaces as a clear error rather than a base58 decoding failure.
  if (type === 'unknown') {
    throw new UnsignableInputError(
      `Cannot sweep ${utxo.address}: unrecognized address type.`,
      utxo.address,
      'unrecognized-type',
    );
  }
  if (type === 'p2wsh') {
    throw new UnsignableInputError(
      `Cannot sweep ${utxo.address}: P2WSH (script) inputs need the witness script, which a watch-only address does not reveal.`,
      utxo.address,
      'p2wsh-unsupported',
    );
  }
  if (type === 'p2mr') {
    throw new UnsignableInputError(
      `Cannot sweep ${utxo.address}: BIP-360 (P2MR) is still a draft and the supported public networks do not enforce its spending rules, so a spend cannot be constructed. Under current consensus this output is anyone-can-spend.`,
      utxo.address,
      'p2mr-not-activated',
    );
  }
  if (needsPrevTx && !utxo.prevTxHex) {
    throw new UnsignableInputError(
      `Cannot sweep ${utxo.address}: a ${type === 'p2pkh' ? 'legacy' : 'wrapped SegWit'} input requires its full previous transaction (nonWitnessUtxo). Fetch it with getTxHex before building.`,
      utxo.address,
      'missing-prev-tx',
    );
  }
  if (type === 'p2sh' && !utxo.pubkey) {
    throw new UnsignableInputError(
      `Cannot sweep ${utxo.address}: a wrapped SegWit input needs its public key to rebuild the redeem script. Derive it from the account xpub.`,
      utxo.address,
      'missing-pubkey',
    );
  }
  if (type === 'p2tr' && !utxo.pubkey) {
    throw new UnsignableInputError(
      `Cannot sweep ${utxo.address}: a Taproot input needs its internal public key to sign. Derive it from the account xpub.`,
      utxo.address,
      'missing-pubkey',
    );
  }

  const script = scriptFor(utxo.address, btcNet);

  // Everything below builds signing material out of the caller's data, so
  // check that data is self-consistent before trusting any of it.
  verifyPubkeyControlsAddress(utxo, type, btcNet);
  if (utxo.prevTxHex) verifyPrevTx(utxo, script);

  const fields: Record<string, unknown> = {
    txid: hex.decode(utxo.txid),
    index: utxo.vout,
    sequence: 0xfffffffd, // opt-in RBF
  };

  // Segwit types are spent against the witness UTXO; legacy against the full
  // previous transaction. Wrapped segwit wants both.
  if (type !== 'p2pkh') fields.witnessUtxo = { script, amount };
  if (utxo.prevTxHex) fields.nonWitnessUtxo = hex.decode(utxo.prevTxHex);
  else if (type === 'p2wpkh') {
    issues.push(
      'No previous transaction supplied; some devices (Trezor) require it even for SegWit.',
    );
  }

  if (type === 'p2sh') {
    // P2SH-P2WPKH: the redeem script is the inner P2WPKH scriptPubKey.
    fields.redeemScript = btc.p2wpkh(utxo.pubkey!, btcNet).script;
  }

  const hasOrigin = Boolean(utxo.pubkey && utxo.pathComponents && utxo.masterFingerprint);
  if (hasOrigin) {
    const der = {
      fingerprint: parseMasterFingerprint(utxo.masterFingerprint!),
      path: utxo.pathComponents!,
    };
    if (type === 'p2tr') {
      fields.tapBip32Derivation = [[XONLY(utxo.pubkey!), { hashes: [], der }]];
    } else {
      fields.bip32Derivation = [[utxo.pubkey!, der]];
    }
  } else {
    issues.push(
      'No key origin (master fingerprint + account path), so a hardware wallet cannot match this input to one of its keys. Your wallet software can still sign it if it owns the address.',
    );
  }

  if (type === 'p2tr') fields.tapInternalKey = XONLY(utxo.pubkey!);

  return {
    fields,
    note: { index, address: utxo.address, type, hardwareSignable: hasOrigin, issues },
  };
}

/** Everything a sweep needs about its inputs, before an output is chosen. */
export interface PreparedSweepInputs {
  /** PSBT input fields, ready to hand to `Transaction.addInput`. */
  fields: Record<string, unknown>[];
  inputTypes: UtxoAddressType[];
  totalInputSats: bigint;
  /** Estimated signed vsize for a sweep to a single P2WPKH-sized output. */
  vsize: number;
  signability: SignabilityReport;
}

/**
 * Validate and prepare every input up front, so a bad one fails before any PSBT
 * is produced rather than partway through the bundle. Shared by the evacuation
 * kit and the BIP-360 migration builder so both inherit the same fail-loud
 * rules — the signing correctness lives in exactly one place.
 */
export function prepareSweepInputs(
  inputs: EvacuationInput[],
  network: UtxoNetwork = BITCOIN,
  testnet = false,
): PreparedSweepInputs {
  if (inputs.length === 0) throw new Error('no UTXOs to sweep');
  const seenOutpoints = new Set<string>();
  for (const input of inputs) {
    if (
      !/^[0-9a-fA-F]{64}$/.test(input.txid) ||
      !Number.isSafeInteger(input.vout) ||
      input.vout < 0 ||
      input.vout > 0xffffffff ||
      !Number.isSafeInteger(input.value) ||
      input.value <= 0 ||
      input.value > 2_100_000_000_000_000
    ) {
      throw new Error('UTXO contains an invalid outpoint or amount');
    }
    const outpoint = `${input.txid.toLowerCase()}:${input.vout}`;
    if (seenOutpoints.has(outpoint)) {
      throw new InconsistentUtxoError(
        'duplicate UTXO outpoint',
        input.address,
        'duplicate outpoint',
      );
    }
    seenOutpoints.add(outpoint);
  }
  if (network.id === 'bitcoin') {
    const expectedNetwork = testnet ? 'testnet' : 'bitcoin';
    for (const input of inputs) {
      if (!isBitcoinAddressOnNetwork(input.address, expectedNetwork)) {
        throw new UnsignableInputError(
          `input address is not on Bitcoin ${expectedNetwork}`,
          input.address,
          'invalid or wrong-network address',
        );
      }
    }
  }
  const btcNet = testnet ? btc.TEST_NETWORK : btc.NETWORK;

  const inputTypes = inputs.map((utxo) => classifyUtxoAddress(utxo.address, network));
  const prepared = inputs.map((utxo, i) => buildInput(utxo, inputTypes[i]!, i, btcNet));

  const notes = prepared.map((p) => p.note);
  const warnings: string[] = [];
  if (notes.some((n) => !n.hardwareSignable)) {
    warnings.push(
      'Some inputs have no key origin, so a hardware wallet will not sign them. Supply the master fingerprint and account path from your wallet to fix this.',
    );
  }

  return {
    fields: prepared.map((p) => p.fields),
    inputTypes,
    totalInputSats: inputs.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n),
    vsize: estimateSweepVsize(inputTypes),
    signability: { ready: notes.every((n) => n.hardwareSignable), inputs: notes, warnings },
  };
}

/**
 * Build one unsigned sweep PSBT per fee tier. Every input is spent; a single
 * output pays the destination; RBF is enabled so a stuck broadcast can be
 * fee-bumped. Tiers whose fee would push the output to dust are skipped, not
 * silently under-funded. Inputs that cannot be signed throw
 * {@link UnsignableInputError} rather than producing a broken bundle.
 */
export function buildEvacuationPsbts(params: BuildEvacuationParams): EvacuationPlan {
  const { inputs, destination, feeRates } = params;
  const network = params.network ?? BITCOIN;
  if (network.id !== 'bitcoin') throw new Error('Bitcoin sweep builder only supports Bitcoin');
  // The evacuation kit is Bitcoin-only; testnet is selected explicitly.
  const btcNet = params.testnet ? btc.TEST_NETWORK : btc.NETWORK;

  if (
    classifyUtxoAddress(destination, network) === 'unknown' ||
    (network.id === 'bitcoin' &&
      !isBitcoinAddressOnNetwork(destination, params.testnet ? 'testnet' : 'bitcoin'))
  ) {
    throw new Error('destination is not a recognized address');
  }

  for (const feeRate of Object.values(feeRates)) {
    if (!Number.isFinite(feeRate) || feeRate <= 0 || feeRate > 10_000) {
      throw new Error('fee rates must be finite positive sat/vB values no greater than 10,000');
    }
  }

  const { fields, totalInputSats, inputTypes, signability } = prepareSweepInputs(
    inputs,
    network,
    params.testnet ?? false,
  );
  if (totalInputSats > 2_100_000_000_000_000n)
    throw new Error('total exceeds Bitcoin monetary limit');
  const destinationScript = scriptFor(destination, btcNet);
  const vsize = estimateSweepVsize(inputTypes, destinationScript.length);
  if (vsize * 4 > 400_000)
    throw new Error('sweep exceeds standard transaction weight; split the plan');

  const tiers: EvacuationTier[] = [];
  const skipped: { label: string; reason: string }[] = [];

  for (const label of ['economy', 'standard', 'priority'] as const) {
    const feeRate = feeRates[label];
    const feeSats = BigInt(Math.ceil(vsize * feeRate));
    const outputSats = totalInputSats - feeSats;
    if (outputSats < DUST_SATS) {
      skipped.push({
        label,
        reason: outputSats <= 0n ? 'fee exceeds the balance' : 'output would be dust after fee',
      });
      continue;
    }

    const tx = new btc.Transaction();
    for (const input of fields) {
      tx.addInput(input as Parameters<btc.Transaction['addInput']>[0]);
    }
    tx.addOutputAddress(destination, outputSats, btcNet);
    tiers.push({ label, feeRate, feeSats, outputSats, psbtBase64: base64.encode(tx.toPSBT()) });
  }

  if (tiers.length === 0) {
    throw new Error('balance too small to sweep at any fee tier');
  }

  return {
    destination,
    network: params.testnet ? 'testnet' : 'bitcoin',
    totalInputSats,
    vsize,
    tiers,
    skipped,
    signability,
  };
}

/**
 * Finalize a signed PSBT (base64) and extract the raw transaction hex ready for
 * broadcast. Throws if the PSBT is not fully signed.
 */
export function finalizeSweep(signedPsbtBase64: string): { txid: string; hex: string } {
  const tx = btc.Transaction.fromPSBT(base64.decode(signedPsbtBase64));
  tx.finalize();
  return { txid: tx.id, hex: hex.encode(tx.extract()) };
}
