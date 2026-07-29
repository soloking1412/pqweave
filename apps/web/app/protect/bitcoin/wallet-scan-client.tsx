'use client';

import { useRef, useState } from 'react';
import {
  buildWalletReport,
  isExtendedKey,
  METHODOLOGY,
  parseExtendedKey,
  scanWallet,
  toCsv,
  toJson,
  type ScanAccount,
  type ScanCursor,
  type WalletReport,
  type WalletScanResult,
} from '@pqweave/sdk/bitcoin';

/**
 * Whole-wallet exposure scan for someone holding more than one address.
 *
 * Takes extended *public* keys only — this can read a wallet's exposure and can
 * never spend. Each account walks its receive and change chains until the gap
 * limit is reached, so coverage is determined by the wallet's real shape rather
 * than a fixed window. The scan is cancellable and resumable, because a
 * custodian scanning hundreds of addresses should not have to start over when a
 * run is interrupted.
 *
 * Requests go through a narrow same-origin Esplora proxy; the extended key
 * itself never leaves the browser, only the addresses derived from it.
 */

const ESPLORA_PROXY = '/api/btc/esplora';

interface AccountDraft {
  id: number;
  label: string;
  extendedKey: string;
  masterFingerprint: string;
  accountPath: string;
}

let nextId = 1;
const blankAccount = (): AccountDraft => ({
  id: nextId++,
  label: '',
  extendedKey: '',
  masterFingerprint: '',
  accountPath: "m/84'/0'/0'",
});

