'use client';

import { useEffect, useState } from 'react';
import {
  type Address,
  formatEther,
  type Hex,
  isAddress,
  keccak256,
  parseEther,
  toHex,
  zeroAddress,
} from 'viem';
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import type { ChainKey } from '@pqweave/sdk/chains';
import { predictAccountAddress } from '@pqweave/sdk/account';
import { buildOneClickMigration, discoverErc20Balances } from '@pqweave/sdk/migration';
import { createHashSigKey } from '@pqweave/sdk/pqc';
import Link from 'next/link';
import { ScanReportCard } from '@/components/scan-report-card';
import { MigrateStatusBanner } from '@/components/migrate-status-banner';
import { explorerTxUrl } from '@/lib/contracts';
import { chainName, getDeploymentStatus } from '@/lib/deployment';
import { type EncryptedKeystore, encryptSeed } from '@/lib/keystore';
import { shortenAddress } from '@/lib/risk';
import type { ScanReport } from '@/lib/types';

const CHAIN_KEY_BY_ID: Record<number, ChainKey> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
  84532: 'base-sepolia',
  11155111: 'sepolia',
};

const DEFAULT_THRESHOLD = parseEther('0.05');
const GAS_BUFFER = parseEther('0.002');
const KEY_TREE_SIZE = 64; // one-time post-quantum keys before a rotation is needed

