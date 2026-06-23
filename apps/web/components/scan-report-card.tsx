import Link from 'next/link';
import { MigrationNote } from '@/components/migration-note';
import { nativeSymbol } from '@/lib/chains';
import { RISK_STYLES, shortenAddress } from '@/lib/risk';
import type { ScanReport } from '@/lib/types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-zinc-100">{children}</div>
    </div>
  );
}

export function ScanReportCard({ report }: { report: ScanReport }) {
  const style = RISK_STYLES[report.level];
  const protectedByPqweave = report.hardened || report.pqweaveProtected;
  const showProtect = report.exposed && !protectedByPqweave;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0b12] p-6 sm:p-7">
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
        <Field label="Transactions sent">{report.nonce.toLocaleString()}</Field>
        <Field label="Balance">
          {Number(report.nativeBalanceFormatted).toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })}{' '}
          {nativeSymbol(report.chain)}
        </Field>
        <Field label="Account type">{report.isContract ? 'Contract' : 'EOA'}</Field>
        <Field label="EIP-7702 delegation">
          {report.delegatedTo ? shortenAddress(report.delegatedTo) : 'None'}
        </Field>
        <Field label="PQWeave">
          {report.pqweaveProtected
            ? 'Post-quantum account'
            : report.hardened
              ? 'Hardened'
              : 'Not protected'}
        </Field>
      </div>

      {report.publicKey && (
        <div className="mt-3 rounded-lg border border-white/5 bg-black/20 p-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Recovered public key</div>
          <div className="mt-1 break-all font-mono text-xs text-zinc-400">{report.publicKey}</div>
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {report.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2.5 text-sm text-zinc-300">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.bar}`} />
            {reason}
          </li>
        ))}
      </ul>

      <MigrationNote report={report} />

      {showProtect && (
        <Link
          href={`/migrate?address=${report.address}`}
          className="mt-4 inline-flex rounded-xl bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright"
        >
          Protect this wallet →
        </Link>
      )}
    </div>
  );
}
