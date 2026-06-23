'use client';

import { type FormEvent, useState } from 'react';
import { isAddress } from 'viem';
import { isAlgorandAddress } from '@pqweave/sdk/algorand';
import { isAptosAddress } from '@pqweave/sdk/aptos';
import { BITCOIN, isUtxoAddress, LITECOIN } from '@pqweave/sdk/bitcoin';
import { isCardanoAddress } from '@pqweave/sdk/cardano';
import { isCosmosAddress } from '@pqweave/sdk/cosmos';
import { isNearAddress } from '@pqweave/sdk/near';
import { isSolanaAddress } from '@pqweave/sdk/solana';
import { isStellarAddress } from '@pqweave/sdk/stellar';
import { isXrpAddress } from '@pqweave/sdk/xrp';
import { AccountReportCard } from '@/components/account-report-card';
import { ScanReportCard } from '@/components/scan-report-card';
import { UtxoReportCard } from '@/components/utxo-report-card';
import { type ScanChain, SCAN_OPTIONS } from '@/lib/chains';
import type { AnyScanReport } from '@/lib/types';

function isValidAddress(chain: ScanChain, address: string): boolean {
  if (chain === 'bitcoin') return isUtxoAddress(address, BITCOIN);
  if (chain === 'litecoin') return isUtxoAddress(address, LITECOIN);
  if (chain === 'solana') return isSolanaAddress(address);
  if (chain === 'cosmos') return isCosmosAddress(address);
  if (chain === 'xrp') return isXrpAddress(address);
  if (chain === 'cardano') return isCardanoAddress(address);
  if (chain === 'algorand') return isAlgorandAddress(address);
  if (chain === 'stellar') return isStellarAddress(address);
  if (chain === 'near') return isNearAddress(address);
  if (chain === 'aptos') return isAptosAddress(address);
  return isAddress(address);
}

function placeholderFor(chain: ScanChain): string {
  if (chain === 'bitcoin') return 'bc1… or 1… Bitcoin address';
  if (chain === 'litecoin') return 'ltc1… or L… Litecoin address';
  if (chain === 'solana') return 'Solana address (base58)';
  if (chain === 'cosmos') return 'cosmos1… address';
  if (chain === 'xrp') return 'r… XRP address';
  if (chain === 'cardano') return 'addr1… Cardano address';
  if (chain === 'algorand') return 'Algorand address (58 chars)';
  if (chain === 'stellar') return 'G… Stellar address';
  if (chain === 'near') return 'NEAR account (e.g. name.near)';
  if (chain === 'aptos') return '0x… Aptos address';
  return '0x… wallet address';
}

export function ScanForm({ initialAddress = '' }: { initialAddress?: string }) {
  const [address, setAddress] = useState(initialAddress);
  const [chain, setChain] = useState<ScanChain>('ethereum');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnyScanReport | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setReport(null);

    if (!isValidAddress(chain, address)) {
      setError('Enter a valid address for the selected chain.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/scan?address=${encodeURIComponent(address)}&chain=${encodeURIComponent(chain)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Scan failed.');
      } else {
        setReport(data as AnyScanReport);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b12] p-3 sm:flex-row"
      >
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value.trim())}
          placeholder={placeholderFor(chain)}
          spellCheck={false}
          className="flex-1 rounded-xl bg-black/30 px-4 py-3 font-mono text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
        />
        <select
          value={chain}
          onChange={(event) => setChain(event.target.value as ScanChain)}
          className="rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition focus:ring-brand/60"
        >
          {SCAN_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand px-6 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
        >
          {loading ? 'Scanning…' : 'Scan'}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {report?.kind === 'evm' && <ScanReportCard report={report} />}
      {report?.kind === 'utxo' && <UtxoReportCard report={report} />}
      {report?.kind === 'account' && <AccountReportCard report={report} />}
    </div>
  );
}
