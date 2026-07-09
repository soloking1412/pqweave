'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { type Address, type Hex, keccak256, parseEther, zeroAddress } from 'viem';
import { useAccount, useChainId, useConnect, usePublicClient, useWalletClient } from 'wagmi';
import { encodeCreateAccount, predictAccountAddress } from '@pqweave/sdk/account';
import Link from 'next/link';
import { MigrateStatusBanner } from '@/components/migrate-status-banner';
import { PqcKeygen, type PqcKeyState } from '@/components/pqc-keygen';
import { explorerTxUrl } from '@/lib/contracts';
import { chainName, getDeploymentStatus } from '@/lib/deployment';

const DEFAULT_THRESHOLD = parseEther('0.05');

export function StartClient() {
  const status = getDeploymentStatus();
  const contracts = status.contracts;
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();

  const [key, setKey] = useState<PqcKeyState | null>(null);
  const [predicted, setPredicted] = useState<Address | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  useEffect(() => {
    if (!key?.root || !contracts || !publicClient) {
      setPredicted(null);
      return;
    }
    let cancelled = false;
    setPredictError(null);
    // Sole authority from birth: owner = address(0), the post-quantum key is
    // the only authority the account will ever have.
    predictAccountAddress(publicClient, contracts.factory, {
      owner: zeroAddress,
      pqcPublicKey: key.root,
      verifier: contracts.verifier,
      valueThreshold: DEFAULT_THRESHOLD,
      salt: keccak256(key.root),
    })
      .then((address) => {
        if (!cancelled) setPredicted(address);
      })
      .catch(() => {
        if (!cancelled) setPredictError('Could not reach the factory. Check your RPC and retry.');
      });
    return () => {
      cancelled = true;
    };
  }, [key?.root, contracts, publicClient]);

  async function copyAddress() {
    if (!predicted) return;
    await navigator.clipboard.writeText(predicted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function activate() {
    setActivateError(null);
    setActivating(true);
    try {
      if (!contracts || !walletClient || !key?.root) throw new Error('Not ready.');
      const hash = await walletClient.sendTransaction({
        to: contracts.factory,
        data: encodeCreateAccount({
          owner: zeroAddress,
          pqcPublicKey: key.root,
          verifier: contracts.verifier,
          valueThreshold: DEFAULT_THRESHOLD,
          salt: keccak256(key.root),
        }),
      });
      setTxHash(hash);
    } catch (caught) {
      setActivateError(caught instanceof Error ? caught.message : 'Activation failed.');
    } finally {
      setActivating(false);
    }
  }

  const explorer = txHash ? explorerTxUrl(chainId, txHash) : null;

  return (
    <div className="space-y-4">
      <MigrateStatusBanner stage={status.stage} />

      <section className="rounded-2xl border border-white/10 bg-[#0b0b12] p-6">
        <h2 className="text-lg font-semibold tracking-tight">1 · Generate your post-quantum key</h2>
        <div className="mt-4">
          <PqcKeygen onChange={setKey} />
        </div>
      </section>

      <section
        className={`rounded-2xl border p-6 ${key?.seedSaved ? 'border-brand/40 bg-[#0b0b12]' : 'border-white/10 bg-[#0b0b12]/60'}`}
      >
        <h2 className="text-lg font-semibold tracking-tight">2 · Your quantum-safe address</h2>
        {!key?.seedSaved ? (
          <p className="mt-3 text-sm text-zinc-500">
            Save your recovery key above first — the address is derived from it.
          </p>
        ) : !contracts ? (
          <p className="mt-3 text-sm text-zinc-400">
            Contracts are not deployed in this environment yet, so the address cannot be derived.
            Your key is real and stays valid — check back once the testnet deployment is live.
          </p>
        ) : predictError ? (
          <p className="mt-3 text-sm text-rose-300">{predictError}</p>
        ) : !predicted ? (
          <p className="mt-3 text-sm text-zinc-400">Deriving your address…</p>
        ) : (
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG value={predicted} size={132} marginSize={0} />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Post-quantum account · sole authority
                </div>
                <div className="mt-1 break-all font-mono text-xs text-accent">{predicted}</div>
              </div>
              <button
                onClick={copyAddress}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
              >
                {copied ? 'Copied ✓' : 'Copy address'}
              </button>
              <p className="text-xs leading-relaxed text-zinc-500">
                This address is reserved for your key by CREATE2 — the factory can only ever deploy
                it with the exact key you just generated, so it is safe to receive funds before the
                contract exists. The same address works on every EVM chain PQWeave is deployed to.
              </p>
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                Exchange caveat: some exchanges refuse withdrawals to smart-contract addresses.
                Always test with a small amount first.
              </p>
            </div>
          </div>
        )}
      </section>

      <section
        className={`rounded-2xl border p-6 ${predicted && key?.seedSaved ? 'border-white/10 bg-[#0b0b12]' : 'border-white/10 bg-[#0b0b12]/60'}`}
      >
        <h2 className="text-lg font-semibold tracking-tight">3 · Activate on-chain (optional)</h2>
        {txHash ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-emerald-300">
              Account deployed. From here on, only your post-quantum key can move its funds.
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
            <p className="text-sm leading-relaxed text-zinc-400">
              Funds can sit at the reserved address without the contract existing. Deploying it now
              (any funded wallet can pay the gas — the deployment is bound to your key, so who
              deploys does not matter) makes the account usable for outgoing transfers
              {chainName(chainId) ? ` on ${chainName(chainId)}` : ''}.
            </p>
            {!isConnected ? (
              <button
                onClick={() => connect({ connector: connectors[0]! })}
                disabled={connecting || !predicted}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
              >
                {connecting ? 'Connecting…' : 'Connect a gas wallet'}
              </button>
            ) : (
              <button
                onClick={activate}
                disabled={!predicted || activating || !status.live}
                className="rounded-xl bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
              >
                {activating ? 'Deploying…' : 'Deploy my account'}
              </button>
            )}
            {activateError && <p className="text-sm text-rose-300">{activateError}</p>}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-zinc-600">
        Already have a wallet with history? That address has different needs —{' '}
        <Link href="/migrate" className="text-brand-bright hover:underline">
          use the migration flow
        </Link>{' '}
        instead.
      </p>
    </div>
  );
}