const fmtBtc = (sats: bigint) =>
  (Number(sats) / 1e8).toLocaleString('en-US', { maximumFractionDigits: 8 });

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function WalletScanClient() {
  const [accounts, setAccounts] = useState<AccountDraft[]>([blankAccount()]);
  const [gapLimit, setGapLimit] = useState(20);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<WalletScanResult | null>(null);
  const [report, setReport] = useState<WalletReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function update(id: number, patch: Partial<AccountDraft>) {
    setAccounts((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function run(cursor?: ScanCursor) {
    setError(null);
    const usable = accounts.filter((a) => a.extendedKey.trim());
    if (usable.length === 0) {
      setError('Add at least one extended public key.');
      return;
    }
    for (const account of usable) {
      const key = account.extendedKey.trim();
      if (!isExtendedKey(key)) {
        setError(`"${key.slice(0, 16)}…" is not an extended public key (xpub, ypub or zpub).`);
        return;
      }
      try {
        if (parseExtendedKey(key).testnet) {
          setError('This view scans mainnet. Use a mainnet xpub, ypub or zpub.');
          return;
        }
      } catch {
        setError('Could not parse that extended public key.');
        return;
      }
      if (account.masterFingerprint && !/^[0-9a-fA-F]{8}$/.test(account.masterFingerprint.trim())) {
        setError(
          'Master fingerprint must be 8 hex characters (your wallet shows it as e.g. 73c5da0a).',
        );
        return;
      }
    }

    const scanAccounts: ScanAccount[] = usable.map((a, i) => ({
      label: a.label.trim() || `Account ${i + 1}`,
      extendedKey: a.extendedKey.trim(),
      ...(a.masterFingerprint.trim() && a.accountPath.trim()
        ? {
            origin: {
              masterFingerprint: a.masterFingerprint.trim().toLowerCase(),
              accountPath: a.accountPath.trim(),
            },
          }
        : {}),
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    setProgress('Starting…');
    try {
      const scan = await scanWallet(scanAccounts, {
        apiUrl: ESPLORA_PROXY,
        gapLimit,
        batchSize: 10,
        concurrency: 3,
        retries: 2,
        timeoutMs: 12_000,
        signal: controller.signal,
        ...(cursor ? { cursor } : {}),
        onProgress: (p) =>
          setProgress(`${p.accountLabel} · ${p.chain} · ${p.scanned} addresses checked`),
      });
      // Merge with a previous partial run so resuming keeps earlier findings.
      const merged: WalletScanResult =
        cursor && result
          ? {
              ...scan,
              addresses: [...result.addresses, ...scan.addresses],
              errors: [...result.errors, ...scan.errors],
            }
          : scan;
      setResult(merged);
      setReport(buildWalletReport(merged));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Scan failed.');
    } finally {
      setScanning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  const incomplete = result && !result.complete;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0b12] p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Whole-wallet exposure scan</h2>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400">
          watch-only · public keys
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Scan every account in a wallet at once from its extended public keys. Each chain is walked
        until the gap limit is reached, so coverage follows the wallet&apos;s real shape. An
        extended <span className="text-zinc-200">public</span> key can read balances and history but
        cannot spend, and it never leaves your browser — only the addresses derived from it are
        looked up.
      </p>

      <div className="mt-5 space-y-4">
        {accounts.map((account, index) => (
          <div key={account.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                Account {index + 1}
              </span>
              {accounts.length > 1 && (
                <button
                  onClick={() => setAccounts((l) => l.filter((a) => a.id !== account.id))}
                  className="text-xs text-zinc-500 transition hover:text-rose-300"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-3">
              <input
                value={account.label}
                onChange={(e) => update(account.id, { label: e.target.value })}
                placeholder="Label (e.g. Cold storage)"
                className="rounded-xl bg-black/30 px-4 py-2.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
              />
              <textarea
                value={account.extendedKey}
                onChange={(e) => update(account.id, { extendedKey: e.target.value })}
                placeholder="xpub / ypub / zpub"
                rows={2}
                className="rounded-xl bg-black/30 px-4 py-2.5 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={account.masterFingerprint}
                  onChange={(e) => update(account.id, { masterFingerprint: e.target.value })}
                  placeholder="Master fingerprint (optional)"
                  className="rounded-xl bg-black/30 px-4 py-2.5 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
                />
                <input
                  value={account.accountPath}
                  onChange={(e) => update(account.id, { accountPath: e.target.value })}
                  placeholder="m/84'/0'/0'"
                  className="rounded-xl bg-black/30 px-4 py-2.5 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                The fingerprint and account path are optional for scanning, but supplying them lets
                a later sweep be signed on a hardware wallet. Your wallet shows both when it exports
                an extended key.
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setAccounts((l) => [...l, blankAccount()])}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/5"
        >
          Add another account
        </button>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Gap limit
          <input
            type="number"
            min={5}
            max={100}
            value={gapLimit}
            onChange={(e) => setGapLimit(Math.max(5, Math.min(100, Number(e.target.value) || 20)))}
            className="w-16 rounded-lg bg-black/30 px-2 py-1.5 text-center text-xs text-zinc-100 outline-none ring-1 ring-white/10"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run()}
          disabled={scanning}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
        >
          {scanning ? 'Scanning…' : 'Scan wallet'}
        </button>
        {scanning && (
          <button
            onClick={() => abortRef.current?.abort()}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
          >
            Stop
          </button>
        )}
        {incomplete && !scanning && (
          <button
            onClick={() => run(result!.cursor)}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
          >
            Resume where it stopped
          </button>
        )}
        {progress && <span className="text-xs text-zinc-400">{progress}</span>}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {report && result && (
        <div className="mt-6 space-y-4">
          {incomplete && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              This scan stopped early, so the totals below are a floor, not the whole wallet. Resume
              to finish it.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Addresses used" value={String(report.totals.addresses)} />
            <Stat
              label="Exposed"
              value={`${report.totals.exposedAddresses} of ${report.totals.addresses}`}
              tone="warn"
            />
            <Stat label="Total balance" value={`${fmtBtc(report.totals.totalSats)} BTC`} />
            <Stat
              label="At risk (key already public)"
              value={`${fmtBtc(report.totals.exposedSats)} BTC`}
              tone="warn"
            />
            <Stat
              label="Not yet exposed"
              value={`${fmtBtc(report.totals.unexposedSats)} BTC`}
              tone="ok"
            />
            <Stat label="Lookup failures" value={String(report.errors.length)} />
          </div>

          {report.accounts.map((account) => (
            <div key={account.label} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{account.label}</h3>
                <span className="text-xs text-zinc-400">
                  {account.exposedCount} of {account.addressCount} exposed ·{' '}
                  {fmtBtc(account.exposedSats)} BTC at risk
                </span>
              </div>
              {account.topExposed.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Largest exposed balances — evacuate these first
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {account.topExposed.map((entry) => (
                      <li
                        key={entry.address}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
                      >
                        <span className="break-all font-mono text-zinc-300">{entry.address}</span>
                        <span className="text-zinc-400">
                          {entry.path} · {entry.type} · {fmtBtc(entry.sats)} BTC
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                download('pqweave-bitcoin-exposure.csv', toCsv(result), 'text/csv;charset=utf-8')
              }
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/5"
            >
              Download CSV
            </button>
            <button
              onClick={() =>
                download('pqweave-bitcoin-exposure.json', toJson(report), 'application/json')
              }
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/5"
            >
              Download JSON
            </button>
            <button
              onClick={() => setShowMethodology((v) => !v)}
              className="text-xs text-accent transition hover:underline"
            >
              {showMethodology ? 'Hide methodology' : 'How these numbers are calculated'}
            </button>
          </div>

          {showMethodology && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-400">
              {METHODOLOGY}
            </pre>
          )}

          {report.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              {report.errors.length} address{report.errors.length === 1 ? '' : 'es'} could not be
              checked and {report.errors.length === 1 ? 'is' : 'are'} excluded from the totals, so
              the real exposure may be higher. Re-run to retry them.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'warn' | 'ok';
}) {
  const color =
    tone === 'warn' ? 'text-amber-200' : tone === 'ok' ? 'text-emerald-200' : 'text-zinc-100';
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-medium ${color}`}>{value}</div>
    </div>
  );
}
