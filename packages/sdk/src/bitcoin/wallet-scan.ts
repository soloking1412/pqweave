import { getAddressStats, type EsploraOptions } from './esplora.js';
import { deriveAddresses, parseExtendedKey, type KeyOrigin } from './hd.js';
import { BITCOIN, type UtxoNetwork } from './networks.js';
import { assessUtxoExposure } from './scanner.js';
import type { UtxoExposureResult } from './types.js';

/**
 * Wallet-wide exposure scan for a custodian.
 *
 * Scanning one address at a time does not answer the question an institution
 * actually has: across every account we hold, which coins are already exposed
 * and how much is at risk. This walks whole wallets from their extended public
 * keys, applying a real BIP-44 gap limit (stop after N consecutive unused
 * addresses) instead of a fixed window.
 *
 * Three properties make it usable at scale rather than as a demo:
 *
 *   - **Resumable.** A scan returns a cursor; feeding it back continues where
 *     it stopped, so an interrupted run over hundreds of addresses does not
 *     start over.
 *   - **Rate-limit tolerant.** Requests go through `fetchWithRetry`, which
 *     backs off on 429/5xx rather than failing the run.
 *   - **Cancellable.** An `AbortSignal` stops it cooperatively.
 *
 * Watch-only throughout: extended *public* keys only. Nothing here can spend.
 */

export interface ScanAccount {
  /** Display label used in the report, e.g. "Cold storage 1". */
  label?: string;
  /** xpub / ypub / zpub (or testnet equivalents). */
  extendedKey: string;
  /** Wallet origin, carried through so a sweep can be hardware-signable. */
  origin?: KeyOrigin;
}

export interface ScanAddressRecord extends UtxoExposureResult {
  accountLabel: string;
  /** Relative path from the account key, e.g. "0/3". */
  path: string;
  chain: 'receive' | 'change';
  index: number;
  pubkey: Uint8Array;
  pathComponents?: number[];
  masterFingerprint?: string;
}

/** Position within one account chain. */
export interface ChainPosition {
  nextIndex: number;
  consecutiveUnused: number;
  done: boolean;
}

/** Serializable progress marker, so a scan can resume after an interruption. */
export interface ScanCursor {
  /** Keyed `"<accountLabel>:<chain>"`. */
  positions: Record<string, ChainPosition>;
}

export interface ScanProgress {
  accountLabel: string;
  chain: 'receive' | 'change';
  scanned: number;
  found: number;
}

export interface WalletScanOptions extends EsploraOptions {
  network?: UtxoNetwork;
  /** Consecutive unused addresses before a chain is considered finished. */
  gapLimit?: number;
  /** Addresses derived and queried per round. */
  batchSize?: number;
  /** Concurrent address lookups. Keep modest — public indexers rate-limit. */
  concurrency?: number;
  /** Hard ceiling per chain, so a pathological wallet cannot run forever. */
  maxPerChain?: number;
  /** Resume from a previous scan. */
  cursor?: ScanCursor;
  onProgress?: (progress: ScanProgress) => void;
}

export interface WalletScanResult {
  network: string;
  addresses: ScanAddressRecord[];
  cursor: ScanCursor;
  /** False when a cap or cancellation stopped the scan before the gap limit. */
  complete: boolean;
  /** Addresses whose lookup failed after retries; the scan continues past them. */
  errors: { address: string; message: string }[];
}

/** Run `tasks` with bounded concurrency, preserving input order. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

const positionKey = (label: string, chain: string) => `${label}:${chain}`;

/**
 * Scan every account in a wallet for quantum exposure. Reuses
 * {@link assessUtxoExposure} so the exposure rules stay in one place.
 */
export async function scanWallet(
  accounts: ScanAccount[],
  options: WalletScanOptions = {},
): Promise<WalletScanResult> {
  const network = options.network ?? BITCOIN;
  const gapLimit = options.gapLimit ?? 20;
  const batchSize = options.batchSize ?? 20;
  const concurrency = options.concurrency ?? 4;
  const maxPerChain = options.maxPerChain ?? 1000;

  const positions: Record<string, ChainPosition> = { ...(options.cursor?.positions ?? {}) };
  const addresses: ScanAddressRecord[] = [];
  const errors: { address: string; message: string }[] = [];
  let complete = true;

  for (const account of accounts) {
    const label = account.label ?? account.extendedKey.slice(0, 12);
    const parsed = parseExtendedKey(account.extendedKey);

    for (const chain of ['receive', 'change'] as const) {
      const key = positionKey(label, chain);
      const position: ChainPosition = positions[key] ?? {
        nextIndex: 0,
        consecutiveUnused: 0,
        done: false,
      };

      while (!position.done) {
        if (options.signal?.aborted) {
          complete = false;
          break;
        }
        if (position.nextIndex >= maxPerChain) {
          complete = false;
          position.done = true;
          break;
        }

        const derived = deriveAddresses(parsed, {
          maxPerChain: Math.min(batchSize, maxPerChain - position.nextIndex),
          startIndex: position.nextIndex,
          chains: [chain],
          ...(account.origin ? { origin: account.origin } : {}),
        });
        if (derived.length === 0) {
          position.done = true;
          break;
        }

        const stats = await pooled(derived, concurrency, async (entry) => {
          try {
            return { entry, stats: await getAddressStats(entry.address, network, options) };
          } catch (error) {
            return { entry, error: error as Error };
          }
        });

        let found = 0;
        for (const result of stats) {
          const { entry } = result;
          if ('error' in result && result.error) {
            errors.push({ address: entry.address, message: result.error.message });
            // An unknown address cannot end a gap run — treat it as inconclusive
            // and keep going rather than truncating the wallet early.
            continue;
          }
          const exposure = assessUtxoExposure(entry.address, network, result.stats!);
          const used = exposure.txCount > 0;
          if (used) {
            found++;
            position.consecutiveUnused = 0;
            addresses.push({
              ...exposure,
              accountLabel: label,
              path: entry.path,
              chain: entry.chain,
              index: entry.index,
              pubkey: entry.pubkey,
              ...(entry.pathComponents ? { pathComponents: entry.pathComponents } : {}),
              ...(entry.masterFingerprint ? { masterFingerprint: entry.masterFingerprint } : {}),
            });
          } else {
            position.consecutiveUnused++;
          }
        }

        position.nextIndex += derived.length;
        options.onProgress?.({
          accountLabel: label,
          chain,
          scanned: position.nextIndex,
          found,
        });

        if (position.consecutiveUnused >= gapLimit) position.done = true;
      }

      positions[key] = position;
      if (options.signal?.aborted) break;
    }
    if (options.signal?.aborted) {
      complete = false;
      break;
    }
  }

  return { network: network.id, addresses, cursor: { positions }, complete, errors };
}