function Step({
  index,
  title,
  active,
  done,
  children,
}: {
  index: number;
  title: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 transition ${
        active ? 'border-brand/40 bg-[#0b0b12]' : 'border-white/10 bg-[#0b0b12]/60'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
            done
              ? 'bg-emerald-500/20 text-emerald-300'
              : active
                ? 'bg-brand text-white'
                : 'bg-white/10 text-zinc-400'
          }`}
        >
          {done ? '✓' : index}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function parseTokenAddresses(input: string): Address[] {
  return input
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value): value is Address => isAddress(value));
}

export function MigrateClient() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [report, setReport] = useState<ScanReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pqcRoot, setPqcRoot] = useState<Hex | null>(null);
  const [keystore, setKeystore] = useState<EncryptedKeystore | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [seedSaved, setSeedSaved] = useState(false);

  const [tokensInput, setTokensInput] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<Address | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [maxSecurity, setMaxSecurity] = useState(true);

  const chainKey = CHAIN_KEY_BY_ID[chainId] ?? 'ethereum';
  const network = chainName(chainId);
  const status = getDeploymentStatus();
  const contracts = status.contracts;

  useEffect(() => {
    if (!address) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setScanning(true);
    fetch(`/api/scan?address=${address}&chain=${chainKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && !data.error) setReport(data as ScanReport);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, chainKey]);

  function downloadKeystore(file: EncryptedKeystore) {
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pqweave-keystore.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function generateAndEncrypt() {
    setKeyError(null);
    if (password.length < 8) {
      setKeyError('Use a password of at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setKeyError('Passwords do not match.');
      return;
    }
    setGenerating(true);
    try {
      // Fresh, independent entropy — NOT derived from the wallet's ECDSA key, so a
      // future quantum break of that key cannot reproduce the post-quantum key.
      // The seed stays in this local scope and is never shown or stored in state.
      const seed = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const root = createHashSigKey(seed, KEY_TREE_SIZE).root;
      const file = await encryptSeed(seed, password, root);
      setPqcRoot(root);
      setKeystore(file);
      downloadKeystore(file);
      setPassword('');
      setConfirmPassword('');
    } catch {
      setKeyError('Could not generate the key. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function migrate() {
    setMigrateError(null);
    setTxHash(null);
    setMigrating(true);
    try {
      if (!contracts || !walletClient || !publicClient || !address || !pqcRoot) {
        throw new Error('Not ready to migrate.');
      }

      // Maximum security: owner = address(0) removes the ECDSA key from the trust
      // model so the post-quantum key is the new account's sole authority.
      const owner = maxSecurity ? zeroAddress : address;
      const salt = keccak256(pqcRoot);
      const safe = await predictAccountAddress(publicClient, contracts.factory, {
        owner,
        pqcPublicKey: pqcRoot,
        verifier: contracts.verifier,
        valueThreshold: DEFAULT_THRESHOLD,
        salt,
      });
      setSafeAddress(safe);

      const tokens = parseTokenAddresses(tokensInput);
      const erc20s = tokens.length
        ? await discoverErc20Balances(publicClient, address, tokens)
        : [];

      const balance = await publicClient.getBalance({ address });
      const native = balance > GAS_BUFFER ? balance - GAS_BUFFER : 0n;

      const { delegate, data } = buildOneClickMigration(contracts.batchExecutor, {
        to: safe,
        from: address,
        native,
        erc20s,
      });

      const authorization = await walletClient.signAuthorization({
        contractAddress: delegate,
        executor: 'self',
      });
      const hash = await walletClient.sendTransaction({
        to: address,
        data,
        authorizationList: [authorization],
      });
      setTxHash(hash);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Migration failed.';
      setMigrateError(
        /authorization|7702|eip-7702/i.test(message)
          ? 'Your wallet may not support EIP-7702 yet. Use a 7702-capable wallet (e.g. MetaMask) on a supported network.'
          : message,
      );
    } finally {
      setMigrating(false);
    }
  }

  const explorer = txHash ? explorerTxUrl(chainId, txHash) : null;

  return (
    <div className="space-y-4">
      <MigrateStatusBanner stage={status.stage} />
      <Step index={1} title="Connect your wallet" active={!isConnected} done={isConnected}>
        {isConnected && address ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-200">{shortenAddress(address)}</span>
              {network ? (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-400">
                  {network}
                </span>
              ) : (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
                  Unsupported network
                </span>
              )}
            </div>
            <button
              onClick={() => disconnect()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/5"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-400">
              Works with MetaMask, Rabby, and any injected EVM wallet. PQWeave never takes custody
              of your keys.
            </p>
            <button
              onClick={() => connect({ connector: connectors[0]! })}
              disabled={connecting}
              className="mt-4 rounded-xl bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
            >
              {connecting ? 'Connecting…' : 'Connect wallet'}
            </button>
            {connectError && (
              <p className="mt-3 text-sm text-rose-300">
                No injected wallet found. Install MetaMask or Rabby to continue.
              </p>
            )}
          </div>
        )}
      </Step>

      <Step
        index={2}
        title="Review your exposure"
        active={isConnected && !pqcRoot}
        done={Boolean(report)}
      >
        {!isConnected ? (
          <p className="text-sm text-zinc-500">Connect a wallet to scan it.</p>
        ) : scanning ? (
          <p className="text-sm text-zinc-400">Scanning {shortenAddress(address ?? '')}…</p>
        ) : report ? (
          <ScanReportCard report={report} />
        ) : (
          <p className="text-sm text-zinc-500">No scan result yet.</p>
        )}
      </Step>

      <Step
        index={3}
        title="Generate your post-quantum key"
        active={isConnected && !seedSaved}
        done={seedSaved}
      >
        {keystore && pqcRoot ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-300">
              Encrypted recovery file downloaded (pqweave-keystore.json). Your secret key was
              encrypted with your password and never shown on screen.
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              Keep both the file <span className="font-medium">and</span> your password safe. The
              file is useless without the password, and together they are the only way to control
              your account. We cannot recover either.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => downloadKeystore(keystore)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
              >
                Download again
              </button>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={seedSaved}
                  onChange={(event) => setSeedSaved(event.target.checked)}
                  className="h-4 w-4 accent-[#7c6cff]"
                />
                I have saved the file and will remember my password
              </label>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Post-quantum public key (root)
              </div>
              <div className="mt-1 break-all font-mono text-xs text-accent">{pqcRoot}</div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-400">
              Choose a password, then generate a hash-based (Lamport + Merkle) post-quantum key in
              your browser. The key is created from fresh randomness, encrypted with your password
              (AES-256-GCM), and downloaded as a file. The raw secret is never displayed.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Encryption password"
                className="rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                className="rounded-xl bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
              />
            </div>
            <button
              onClick={generateAndEncrypt}
              disabled={!isConnected || generating}
              className="mt-4 rounded-xl bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
            >
              {generating ? 'Generating…' : 'Generate & download encrypted key'}
            </button>
            {keyError && <p className="mt-3 text-sm text-rose-300">{keyError}</p>}
          </div>
        )}
      </Step>

      <Step
        index={4}
        title="Migrate in one click"
        active={seedSaved && !txHash}
        done={Boolean(txHash)}
      >
        {!status.live ? (
          <div className="space-y-3 rounded-lg border border-white/5 bg-black/20 p-4">
            <p className="text-sm leading-relaxed text-zinc-300">
              Everything above is real and yours — the post-quantum key you generated is valid and
              independent of your wallet. The one-click on-chain sweep goes live on a public testnet
              next, then mainnet once the contracts pass their independent audit.
            </p>
            <Link
              href="/security"
              className="inline-flex text-sm font-medium text-brand-bright hover:underline"
            >
              Read the security model →
            </Link>
          </div>
        ) : txHash ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-300">
              Migration submitted. Your wallet was swept into your quantum-safe account in a single
              EIP-7702 transaction.
            </p>
            {safeAddress && (
              <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Quantum-safe account · {maxSecurity ? 'post-quantum only' : 'hybrid'}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-accent">{safeAddress}</div>
              </div>
            )}
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
          <div>
            <p className="text-sm text-zinc-400">
              Sweep your native balance — and any ERC-20s you list — into a fresh post-quantum
              account in a single transaction. A small amount of gas is left behind.
            </p>
            <label className="mt-4 block text-xs uppercase tracking-wide text-zinc-500">
              ERC-20 token addresses (optional, comma or newline separated)
            </label>
            <textarea
              value={tokensInput}
              onChange={(event) => setTokensInput(event.target.value)}
              placeholder="0x… token addresses to include"
              spellCheck={false}
              rows={2}
              className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
            />
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <input
                type="checkbox"
                checked={maxSecurity}
                onChange={(event) => setMaxSecurity(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#7c6cff]"
              />
              <span className="text-sm text-zinc-300">
                <span className="font-medium text-white">Maximum security (post-quantum only)</span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  The new account has no ECDSA key at all — only your post-quantum key can move
                  funds. Uncheck for a hybrid account that also accepts your wallet&apos;s ECDSA
                  signature for routine actions.
                </span>
              </span>
            </label>
            <button
              onClick={migrate}
              disabled={!pqcRoot || !seedSaved || migrating}
              className="mt-4 rounded-xl bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
            >
              {migrating ? 'Migrating…' : 'Migrate my wallet (one transaction)'}
            </button>
            {!seedSaved && (
              <p className="mt-3 text-xs text-zinc-500">Save your recovery key in step 3 first.</p>
            )}
            {migrateError && <p className="mt-3 text-sm text-rose-300">{migrateError}</p>}
          </div>
        )}
      </Step>
    </div>
  );
}
