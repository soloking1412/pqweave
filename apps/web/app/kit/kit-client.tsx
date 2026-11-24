'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { planMigration, type MigrationKitPlan } from '@pqweave/sdk/kit';
import { SCAN_OPTIONS, type ScanChain } from '@/lib/chains';
import type { AnyScanReport } from '@/lib/types';

const OPTIONS = SCAN_OPTIONS.filter((option) => option.key !== 'evm-all');
const OUTCOME: Record<MigrationKitPlan['outcome'], string> = {
  protected: 'Protection route',
  transitional: 'Transitional route',
  'custody-change': 'Custody change',
  prepared: 'Assessment only',
  unsupported: 'Unsupported',
};

function normaliseReport(chain: string, report: AnyScanReport) {
  if (report.kind === 'evm') {
    return {
      chain,
      address: report.address,
      exposure: report.exposed ? ('exposed' as const) : ('hidden' as const),
      isContract: report.isContract,
      knownAssets:
        report.tokenHoldings.length + (Number(report.nativeBalanceFormatted) > 0 ? 1 : 0),
    };
  }
  if (report.kind === 'utxo') {
    return {
      chain,
      address: report.address,
      exposure: report.exposed ? ('exposed' as const) : ('hidden' as const),
    };
  }
  if (report.kind === 'account') {
    return {
      chain,
      address: report.address,
      exposure:
        report.chain === 'Algorand'
          ? ('unknown' as const)
          : report.exposed
            ? ('exposed' as const)
            : ('hidden' as const),
      currentAuthority: report.currentAuthority,
    };
  }
  return { chain, address: report.address, exposure: 'unknown' as const };
}

function nextLink(chain: string) {
  if (
    ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'sepolia', 'base-sepolia'].includes(
      chain,
    )
  ) {
    return { href: '/migrate', label: 'Explore the EVM testnet flow' };
  }
  if (chain === 'bitcoin')
    return { href: '/protect/bitcoin', label: 'Open Bitcoin watch-only tools' };
  if (chain === 'algorand')
    return {
      href: 'https://dev.algorand.co/concepts/accounts/post-quantum/',
      label: 'Read Algorand rekeying guide',
    };
  return { href: '/partners', label: 'Discuss a chain integration' };
}

