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
  /** Retries on 429/5xx before giving up. Default 3. */
  retries?: number;
  /** Base backoff in ms, doubled per attempt. Default 400. */
  backoffMs?: number;
  /**
   * Per-attempt timeout in ms. Default 10s. Bounding each attempt keeps the
   * whole retry budget predictable: without it one hung request can outlast the
   * caller's own deadline and retries make a slow call fail rather than
   * recover.
   */
  timeoutMs?: number;
  /** Cooperative cancellation for long batch scans. */
  signal?: AbortSignal;
}

/** Thrown when an Esplora call fails after exhausting retries. */
export class EsploraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EsploraError';
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Fetch with bounded retries. Public indexers rate-limit aggressively, and a
 * custodian-scale wallet scan walks hundreds of addresses — a single 429 must
 * not sink the run. Retries 429 and 5xx with exponential backoff; 4xx (other
 * than 429) fails immediately because retrying a bad request never helps.
 */
export async function fetchWithRetry(
  url: string,
  options: EsploraOptions = {},
  init?: RequestInit,
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 3;
  const backoffMs = options.backoffMs ?? 400;

  const timeoutMs = options.timeoutMs ?? 10_000;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.signal?.aborted) throw new Error('aborted');
    // One controller per attempt: it fires on timeout, and mirrors the caller's
    // signal so cancellation still propagates.
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, { ...init, signal: controller.signal });
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) {
        throw new EsploraError(`request failed (${response.status})`, response.status);
      }
      lastError = new EsploraError(`request failed (${response.status})`, response.status);
    } catch (error) {
      // The caller cancelling is final; our own per-attempt timeout is not.
      if (options.signal?.aborted) throw new Error('aborted');
      if (
        error instanceof EsploraError &&
        error.status &&
        error.status < 500 &&
        error.status !== 429
      ) {
        throw error;
      }
      const timedOut = controller.signal.aborted;
      const wrapped = timedOut
        ? new EsploraError(`request timed out after ${timeoutMs}ms`)
        : (error as Error);
      if (attempt === retries) throw wrapped;
      lastError = wrapped;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
    await sleep(backoffMs * 2 ** attempt, options.signal);
  }
  throw lastError ?? new EsploraError('request failed');
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
  const response = await fetchWithRetry(`${baseUrl(network, options)}/address/${address}`, options);
  return (await response.json()) as EsploraAddressStats;
}

/** List the confirmed + unconfirmed UTXOs behind an address. */
export async function listUtxos(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<EsploraUtxo[]> {
  const response = await fetchWithRetry(
    `${baseUrl(network, options)}/address/${address}/utxo`,
    options,
  );
  return (await response.json()) as EsploraUtxo[];
}

/**
 * Fetch a full raw transaction (hex). Required to populate a PSBT's
 * `nonWitnessUtxo`, without which a legacy (P2PKH) input cannot be signed at
 * all — by a hardware wallet or otherwise.
 */
export async function getTxHex(
  txid: string,
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<string> {
  const response = await fetchWithRetry(`${baseUrl(network, options)}/tx/${txid}/hex`, options);
  return (await response.text()).trim();
}

/**
 * Fetch fee estimates (sat/vB) per confirmation target. Esplora returns a map
 * like `{ "1": 42.1, "6": 20.0, "144": 1.0, ... }`.
 */
export async function getFeeEstimates(
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<FeeEstimates> {
  const response = await fetchWithRetry(`${baseUrl(network, options)}/fee-estimates`, options);
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
