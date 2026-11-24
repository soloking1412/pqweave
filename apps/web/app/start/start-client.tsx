'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { type Address, type Hex, keccak256, parseEther, zeroAddress } from 'viem';
import { useAccount, useChainId, useConnect, usePublicClient, useWalletClient } from 'wagmi';
import { encodeCreateAccount, predictAccountAddress } from '@pqweave/sdk/account';
import Link from 'next/link';
import { MigrateStatusBanner } from '@/components/migrate-status-banner';
import { PqcKeygen, type PqcKeyState } from '@/components/pqc-keygen';
import { explorerTxUrl } from '@/lib/contracts';
import { chainName, getDeploymentStatus, isExecutionNetwork } from '@/lib/deployment';

const DEFAULT_THRESHOLD = parseEther('0.05');

export function StartClient() {
  const status = useMemo(() => getDeploymentStatus(), []);
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const executionLive = status.live && isExecutionNetwork(status.stage, chainId);
  const contracts = executionLive ? status.contracts : null;
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
      if (!executionLive || !contracts || !walletClient || !key?.root)
        throw new Error('Not ready.');
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

      <section className="rounded-panel border border-rule bg-panel p-6">
        <h2 className="text-lg font-semibold tracking-tight">1 · Generate your post-quantum key</h2>
        <div className="mt-4">
          <PqcKeygen onChange={setKey} />
        </div>
      </section>

      <section
        className={`rounded-panel border p-6 ${key?.seedSaved ? 'border-brand/40 bg-panel' : 'border-rule bg-panel/60'}`}
      >
        <h2 className="text-lg font-semibold tracking-tight">2 · Testnet destination address</h2>
        {!key?.seedSaved ? (
          <p className="mt-3 text-sm text-ink-dim">
            Save your recovery key above first, the address is derived from it.
          </p>
        ) : !contracts ? (
          <p className="mt-3 text-sm text-ink-dim">
            Connect to a configured testnet to derive a destination address. Do not send real funds
            to this unaudited account.
          </p>
        ) : predictError ? (
          <p className="mt-3 text-sm text-danger">{predictError}</p>
        ) : !predicted ? (
          <p className="mt-3 text-sm text-ink-dim">Deriving your address…</p>
        ) : (
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="rounded-control bg-white p-3">
              <QRCodeSVG value={predicted} size={132} marginSize={0} />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="rounded-lg border border-rule bg-well p-3">
                <div className="text-xs uppercase tracking-wide text-ink-dim">
                  Predicted testnet account · verify owner policy
                </div>
                <div className="mt-1 break-all font-mono text-xs text-accent">{predicted}</div>
              </div>
              <button
                onClick={copyAddress}
                className="rounded-control border border-rule px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-ink/5"
              >
                {copied ? 'Copied ✓' : 'Copy address'}
              </button>
              <p className="text-xs leading-relaxed text-ink-dim">
                This is a predicted address from the configured factory and key. Verify the factory
                code and destination policy independently. Use test funds only.
              </p>
              <p className="rounded-lg border border-caution/30 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
                Exchange caveat: some exchanges refuse withdrawals to smart-contract addresses.
                Always test with a small amount first.
              </p>
            </div>
          </div>
        )}
      </section>

      <section
        className={`rounded-panel border p-6 ${predicted && key?.seedSaved ? 'border-rule bg-panel' : 'border-rule bg-panel/60'}`}
      >
        <h2 className="text-lg font-semibold tracking-tight">3 · Activate on-chain (optional)</h2>
        {txHash ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-ok">
              Deployment submitted. Verify the code and owner policy on chain before relying on it.
            </p>
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-sm font-medium text-brand hover:underline"
              >
                View transaction →
              </a>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm leading-relaxed text-ink-dim">
              Deploy the account on a configured testnet with a gas wallet. Confirm that the
              predicted address matches the deployment and test an outgoing transfer
              {chainName(chainId) ? ` on ${chainName(chainId)}` : ''}.
            </p>
            {!isConnected ? (
              <button
                onClick={() => connect({ connector: connectors[0]! })}
                disabled={connecting || !predicted}
                className="rounded-control border border-rule px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-60"
              >
                {connecting ? 'Connecting…' : 'Connect a gas wallet'}
              </button>
            ) : (
              <button
                onClick={activate}
                disabled={!predicted || activating || !executionLive}
                className="rounded-control bg-brand px-5 py-3 font-medium text-paper transition hover:bg-brand-strong disabled:opacity-60"
              >
                {activating ? 'Deploying…' : 'Deploy my account'}
              </button>
            )}
            {activateError && <p className="text-sm text-danger">{activateError}</p>}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-ink-faint">
        Already have a wallet with history? That address has different needs:{' '}
        <Link href="/migrate" className="text-brand hover:underline">
          use the migration flow
        </Link>{' '}
        instead.
      </p>
    </div>
  );
}