export function KitClient({
  initialChain,
  initialAddress,
}: {
  initialChain?: string;
  initialAddress?: string;
}) {
  const [chain, setChain] = useState<ScanChain>(
    OPTIONS.some((option) => option.key === initialChain)
      ? (initialChain as ScanChain)
      : 'ethereum',
  );
  const [address, setAddress] = useState(initialAddress ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnyScanReport | null>(null);
  const [plan, setPlan] = useState<MigrationKitPlan | null>(null);

  // A link from the home page carries the chain and address, so the reading
  // starts without a second click.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initialAddress?.trim()) return;
    started.current = true;
    void run();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void run();
  }

  async function run() {
    setError(null);
    setReport(null);
    setPlan(null);
    if (!address.trim()) {
      setError('Enter a public wallet address.');
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(
        `/api/scan?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address.trim())}`,
        { signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The scan could not finish.');
      const scanned = data as AnyScanReport;
      setReport(scanned);
      setPlan(planMigration(normaliseReport(chain, scanned)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The scan failed. Try again.');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  function download() {
    if (!plan || !report) return;
    const file = new Blob(
      [JSON.stringify({ generatedAt: new Date().toISOString(), report, plan }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pqweave-${chain}-readiness.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const route = nextLink(chain);

  return (
    <div className="mt-10 space-y-8">
      <form
        onSubmit={submit}
        className="panel grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end sm:p-6"
      >
        <div>
          <label htmlFor="kit-address" className="mb-2 block text-sm font-medium text-ink">
            Public address
          </label>
          <input
            id="kit-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a wallet address"
            className="min-h-11 w-full rounded-control border border-rule-strong bg-panel-raised px-4 py-3 font-mono text-sm text-ink placeholder:text-ink-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="kit-chain" className="mb-2 block text-sm font-medium text-ink">
            Network
          </label>
          <select
            id="kit-chain"
            value={chain}
            onChange={(event) => setChain(event.target.value as ScanChain)}
            className="min-h-11 w-full rounded-control border border-rule-strong bg-panel-raised px-3 py-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="min-h-11 rounded-control bg-brand px-6 py-3 text-sm font-semibold text-paper hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:opacity-60"
        >
          {loading ? 'Checking…' : 'Build plan'}
        </button>
        <p className="text-xs text-ink-dim sm:col-span-3">
          Read-only. No connection, signing, seed phrase, or private key.
        </p>
      </form>

      {loading && (
        <div className="panel animate-pulse space-y-3 p-6" role="status" aria-live="polite">
          <div className="h-4 w-1/3 bg-panel-raised" />
          <div className="h-7 w-2/3 bg-panel-raised" />
          <div className="h-4 w-full bg-panel-raised" />
          <span className="sr-only">Checking the address and building a plan</span>
        </div>
      )}
      {error && (
        <div
          className="rounded-control border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
          role="alert"
        >
          {error}{' '}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand"
          >
            Dismiss
          </button>
        </div>
      )}

      {!loading && !plan && !error && (
        <section
          className="grid gap-px border border-rule bg-rule sm:grid-cols-3"
          aria-label="How the kit works"
        >
          {[
            [
              '01',
              'See the current state',
              'Public-key exposure, balance, and known authorization evidence.',
            ],
            [
              '02',
              'Get a real route',
              'Native protection, transitional preparation, or a clear unsupported result.',
            ],
            [
              '03',
              'Keep control',
              'Inspect checks and export the plan for your wallet or security team.',
            ],
          ].map(([number, title, body]) => (
            <div key={number} className="bg-panel p-6">
              <div className="tabular text-xs text-accent">{number}</div>
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>
            </div>
          ))}
        </section>
      )}

      {plan && report && !loading && (
        <div className="space-y-5" aria-live="polite">
          <section className="panel p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-full border border-brand/40 px-3 py-1 text-xs font-medium text-accent">
                {OUTCOME[plan.outcome]} · {plan.availability}
              </span>
              <span className="tabular text-xs text-ink-dim">{chain.toUpperCase()}</span>
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{plan.route}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-2">{plan.summary}</p>
            <p className="mt-4 break-all font-mono text-xs text-ink-dim">{plan.address}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={route.href}
                target={route.href.startsWith('https://') ? '_blank' : undefined}
                rel={route.href.startsWith('https://') ? 'noopener noreferrer' : undefined}
                className="inline-flex min-h-11 items-center rounded-control bg-brand px-5 py-3 text-sm font-medium text-paper hover:bg-brand-strong focus-visible:ring-2 focus-visible:ring-brand"
              >
                {route.label} →
              </Link>
              <button
                type="button"
                onClick={download}
                className="min-h-11 rounded-control border border-rule-strong px-5 py-3 text-sm font-medium text-ink hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-brand"
              >
                Download report
              </button>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <PlanList title="Suggested sequence" items={plan.actions} numbered />
            <PlanList title="Checks before signing" items={plan.checks} />
          </div>
          <PlanList title="Limits to understand" items={plan.limitations} caution />
          <p className="text-xs leading-relaxed text-ink-dim">
            This is an address-level readiness plan. It does not prove complete asset inventory,
            signer access, or the security of a destination contract.{' '}
            <a
              href={plan.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand"
            >
              Chain source
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function PlanList({
  title,
  items,
  numbered = false,
  caution = false,
}: {
  title: string;
  items: string[];
  numbered?: boolean;
  caution?: boolean;
}) {
  return (
    <section className={`panel p-6 ${caution ? 'border-caution/30' : ''}`}>
      <h3 className="text-[1rem] font-semibold">{title}</h3>
      <ol className="mt-4 space-y-3">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-2">
            <span className={`tabular shrink-0 ${caution ? 'text-caution' : 'text-accent'}`}>
              {numbered ? String(index + 1).padStart(2, '0') : '—'}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
