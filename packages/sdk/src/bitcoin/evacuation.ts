import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { classifyUtxoAddress } from './address.js';
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
}

export interface BuildEvacuationParams {
  inputs: EvacuationInput[];
  /** Fresh, never-used destination address (validated by the caller). */
  destination: string;
  /** sat/vB rates keyed by tier. */
  feeRates: { economy: number; standard: number; priority: number };
  network?: UtxoNetwork;
  /** Testnet address params (tb1…). Defaults to mainnet. */
  testnet?: boolean;
}

/**
 * Build one unsigned sweep PSBT per fee tier. Every input is spent; a single
 * output pays the destination; RBF is enabled so a stuck broadcast can be
 * fee-bumped. Tiers whose fee would push the output to dust are skipped, not
 * silently under-funded.
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
  const vsize = estimateSweepVsize(inputTypes);
  const totalInputSats = inputs.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);

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
    for (const utxo of inputs) {
      tx.addInput({
        txid: hex.decode(utxo.txid),
        index: utxo.vout,
        witnessUtxo: { script: scriptFor(utxo.address, btcNet), amount: BigInt(utxo.value) },
        sequence: 0xfffffffd, // opt-in RBF
      });
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
