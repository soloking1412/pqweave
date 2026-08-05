'use client';

import { useState } from 'react';
import { type Hex } from 'viem';
import { useAccount, useChainId, useConnect, useWalletClient } from 'wagmi';
import { attestationMessage, encodeAttest } from '@pqweave/sdk/attestation';
import Link from 'next/link';
import { MigrateStatusBanner } from '@/components/migrate-status-banner';
import { PqcKeygen, type PqcKeyState } from '@/components/pqc-keygen';
import { explorerTxUrl, getContracts } from '@/lib/contracts';
import { getDeploymentStatus } from '@/lib/deployment';
import { shortenAddress } from '@/lib/risk';

function base64ToHex(b64: string): Hex {
  const bin = atob(b64);
  let hex = '';
  for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
  return `0x${hex}`;
}

interface BtcBinding {
  address: string;
  signature: Hex;
}

export function AttestClient() {
  const status = getDeploymentStatus();
  const contracts = getContracts();
  const attestation = contracts?.attestation ?? null;
  const { data: walletClient } = useWalletClient();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();

  const [key, setKey] = useState<PqcKeyState | null>(null);
  const [binding, setBinding] = useState<BtcBinding | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const pqcRoot = key?.seedSaved ? key.root : null;

  async function connectAndSignBtc() {
    setError(null);
    setBusy('btc');
    try {
      if (!pqcRoot) throw new Error('Generate and save your post-quantum key first.');
      const { request, AddressPurpose } = await import('sats-connect');

      const accounts = await request('getAccounts', {
        purposes: [AddressPurpose.Payment],
        message: 'Connect to attest a post-quantum key with PQWeave.',
      });
      if (accounts.status !== 'success' || accounts.result.length === 0) {
        throw new Error('No Bitcoin account returned by the wallet.');
      }
      const btcAddress = accounts.result[0]!.address;

      const message = attestationMessage(btcAddress, pqcRoot);
      const signed = await request('signMessage', { address: btcAddress, message });
      if (signed.status !== 'success') throw new Error('Message signing was rejected.');

      setBinding({ address: btcAddress, signature: base64ToHex(signed.result.signature) });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not connect or sign with a Bitcoin wallet (${caught.message}). A Bitcoin wallet like Xverse or Leather is required.`
          : 'Bitcoin wallet step failed.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function anchor() {
    setError(null);
    setBusy('anchor');
    try {
      if (!attestation || !walletClient || !pqcRoot || !binding) {
        throw new Error('Not ready to anchor.');
      }
      const hash = await walletClient.sendTransaction({
        to: attestation,
        data: encodeAttest(pqcRoot, binding.address, binding.signature),
      });
      setTxHash(hash);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Anchor transaction failed.');
    } finally {
      setBusy(null);
    }
  }

  const explorer = txHash ? explorerTxUrl(chainId, txHash) : null;

  return (
    <div className="space-y-4">
      <MigrateStatusBanner stage={status.stage} />

      <section className="rounded-panel border border-rule bg-panel p-6">
        <h2 className="text-lg font-semibold tracking-tight">1 · Generate your post-quantum key</h2>
        <div className="mt-4">
          <PqcKeygen onChange={setKey} />
        </div>
      </section>

      <section
        className={`rounded-panel border p-6 ${pqcRoot ? 'border-brand/40 bg-panel' : 'border-rule bg-panel/60'}`}
      >
        <h2 className="text-lg font-semibold tracking-tight">2 · Sign with your Bitcoin wallet</h2>
        {!pqcRoot ? (
          <p className="mt-3 text-sm text-zinc-500">Save your post-quantum key above first.</p>
        ) : binding ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-emerald-300">Bitcoin address signed the binding.</p>
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Bound address</div>
              <div className="mt-1 break-all font-mono text-xs text-accent">{binding.address}</div>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-zinc-400">
              Your Bitcoin wallet signs a message binding its address to your post-quantum key. This
              is a signature only — no transaction, no coins moved.
            </p>
            <button
              onClick={connectAndSignBtc}
              disabled={busy === 'btc'}
              className="mt-4 rounded-control bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
            >
              {busy === 'btc' ? 'Waiting for wallet…' : 'Connect Bitcoin wallet & sign'}
            </button>
          </div>
        )}
      </section>

      <section
        className={`rounded-panel border p-6 ${binding ? 'border-rule bg-panel' : 'border-rule bg-panel/60'}`}
      >
        <h2 className="text-lg font-semibold tracking-tight">3 · Anchor it on-chain</h2>
        {!attestation ? (
          <p className="mt-3 text-sm text-zinc-400">
            The attestation registry is not deployed in this environment yet. Your key and signature
            are valid — anchoring will be available once the contract is live.
          </p>
        ) : txHash ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-emerald-300">
              Anchored. The binding is now a permanent, public on-chain record.
            </p>
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-sm font-medium text-brand-bright hover:underline"
              >
                View transaction →
              </a>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-zinc-400">
              Record the binding as an immutable event on an EVM chain. Anyone can later read it and
              verify your Bitcoin signature off-chain.
            </p>
            {!isConnected ? (
              <button
                onClick={() => connect({ connector: connectors[0]! })}
                disabled={connecting || !binding}
                className="rounded-control border border-rule px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
              >
                {connecting ? 'Connecting…' : 'Connect an EVM wallet to anchor'}
              </button>
            ) : (
              <button
                onClick={anchor}
                disabled={!binding || busy === 'anchor' || !status.live}
                className="rounded-control bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
              >
                {busy === 'anchor' ? 'Anchoring…' : 'Anchor attestation'}
              </button>
            )}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <p className="text-xs leading-relaxed text-zinc-600">
        Honest scope: this binds and timestamps your key and address. It does not make Bitcoin
        quantum-safe — only a protocol upgrade can. It prepares you for a future migration path and
        proves ownership today.{' '}
        <Link href="/exposure/bitcoin" className="text-brand-bright hover:underline">
          See the Bitcoin exposure breakdown
        </Link>
        .
      </p>
    </div>
  );
}
