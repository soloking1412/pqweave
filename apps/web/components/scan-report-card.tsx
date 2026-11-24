import Link from 'next/link';
import { MigrationNote } from '@/components/migration-note';
import { nativeSymbol } from '@/lib/chains';
import { RISK_STYLES, shortenAddress } from '@/lib/risk';
import type { ScanReport } from '@/lib/types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rule bg-well p-3">
      <div className="text-xs uppercase tracking-wide text-ink-dim">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{children}</div>
    </div>
  );
}

export function ScanReportCard({ report }: { report: ScanReport }) {
  const style = RISK_STYLES[report.level];
  const showProtect = report.exposed && !report.isContract;

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
        <Field label="Public key">{report.exposed ? 'Exposed' : 'Not revealed'}</Field>
        <Field label="Transactions sent">{report.nonce.toLocaleString()}</Field>
        <Field label="Balance">
          {Number(report.nativeBalanceFormatted).toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })}{' '}
          {nativeSymbol(report.chain)}
        </Field>
        {report.tokenHoldings.length > 0 && (
          <Field label="Tokens">
            {report.tokenHoldings
              .map(
                (holding) =>
                  `${Number(holding.amountFormatted).toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })} ${holding.symbol}`,
              )
              .join(', ')}
          </Field>
        )}
        <Field label="Account type">{report.isContract ? 'Contract' : 'EOA'}</Field>
        <Field label="EIP-7702 delegation">
          {report.delegatedTo ? shortenAddress(report.delegatedTo) : 'None'}
        </Field>
        <Field label="PQWeave">
          {report.hardened ? 'Known 7702 delegation; revocable' : 'Not verified'}
        </Field>
      </div>

      {report.publicKey && (
        <div className="mt-3 rounded-lg border border-rule bg-well p-3">
          <div className="text-xs uppercase tracking-wide text-ink-dim">Recovered public key</div>
          <div className="mt-1 break-all font-mono text-xs text-ink-dim">{report.publicKey}</div>
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {report.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2.5 text-sm text-ink-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.bar}`} />
            {reason}
          </li>
        ))}
      </ul>

      <MigrationNote report={report} />

      {showProtect && (
        <Link
          href={`/kit?chain=${report.chain}&address=${report.address}`}
          className="mt-4 inline-flex rounded-control bg-brand px-5 py-3 font-medium text-paper transition hover:bg-brand-strong"
        >
          Build migration plan →
        </Link>
      )}
    </div>
  );
}
