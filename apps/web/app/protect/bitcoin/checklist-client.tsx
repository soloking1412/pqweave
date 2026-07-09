'use client';

import { useEffect, useState } from 'react';

interface BitcoinScanRow {
  address: string;
  status: 'exposed' | 'safe' | 'error';
  detail: string;
  balance?: string;
  type?: string;
}

const STORAGE_KEY = 'pqweave-btc-checklist';

const CHECKLIST = [
  'Create a brand-new native SegWit address (bc1q…) in your own wallet. Do not reuse an old one, and avoid Taproot (bc1p) — a key-path spend reveals the public key.',
  'Move the balance from each exposed address into the fresh address in one consolidation transaction.',
  'Stop reusing addresses: receive each new payment into its own fresh address.',
  'Keep watching this space: a real fix needs a Bitcoin protocol upgrade (e.g. BIP-360). Until then this only defers exposure.',
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

export function BitcoinChecklistClient() {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<BitcoinScanRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
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
    const addresses = parseAddresses(input);
    if (addresses.length === 0) return;
    setScanning(true);
    setRows(null);
    try {
      const results = await Promise.all(
        addresses.map(async (address): Promise<BitcoinScanRow> => {
          try {
            const res = await fetch(
              `/api/scan?address=${encodeURIComponent(address)}&chain=bitcoin`,
            );
            const data = await res.json();
            if (!res.ok) return { address, status: 'error', detail: data.error ?? 'Scan failed.' };
            return {
              address,
              status: data.exposed ? 'exposed' : 'safe',
              detail: data.reasons?.[0] ?? '',
              balance: data.balance,
              type: data.type,
            };
          } catch {
            return { address, status: 'error', detail: 'Network error.' };
          }
        }),
      );
      setRows(results);
    } finally {
      setScanning(false);
    }
  }

  function downloadPlan() {
    if (!rows) return;
    const exposed = rows.filter((row) => row.status === 'exposed');
    const lines = [
      'PQWeave — Bitcoin quantum-exposure migration plan',
      `Generated ${new Date().toISOString()}`,
      '',
      'Addresses scanned:',
      ...rows.map(
        (row) => `  ${row.address} — ${row.status}${row.balance ? ` (${row.balance} BTC)` : ''}`,
      ),
      '',
      exposed.length > 0
        ? `${exposed.length} address(es) have revealed their public key and should be migrated.`
        : 'No scanned address has revealed its public key yet. Keep them that way.',
      '',
      'Checklist:',
      ...CHECKLIST.map((item, i) => `  [ ] ${i + 1}. ${item}`),
      '',
      'Note: this is transitional risk reduction, not quantum safety. Bitcoin has no',
      'post-quantum signatures at the protocol level today.',
    ];
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
    <div className="rounded-2xl border border-white/10 bg-[#0b0b12] p-6">
      <h2 className="text-xl font-semibold tracking-tight">Build your migration plan</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Paste your Bitcoin addresses (up to 20). We check which ones have already revealed their
        public key, then give you a personalized checklist. Nothing is stored on our side and no
        keys are ever requested.
      </p>

      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="bc1q… , 1… , 3…  (one per line or comma-separated)"
        spellCheck={false}
        rows={3}
        className="mt-4 w-full rounded-xl bg-black/30 px-3 py-2 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
      />
      <button
        onClick={scan}
        disabled={scanning || input.trim() === ''}
        className="mt-3 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
      >
        {scanning ? 'Checking…' : 'Check my addresses'}
      </button>

      {rows && (
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.address}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
              >
                <span className="font-mono text-xs text-zinc-300">
                  {row.address.length > 24
                    ? `${row.address.slice(0, 12)}…${row.address.slice(-8)}`
                    : row.address}
                </span>
                <span
                  className={`text-xs ${
                    row.status === 'exposed'
                      ? 'text-orange-300'
                      : row.status === 'safe'
                        ? 'text-emerald-300'
                        : 'text-zinc-500'
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

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            {exposedCount > 0
              ? `${exposedCount} of ${rows.length} addresses have revealed their public key. Follow the checklist to reduce their exposure.`
              : 'None of these addresses have revealed their public key yet. The checklist keeps it that way.'}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">Your checklist</h3>
            <ul className="mt-3 space-y-2">
              {CHECKLIST.map((item, index) => (
                <li key={item} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked[index] ?? false}
                    onChange={() => toggle(index)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#7c6cff]"
                  />
                  <span
                    className={`text-sm leading-relaxed ${
                      checked[index] ? 'text-zinc-500 line-through' : 'text-zinc-300'
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
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
          >
            Download plan (.txt)
          </button>
        </div>
      )}
    </div>
  );
}
