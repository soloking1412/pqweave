import Link from 'next/link';
import { MigrationNote } from '@/components/migration-note';
import { RISK_STYLES, shortenAddress } from '@/lib/risk';
import type { AccountScanReport } from '@/lib/types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rule bg-well p-3">
      <div className="text-xs uppercase tracking-wide text-ink-dim">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{children}</div>
    </div>
  );
}

export function AccountReportCard({ report }: { report: AccountScanReport }) {
  const style = RISK_STYLES[report.level];

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
          <span className="text-sm text-ink-dim"> / 100 risk</span>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink/5">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${report.score}%` }} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Network">{report.chain}</Field>
        <Field label="Signing authority">
          {report.chain === 'Algorand'
            ? report.authorizationAddress
              ? 'Rekeyed · scheme unverified'
              : 'Scheme unverified'
            : report.exposed
              ? 'Classical key exposed'
              : 'Key not revealed'}
        </Field>
        <Field label="Balance">
          {Number(report.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
          {report.symbol}
        </Field>
      </div>

      <ul className="mt-6 space-y-2">
        {report.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2.5 text-sm text-ink-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.bar}`} />
            {reason}
          </li>
        ))}
      </ul>

      <MigrationNote report={report} />

      {report.chain === 'Solana' && (
        <Link
          href="/protect/solana"
          className="mt-4 inline-flex rounded-control border border-note/30 bg-note/10 px-5 py-3 text-sm font-medium text-note transition hover:bg-note/20"
        >
          What can actually be done on Solana →
        </Link>
      )}

      {report.chain === 'Stellar' && (
        <Link
          href="/protect/stellar"
          className="mt-4 inline-flex rounded-control border border-note/30 bg-note/10 px-5 py-3 text-sm font-medium text-note transition hover:bg-note/20"
        >
          What can actually be done on Stellar →
        </Link>
      )}
      {report.chain === 'Algorand' && (
        <Link
          href={`/kit?chain=algorand&address=${encodeURIComponent(report.address)}`}
          className="mt-4 inline-flex min-h-11 items-center rounded-control border border-brand/40 px-5 py-3 text-sm font-medium text-brand hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-brand"
        >
          Review native Falcon migration →
        </Link>
      )}
    </div>
  );
}
