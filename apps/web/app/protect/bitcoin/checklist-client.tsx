'use client';

import { useEffect, useState } from 'react';
import { deriveAddresses, isExtendedKey, parseExtendedKey } from '@pqweave/sdk/bitcoin';

interface BitcoinScanRow {
  address: string;
  status: 'exposed' | 'safe' | 'error';
  detail: string;
  balance?: string;
  type?: string;
  /** Derivation path (e.g. "0/3"), present only for xpub-derived addresses. */
  path?: string;
}

const STORAGE_KEY = 'pqweave-btc-checklist';
const MAX_PER_CHAIN = 15;
const SCAN_CONCURRENCY = 5;

const CHECKLIST = [
  'Create a brand-new native SegWit address (bc1q…) in your own wallet. Do not reuse an old one, and avoid Taproot (bc1p), its output key is visible as soon as the output is created.',
  'Review exposed ordinary BTC with your wallet before moving it. Check fees, privacy, recovery and any inscriptions or Runes; avoid blind consolidation.',
  'Stop reusing addresses: receive each new payment into its own fresh address.',
  'Track experimental QSB and proposed consensus upgrades separately. This standard wallet route only reduces key exposure; it does not add post-quantum signatures.',
];

function parseAddresses(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

async function scanOne(address: string, path?: string): Promise<BitcoinScanRow> {
  try {
    const res = await fetch(`/api/scan?address=${encodeURIComponent(address)}&chain=bitcoin`);
    const data = await res.json();
    if (!res.ok) return { address, path, status: 'error', detail: data.error ?? 'Scan failed.' };
    return {
      address,
      path,
      status: data.exposed ? 'exposed' : 'safe',
      detail: data.reasons?.[0] ?? '',
      balance: data.balance,
      type: data.type,
    };
  } catch {
    return { address, path, status: 'error', detail: 'Network error.' };
  }
}

/** Scan many addresses with bounded concurrency so we do not hammer the indexer. */
async function scanMany(
  entries: { address: string; path?: string }[],
  concurrency = SCAN_CONCURRENCY,
): Promise<BitcoinScanRow[]> {
  const out: BitcoinScanRow[] = new Array(entries.length);
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const i = cursor++;
      out[i] = await scanOne(entries[i]!.address, entries[i]!.path);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return out;
}

/** Keep the wallet's used extent per chain: drop the long tail of unused addresses. */
function trimToWalletExtent(rows: BitcoinScanRow[]): BitcoinScanRow[] {
  if (!rows.some((r) => r.path)) return rows;
  const used = (r: BitcoinScanRow) =>
    r.status === 'exposed' || (r.balance ? Number(r.balance) > 0 : false);
  const byChain = (prefix: string) => rows.filter((r) => r.path?.startsWith(prefix));
  const keep: BitcoinScanRow[] = [];
  for (const prefix of ['0/', '1/']) {
    const chain = byChain(prefix);
    let lastUsed = -1;
    chain.forEach((r, i) => {
      if (used(r)) lastUsed = i;
    });
    // Keep through the last used address (+ a couple lookahead), else just the first.
    keep.push(...chain.slice(0, Math.max(lastUsed + 3, 1)));
  }
  return keep;
}

export function BitcoinChecklistClient() {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<BitcoinScanRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<'addresses' | 'wallet' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST.map(() => false));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setChecked(JSON.parse(saved));
    } catch {
      // ignore malformed storage
    }
  }, []);

  function toggle(index: number) {
    setChecked((prev) => {
      const next = prev.map((value, i) => (i === index ? !value : value));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }

  async function scan() {
    setError(null);
    setRows(null);
    const trimmedInput = input.trim();
    if (trimmedInput === '') return;
    setScanning(true);
    try {
      if (isExtendedKey(trimmedInput)) {
        setMode('wallet');
        let derived;
        try {
          const parsed = parseExtendedKey(trimmedInput);
          derived = deriveAddresses(parsed, { maxPerChain: MAX_PER_CHAIN });
        } catch {
          setError('That extended public key could not be parsed. Check it and try again.');
          return;
        }
        const results = await scanMany(derived.map((d) => ({ address: d.address, path: d.path })));
        setRows(trimToWalletExtent(results));
      } else {
        setMode('addresses');
        const addresses = parseAddresses(trimmedInput);
        if (addresses.length === 0) {
          setError('Enter one or more Bitcoin addresses, or an xpub/zpub.');
          return;
        }
        setRows(await scanMany(addresses.map((address) => ({ address }))));
      }
    } finally {
      setScanning(false);
    }
  }

  function downloadPlan() {
    if (!rows) return;
    const exposed = rows.filter((row) => row.status === 'exposed');
    const lines = [
      'PQWeave: Bitcoin quantum-exposure migration plan',
      `Generated ${new Date().toISOString()}`,
      mode === 'wallet' ? 'Source: extended public key (watch-only wallet scan)' : '',
      '',
      'Addresses scanned:',
      ...rows.map(
        (row) =>
          `  ${row.path ? `[${row.path}] ` : ''}${row.address} - ${row.status}${
            row.balance ? ` (${row.balance} BTC)` : ''
          }`,
      ),
      '',
      exposed.length > 0
        ? `${exposed.length} address(es) have visible public keys and need a wallet-specific review.`
        : 'No exposure was detected among successful checks. Failed checks and addresses beyond this scan remain unknown.',
      '',
      'Checklist:',
      ...CHECKLIST.map((item, i) => `  [ ] ${i + 1}. ${item}`),
      '',
      'Note: this is transitional risk reduction, not quantum safety. Bitcoin has no',
      'general-purpose post-quantum signature opcode today; experimental QSB is a separate route.',
    ].filter((line) => line !== '');
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pqweave-bitcoin-plan.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  const exposedCount = rows?.filter((row) => row.status === 'exposed').length ?? 0;

  return (
    <div className="rounded-panel border border-rule bg-panel p-6">
      <h2 className="text-xl font-semibold tracking-tight">Check address exposure</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        Get an address exposure report and a readiness checklist. Paste your Bitcoin addresses (up
        to 20), or one extended public key (xpub / ypub / zpub) to scan a limited range of receive
        and change addresses. Extended public keys are processed in your browser; derived addresses
        are queried through our server and its indexer, which can correlate them. This is not a
        complete wallet recovery scan. Never enter a seed or private key.
      </p>

      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="bc1q… addresses (comma/newline separated), or an xpub/zpub…"
        spellCheck={false}
        rows={3}
        className="mt-4 w-full rounded-control bg-well px-3 py-2 font-mono text-xs text-ink outline-none ring-1 ring-rule transition placeholder:text-ink-faint focus:ring-brand/60"
      />
      <button
        onClick={scan}
        disabled={scanning || input.trim() === ''}
        className="mt-3 rounded-control bg-brand px-5 py-3 text-sm font-medium text-paper transition hover:bg-brand-strong active:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:opacity-60"
      >
        {scanning ? 'Checking…' : 'Check my addresses'}
      </button>

      {error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {rows && (
        <div className="mt-6 space-y-4">
          {mode === 'wallet' && (
            <div className="text-xs text-ink-dim">
              Derived {rows.length} addresses from your extended key (receive + change, trimmed to
              the used range).
            </div>
          )}
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={`${row.path ?? ''}${row.address}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-well px-3 py-2"
              >
                <span className="flex items-center gap-2 font-mono text-xs text-ink-2">
                  {row.path && (
                    <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-dim">
                      {row.path}
                    </span>
                  )}
                  {row.address.length > 24
                    ? `${row.address.slice(0, 12)}…${row.address.slice(-8)}`
                    : row.address}
                </span>
                <span
                  className={`text-xs ${
                    row.status === 'exposed'
                      ? 'text-risk-high'
                      : row.status === 'safe'
                        ? 'text-ok'
                        : 'text-ink-dim'
                  }`}
                >
                  {row.status === 'exposed'
                    ? `Key exposed${row.balance ? ` · ${row.balance} BTC` : ''}`
                    : row.status === 'safe'
                      ? 'Key hidden'
                      : row.detail}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-caution/30 bg-caution/10 p-3 text-sm text-caution">
            {exposedCount > 0
              ? `${exposedCount} of ${rows.length} addresses have revealed their public key. Follow the checklist to reduce their exposure.`
              : 'No exposure detected in successful checks. Failed checks and unscanned addresses remain unknown.'}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Your checklist</h3>
            <ul className="mt-3 space-y-2">
              {CHECKLIST.map((item, index) => (
                <li key={item} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked[index] ?? false}
                    onChange={() => toggle(index)}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand"
                  />
                  <span
                    className={`text-sm leading-relaxed ${
                      checked[index] ? 'text-ink-dim line-through' : 'text-ink-2'
                    }`}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={downloadPlan}
            className="rounded-control border border-rule px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-ink/5"
          >
            Download plan (.txt)
          </button>
        </div>
      )}
    </div>
  );
}
