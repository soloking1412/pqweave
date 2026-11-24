import Link from 'next/link';
import { MigrationNote } from '@/components/migration-note';
import { CHAIN_OPTIONS } from '@/lib/chains';
import { RISK_STYLES, shortenAddress } from '@/lib/risk';
import type { MultiChainScanEntry, MultiChainScanReport, ScanReport } from '@/lib/types';

function chainLabel(key: string): string {
  return CHAIN_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

function balanceSummary(report: ScanReport): string {
  const native = Number(report.nativeBalanceFormatted);
  const parts: string[] = [];
  if (native > 0) {
    const symbol = CHAIN_OPTIONS.find((o) => o.key === report.chain)?.nativeSymbol ?? 'ETH';
    parts.push(`${native.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`);
  }
  for (const holding of report.tokenHoldings) {
    parts.push(
      `${Number(holding.amountFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${holding.symbol}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function ChainRow({ entry }: { entry: MultiChainScanEntry }) {
  if (!entry.ok) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-control border border-rule bg-well px-4 py-3">
        <span className="text-sm font-medium text-ink-2">{chainLabel(entry.chain)}</span>
        <span className="text-xs text-ink-dim">{entry.error}</span>
      </div>
    );
  }

  const style = RISK_STYLES[entry.report.level];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-rule bg-well px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="w-20 text-sm font-medium text-ink sm:w-24">
          {chainLabel(entry.report.chain)}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${style.badge}`}>
          {style.label}
        </span>
        {entry.report.hardened && (
          <span className="rounded-full bg-caution/10 px-2.5 py-0.5 text-xs font-medium text-caution ring-1 ring-caution/30">
            7702 · revocable
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-ink-dim">{balanceSummary(entry.report)}</span>
        <span className={`text-xs ${entry.report.exposed ? 'text-risk-high' : 'text-ink-dim'}`}>
          {entry.report.exposed ? 'Key exposed' : 'Key hidden'}
        </span>
      </div>
    </div>
  );
}

export function MultiChainReportCard({ report }: { report: MultiChainScanReport }) {
  const style = RISK_STYLES[report.level];
  const exposedCount = report.exposedChains.length;
  const showProtect = report.results.some(
    (entry) => entry.ok && entry.report.exposed && !entry.report.isContract,
  );

  return (
    <div className="rounded-panel border border-rule bg-panel p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${style.badge}`}>
            {style.label}
          </span>
          <span className="font-mono text-sm text-ink-dim">{shortenAddress(report.address)}</span>
        </div>
        <div className="text-right">
          <span className="text-2xl font-semibold text-ink">{report.score}</span>
          <span className="text-sm text-ink-dim"> / 100 worst-chain risk</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-dim">
        {exposedCount === 0
          ? 'Public key not revealed on any scanned chain.'
          : `Public key exposed on ${exposedCount} of ${report.results.length} chains — exposure is per-chain, so each one needs its own migration.`}
      </p>

      <div className="mt-5 space-y-2">
        {report.results.map((entry) => (
          <ChainRow key={entry.chain} entry={entry} />
        ))}
      </div>

      <MigrationNote report={report} />

      {showProtect && (
        <Link
          href={`/kit?chain=ethereum&address=${report.address}`}
          className="mt-4 inline-flex rounded-control bg-brand px-5 py-3 font-medium text-paper transition hover:bg-brand-strong"
        >
          Build migration plan →
        </Link>
      )}
    </div>
  );
}
