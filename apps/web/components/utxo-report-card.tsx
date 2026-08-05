import Link from 'next/link';
import { MigrationNote } from '@/components/migration-note';
import { RISK_STYLES, shortenAddress } from '@/lib/risk';
import type { UtxoScanReport } from '@/lib/types';

const TYPE_LABELS: Record<UtxoScanReport['type'], string> = {
  p2pkh: 'Legacy (P2PKH)',
  p2sh: 'Script (P2SH)',
  p2wpkh: 'SegWit (P2WPKH)',
  p2wsh: 'SegWit script (P2WSH)',
  p2tr: 'Taproot (P2TR)',
  // BIP-360 Pay-to-Merkle-Root. Draft, not active on any network.
  p2mr: 'Merkle root (P2MR, BIP-360 draft)',
  unknown: 'Unknown',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-zinc-100">{children}</div>
    </div>
  );
}

export function UtxoReportCard({ report }: { report: UtxoScanReport }) {
  const style = RISK_STYLES[report.level];

  return (
    <div className="rounded-panel border border-rule bg-panel p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${style.badge}`}>
            {style.label}
          </span>
          <span className="font-mono text-sm text-zinc-400">{shortenAddress(report.address)}</span>
        </div>
        <div className="text-right">
          <span className="text-2xl font-semibold text-white">{report.score}</span>
          <span className="text-sm text-zinc-500"> / 100 risk</span>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${report.score}%` }} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Public key">{report.exposed ? 'Exposed' : 'Not revealed'}</Field>
        <Field label="Address type">{TYPE_LABELS[report.type]}</Field>
        <Field label="Balance">
          {Number(report.balance).toLocaleString(undefined, { maximumFractionDigits: 8 })}{' '}
          {report.symbol}
        </Field>
        <Field label="Spent from">{report.hasSpent ? 'Yes' : 'No'}</Field>
        <Field label="Transactions">{report.txCount.toLocaleString()}</Field>
      </div>

      <ul className="mt-6 space-y-2">
        {report.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2.5 text-sm text-zinc-300">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.bar}`} />
            {reason}
          </li>
        ))}
      </ul>

      <MigrationNote report={report} />

      {report.exposed && Number(report.balance) > 0 && (
        <Link
          href="/protect/bitcoin"
          className="mt-4 inline-flex rounded-control border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20"
        >
          Reduce exposure (transitional) →
        </Link>
      )}
    </div>
  );
}
