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
  if (
    !Number.isInteger(retries) ||
    retries < 0 ||
    retries > 5 ||
    !Number.isFinite(backoffMs) ||
    backoffMs < 0 ||
    backoffMs > 5000 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 60_000
  ) {
    throw new EsploraError('invalid indexer retry or timeout limits');
  }

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
      // Release error response streams before retrying or returning an error.
      void response.body?.cancel().catch(() => undefined);
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

/** Bound both streamed response size and time spent reading a stalled body. */
export async function readEsploraBody(
  response: Response,
  maxBytes = 8_000_000,
  timeoutMs = 10_000,
  signal?: AbortSignal,
): Promise<string> {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 8_000_000 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 60_000
  ) {
    throw new EsploraError('invalid indexer body limits');
  }
  if (!response.body) throw new EsploraError('empty indexer response');
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const read = async () => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new EsploraError('indexer response exceeds size limit');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  };
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new EsploraError('indexer response aborted'));
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new EsploraError('indexer response body timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

const nonnegative = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export function validateAddressStats(value: unknown): EsploraAddressStats {
  if (!value || typeof value !== 'object') throw new EsploraError('invalid address statistics');
  const stats = value as EsploraAddressStats;
  for (const part of [stats.chain_stats, ...(stats.mempool_stats ? [stats.mempool_stats] : [])]) {
    if (
      !part ||
      !['funded_txo_sum', 'spent_txo_sum', 'spent_txo_count', 'tx_count'].every((key) =>
        nonnegative(part[key as keyof typeof part]),
      )
    )
      throw new EsploraError('invalid address statistics');
  }
  return stats;
}

export async function getAddressStats(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<EsploraAddressStats> {
  const response = await fetchWithRetry(
    `${baseUrl(network, options)}/address/${encodeURIComponent(address)}`,
    options,
  );
  return validateAddressStats(
    JSON.parse(await readEsploraBody(response, 16_000, options.timeoutMs, options.signal)),
  );
}

/** List the confirmed + unconfirmed UTXOs behind an address. */
export async function listUtxos(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: EsploraOptions = {},
): Promise<EsploraUtxo[]> {
  const response = await fetchWithRetry(
    `${baseUrl(network, options)}/address/${encodeURIComponent(address)}/utxo`,
    options,
  );
  const value = JSON.parse(
    await readEsploraBody(response, 2_000_000, options.timeoutMs, options.signal),
  ) as EsploraUtxo[];
  if (!Array.isArray(value) || value.length > 10_000)
    throw new EsploraError('invalid UTXO response');
  const seen = new Set<string>();
  for (const u of value) {
    if (
      !u ||
      typeof u.txid !== 'string' ||
      !/^[0-9a-fA-F]{64}$/.test(u.txid) ||
      !nonnegative(u.vout) ||
      u.vout > 0xffffffff ||
      !nonnegative(u.value) ||
      u.value === 0 ||
      u.value > 2_100_000_000_000_000 ||
      !u.status ||
      typeof u.status.confirmed !== 'boolean'
    )
      throw new EsploraError('invalid UTXO response');
    const key = `${u.txid.toLowerCase()}:${u.vout}`;
    if (seen.has(key)) throw new EsploraError('duplicate indexer UTXO');
    seen.add(key);
  }
  return value;
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
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) throw new EsploraError('invalid transaction id');
  const response = await fetchWithRetry(`${baseUrl(network, options)}/tx/${txid}/hex`, options);
  const body = (
    await readEsploraBody(response, 8_000_000, options.timeoutMs, options.signal)
  ).trim();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(body))
    throw new EsploraError('invalid raw transaction response');
  return body;
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
  const estimates = JSON.parse(
    await readEsploraBody(response, 16_000, options.timeoutMs, options.signal),
  );
  if (!estimates || typeof estimates !== 'object' || Array.isArray(estimates))
    throw new EsploraError('invalid fee estimates');
  return estimates as FeeEstimates;
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
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10_000
      ? value
      : fallback;
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
