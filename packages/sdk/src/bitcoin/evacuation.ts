import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { classifyUtxoAddress } from './address.js';
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

/** Rough signed vsize contribution per input type (vbytes). */
const INPUT_VSIZE: Record<UtxoAddressType, number> = {
  p2wpkh: 68,
  p2tr: 58,
  p2sh: 91, // assume P2SH-P2WPKH (nested segwit) — the common wrapped case
  p2pkh: 148,
  p2wsh: 105, // conservative single-sig-ish estimate
  unknown: 148,
};
const OUTPUT_VSIZE_P2WPKH = 31;
const TX_OVERHEAD_VSIZE = 11;
/** Below this, an output is dust and the sweep is not worth broadcasting. */
const DUST_SATS = 546n;

type BtcNetwork = typeof btc.NETWORK;

function scriptFor(address: string, network: BtcNetwork): Uint8Array {
  const decoded = btc.Address(network).decode(address);
  return btc.OutScript.encode(decoded as Parameters<typeof btc.OutScript.encode>[0]);
}

/** Estimate the signed vsize of a sweep spending `inputs` to one P2WPKH output. */
export function estimateSweepVsize(inputTypes: UtxoAddressType[]): number {
  const inputs = inputTypes.reduce((sum, type) => sum + (INPUT_VSIZE[type] ?? 148), 0);
  return Math.ceil(TX_OVERHEAD_VSIZE + inputs + OUTPUT_VSIZE_P2WPKH);
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
  // The evacuation kit is Bitcoin-only; testnet is selected explicitly.
  const btcNet = params.testnet ? btc.TEST_NETWORK : btc.NETWORK;

  if (inputs.length === 0) throw new Error('no UTXOs to evacuate');
  if (classifyUtxoAddress(destination, network) === 'unknown') {
    throw new Error('destination is not a recognized address');
  }

  const inputTypes = inputs.map((utxo) => classifyUtxoAddress(utxo.address, network));
  // Validate and prepare every input up front, so a bad one fails before any
  // PSBT is produced rather than partway through the bundle.
  const prepared = inputs.map((utxo, i) => buildInput(utxo, inputTypes[i]!, i, btcNet));

  const vsize = estimateSweepVsize(inputTypes);
  const totalInputSats = inputs.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);

  const notes = prepared.map((p) => p.note);
  const warnings: string[] = [];
  if (notes.some((n) => !n.hardwareSignable)) {
    warnings.push(
      'Some inputs have no key origin, so a hardware wallet will not sign them. Supply the master fingerprint and account path from your wallet to fix this.',
    );
  }
  const signability: SignabilityReport = {
    ready: notes.every((n) => n.hardwareSignable),
    inputs: notes,
    warnings,
  };

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
    for (const { fields } of prepared) {
      tx.addInput(fields as Parameters<btc.Transaction['addInput']>[0]);
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
