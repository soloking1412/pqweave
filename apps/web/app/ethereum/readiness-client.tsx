'use client';

import { useRef, useState } from 'react';
import { isAddress } from 'viem';
import type { ScanReport } from '@/lib/types';

export function EthereumReadinessClient() {
  const [address, setAddress] = useState('');
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observedAt, setObservedAt] = useState('');
  const revision = useRef(0);

  async function scan(event: React.FormEvent) {
    event.preventDefault();
    const current = ++revision.current;
    setReport(null);
    setError(null);
    if (!isAddress(address.trim())) {
      setError('Enter a valid Ethereum public address.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/scan?chain=ethereum&address=${encodeURIComponent(address.trim())}`,
        { cache: 'no-store', signal: AbortSignal.timeout(20_000) },
      );
      const data = await response.json();
      if (!response.ok || data.error)
        throw new Error(data.error ?? 'The scan could not be completed.');
      if (
        data.kind !== 'evm' ||
        data.chain !== 'ethereum' ||
        data.address?.toLowerCase() !== address.trim().toLowerCase() ||
        !Array.isArray(data.tokenHoldings)
      )
        throw new Error('The scan returned an unexpected result.');
      if (current !== revision.current) return;
      setReport(data);
      setObservedAt(new Date().toISOString());
    } catch (caught) {
      if (current === revision.current)
        setError(caught instanceof Error ? caught.message : 'Scan failed. Try again.');
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }

  function download() {
    if (!report) return;
    const file = {
      format: 'pqweave-ethereum-readiness',
      version: 1,
      observedAt,
      chainId: 1,
      status: 'readiness-only',
      report,
      requiredReviews: [
        'Complete asset and position inventory',
        'Verified destination code and sole-PQ authority',
        'Durable signing journal and recovery drill',
        'Fees, trial transfer and destination receipts',
        'Independent cryptographic and contract review',
      ],
      limitations: [
        'Known-token balances are a partial inventory.',
        'This report is an observation, not a transaction or proof of protection.',
        'Do not fund the experimental account on mainnet.',
      ],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pqweave-ethereum-readiness.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section
      className="rounded-panel border border-rule bg-panel p-6"
      aria-labelledby="ethereum-review-title"
    >
      <h2 id="ethereum-review-title" className="text-xl font-semibold">
        Review an Ethereum address
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Public data only. The address is sent to the site&apos;s Ethereum data provider. No wallet
        connection or signature is needed.
      </p>
      <form onSubmit={scan} className="mt-5 space-y-3">
        <label htmlFor="ethereum-address" className="block text-sm text-zinc-300">
          Public address
        </label>
        <input
          id="ethereum-address"
          value={address}
          onChange={(event) => {
            revision.current++;
            setAddress(event.target.value);
            setReport(null);
            setError(null);
            setBusy(false);
          }}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-control border border-rule-strong bg-base px-4 py-3 font-mono text-sm outline-none focus:border-brand-bright"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-control bg-[#285f96] px-5 py-3 text-sm font-semibold text-white hover:bg-[#326fa9] disabled:opacity-50"
        >
          {busy ? 'Reviewing…' : 'Review address'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {error}
        </p>
      )}
      {report && (
        <div className="mt-6 space-y-4 border-t border-rule pt-5" aria-live="polite">
          <h3 className="text-lg font-semibold">Readiness snapshot</h3>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-zinc-400">Native balance</dt>
              <dd className="mt-1 break-all font-mono text-sm">
                {report.nativeBalanceFormatted} ETH
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Known tokens with balances</dt>
              <dd className="mt-1 text-sm">{report.tokenHoldings.length} · partial inventory</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Address authority</dt>
              <dd className="mt-1 text-sm">
                {report.delegatedTo
                  ? 'Revocable EIP-7702 delegation'
                  : report.isContract
                    ? 'Contract · policy review needed'
                    : report.exposed
                      ? 'Public key exposed'
                      : 'No exposure observed'}
              </dd>
            </div>
          </dl>
          <p className="text-sm leading-relaxed text-zinc-400">
            A scan cannot certify post-quantum protection. Confirm unlisted assets, positions and
            account permissions before deciding what to move.
          </p>
          <button
            onClick={download}
            className="min-h-11 rounded-control border border-rule-strong px-4 py-2 text-sm font-medium hover:bg-white/5"
          >
            Download readiness report
          </button>
        </div>
      )}
    </section>
  );
}
