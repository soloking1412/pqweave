import { BITCOIN, type UtxoNetwork } from './networks.js';
import type { EsploraAddressStats } from './types.js';

/**
 * Esplora REST client (blockstream.info-compatible). Only ever sends addresses
 * and already-formed transactions — never a private key. Every call is
 * best-effort and throws a typed error the caller can degrade on.
 */

export interface EsploraOptions {
  /** Override the network's default Esplora base URL. */
  apiUrl?: string;
  /** Fetch implementation, for testing or a server-side proxy. */
  fetchImpl?: typeof fetch;
}

/** A single unspent output as returned by `GET /address/:address/utxo`. */
export interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number };
}

/** Fee estimates in sat/vB, keyed by confirmation target (blocks). */
export type FeeEstimates = Record<string, number>;

function baseUrl(network: UtxoNetwork, options: EsploraOptions): string {
  return options.apiUrl ?? network.apiUrl;
}

export async function getAddressStats(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<EsploraAddressStats> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${baseUrl(network, options)}/address/${address}`);
  if (!response.ok) throw new Error(`failed to fetch ${network.name} address stats`);
  return (await response.json()) as EsploraAddressStats;
}

/** List the confirmed + unconfirmed UTXOs behind an address. */
export async function listUtxos(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<EsploraUtxo[]> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${baseUrl(network, options)}/address/${address}/utxo`);
  if (!response.ok) throw new Error(`failed to fetch ${network.name} UTXOs`);
  return (await response.json()) as EsploraUtxo[];
}

/**
 * Fetch fee estimates (sat/vB) per confirmation target. Esplora returns a map
 * like `{ "1": 42.1, "6": 20.0, "144": 1.0, ... }`.
 */
export async function getFeeEstimates(
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<FeeEstimates> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${baseUrl(network, options)}/fee-estimates`);
  if (!response.ok) throw new Error(`failed to fetch ${network.name} fee estimates`);
  return (await response.json()) as FeeEstimates;
}

export interface FeeTiers {
  economy: number;
  standard: number;
  priority: number;
}

/**
 * Collapse the raw Esplora estimate map into three practical tiers (sat/vB),
 * with sane floors so a quiet mempool never produces a sub-relay fee.
 */
export function feeTiers(estimates: FeeEstimates): FeeTiers {
  const at = (target: number, fallback: number) => {
    const value = estimates[String(target)];
    return typeof value === 'number' && value > 0 ? value : fallback;
  };
  const priority = Math.max(at(1, 20), 2);
  const standard = Math.max(at(6, 10), 1.5);
  const economy = Math.max(at(144, 2), 1);
  return {
    economy: Math.round(economy * 10) / 10,
    standard: Math.round(standard * 10) / 10,
    priority: Math.round(priority * 10) / 10,
  };
}

/**
 * Broadcast a raw (hex) transaction via `POST /tx`. Returns the txid on success.
 * The caller supplies an already-signed transaction; no key material is involved.
 */
export async function broadcastTx(
  rawTxHex: string,
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${baseUrl(network, options)}/tx`, {
    method: 'POST',
    body: rawTxHex,
  });
  const text = (await response.text()).trim();
  if (!response.ok) throw new Error(text || `broadcast failed on ${network.name}`);
  return text;
}
