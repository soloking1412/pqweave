'use client';

import { useEffect, useMemo, useState } from 'react';
import { type Address, type Hex, isAddress, keccak256, parseEther, zeroAddress } from 'viem';
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import type { ChainKey } from '@pqweave/sdk/chains';
import { knownTokens } from '@pqweave/sdk/chains';
import { buildHardenInPlace, predictAccountAddress } from '@pqweave/sdk/account';
import {
  buildOneClickMigration,
  discoverErc20Balances,
  mergeTokenCandidates,
} from '@pqweave/sdk/migration';
import { buildForwarderInstall } from '@pqweave/sdk/forwarder';
import Link from 'next/link';
import { ScanReportCard } from '@/components/scan-report-card';
import { MigrateStatusBanner } from '@/components/migrate-status-banner';
import { PqcKeygen, type PqcKeyState } from '@/components/pqc-keygen';
import { explorerTxUrl } from '@/lib/contracts';
import { chainName, getDeploymentStatus } from '@/lib/deployment';
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

/** The three real outcomes a wallet holder can choose. */
type Outcome = 'full' | 'harden' | 'emergency';

interface OutcomeMeta {
  key: Outcome;
  title: string;
  blurb: string;
}

const OUTCOMES: OutcomeMeta[] = [
  {
    key: 'full',
    title: 'Move to a fresh quantum-safe account',
    blurb:
      'Sweep everything into a new post-quantum account. The safest end state. Optionally keep your old address working as a mailbox that auto-forwards future deposits.',
  },
  {
    key: 'harden',
    title: 'Harden my current address in place',
    blurb:
      'Keep your exact address and add a post-quantum gate on sensitive operations. Transitional only — the underlying key can still re-delegate.',
  },
  {
    key: 'emergency',
    title: 'My key may be exposed — get me out now',
    blurb:
      'Same as the full migration, framed for urgency: sweep to a fresh account and leave a mailbox so nothing new lands on the exposed key.',
  },
];

function Step({
  index,
  title,
  active,
  done,
  children,
}: {
  index: number | string;
  title: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-panel border p-6 transition ${
        active ? 'border-brand/40 bg-panel' : 'border-rule bg-panel/60'
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

export function MigrateClient() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [report, setReport] = useState<ScanReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [key, setKey] = useState<PqcKeyState | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('full');
  const [outcomeTouched, setOutcomeTouched] = useState(false);
  const [installMailbox, setInstallMailbox] = useState(true);
  const [pqcOnly, setPqcOnly] = useState(false);
  const [tokensInput, setTokensInput] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<Address | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const chainKey = CHAIN_KEY_BY_ID[chainId] ?? 'ethereum';
  const network = chainName(chainId);
  const status = getDeploymentStatus();
  const contracts = status.contracts;
  const seedSaved = Boolean(key?.seedSaved);
  const pqcRoot = key?.root ?? null;

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
        if (cancelled || data.error) return;
        const scan = data as ScanReport;
        setReport(scan);
        // Preselect the emergency path for an already-exposed, at-risk wallet.
        if (
          !outcomeTouched &&
          scan.exposed &&
          (scan.level === 'high' || scan.level === 'critical')
        ) {
          setOutcome('emergency');
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, chainKey, outcomeTouched]);

  // Pre-fill the sweep list from the scan's detected tokens plus the chain's
  // known-token registry, so a user rarely has to paste addresses by hand.
  const suggestedTokens = useMemo(() => {
    const fromScan = (report?.tokenHoldings ?? []).map((holding) => holding.token);
    const registry = knownTokens(chainKey).map((token) => token.address);
    return mergeTokenCandidates(fromScan, registry);
  }, [report, chainKey]);

  useEffect(() => {
    if (suggestedTokens.length > 0 && tokensInput === '') {
      setTokensInput(suggestedTokens.join('\n'));
    }
    // Only seed once, when suggestions first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTokens.length]);

  function chooseOutcome(next: Outcome) {
    setOutcome(next);
    setOutcomeTouched(true);
  }

  async function run() {
    setMigrateError(null);
    setTxHash(null);
    setMigrating(true);
    try {
      if (!contracts || !walletClient || !publicClient || !address || !pqcRoot) {
        throw new Error('Not ready to migrate.');
      }

      if (outcome === 'harden') {
        if (!contracts.accountImpl) throw new Error('Harden-in-place is not available yet.');
        const { delegate, data } = buildHardenInPlace({
          accountImpl: contracts.accountImpl,
          owner: address,
          pqcRoot,
          verifier: contracts.verifier,
          valueThreshold: DEFAULT_THRESHOLD,
          pqcOnly,
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
        setSafeAddress(address);
        setTxHash(hash);
        return;
      }

      // full / emergency: sweep into a fresh sole-authority account.
      const salt = keccak256(pqcRoot);
      const safe = await predictAccountAddress(publicClient, contracts.factory, {
        owner: zeroAddress,
        pqcPublicKey: pqcRoot,
        verifier: contracts.verifier,
        valueThreshold: DEFAULT_THRESHOLD,
        salt,
      });
      setSafeAddress(safe);

      const tokenList = tokensInput
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value): value is Address => isAddress(value));
      const erc20s = tokenList.length
        ? await discoverErc20Balances(publicClient, address, tokenList)
        : [];
      const balance = await publicClient.getBalance({ address });

      const useMailbox = installMailbox && Boolean(contracts.forwarder);
      let delegate: Address;
      let data: Hex;
      if (useMailbox) {
        // One tx: delegate to the forwarder and initializeAndFlush. The forwarder
        // pushes the FULL native balance (inside the tx, balance is already net
        // of gas), so no gas-buffer arithmetic here.
        ({ delegate, data } = buildForwarderInstall({
          forwarder: contracts.forwarder!,
          destination: safe,
          pqcRoot,
          verifier: contracts.verifier,
          erc20s: erc20s.map((holding) => holding.token),
        }));
      } else {
        const gasBuffer = parseEther('0.002');
        const native = balance > gasBuffer ? balance - gasBuffer : 0n;
        ({ delegate, data } = buildOneClickMigration(contracts.batchExecutor, {
          to: safe,
          from: address,
          native,
          erc20s,
        }));
      }

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
  const isSweep = outcome === 'full' || outcome === 'emergency';

  return (
    <div className="space-y-4">
      <MigrateStatusBanner stage={status.stage} />

      <Step index={1} title="Connect your wallet" active={!isConnected} done={isConnected}>
        {isConnected && address ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-200">{shortenAddress(address)}</span>
              {network ? (
                <span className="rounded-full border border-rule px-2 py-0.5 text-xs text-zinc-400">
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
              className="rounded-lg border border-rule px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/5"
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
              className="mt-4 rounded-control bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
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
        active={isConnected && !report}
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

      <Step index={3} title="Choose your path" active={isConnected && Boolean(report)} done={false}>
        <div className="grid gap-3">
          {OUTCOMES.map((meta) => (
            <button
              key={meta.key}
              onClick={() => chooseOutcome(meta.key)}
              className={`rounded-control border p-4 text-left transition ${
                outcome === meta.key
                  ? 'border-brand/50 bg-brand/5'
                  : 'border-rule bg-black/20 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-3.5 w-3.5 rounded-full border ${
                    outcome === meta.key ? 'border-brand bg-brand' : 'border-rule-strong'
                  }`}
                />
                <span className="text-sm font-semibold text-white">{meta.title}</span>
              </div>
              <p className="mt-1.5 pl-5 text-xs leading-relaxed text-zinc-400">{meta.blurb}</p>
            </button>
          ))}
        </div>
        {outcome === 'harden' && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            Transitional, not quantum-safe. Delegating keeps your original ECDSA key&apos;s
            protocol-level authority — a quantum attacker who recovers it could sign a new
            authorization and remove this guard. For full safety, move funds to a fresh account.
          </div>
        )}
      </Step>

      <Step
        index={4}
        title="Generate your post-quantum key"
        active={isConnected && !seedSaved}
        done={seedSaved}
      >
        <PqcKeygen disabled={!isConnected} onChange={setKey} />
      </Step>

      <Step index={5} title="Execute" active={seedSaved && !txHash} done={Boolean(txHash)}>
        {!status.live ? (
          <div className="space-y-3 rounded-lg border border-white/5 bg-black/20 p-4">
            <p className="text-sm leading-relaxed text-zinc-300">
              Everything above is real and yours — the post-quantum key you generated is valid and
              independent of your wallet. The on-chain step goes live on a public testnet next, then
              mainnet once the contracts pass their independent audit.
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
              {outcome === 'harden'
                ? 'Your address is hardened. Sensitive operations now require your post-quantum key.'
                : 'Migration submitted. Your wallet was swept into a fresh quantum-safe account in a single transaction.'}
            </p>
            {safeAddress && (
              <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  {outcome === 'harden'
                    ? `Hardened address · ${pqcOnly ? 'post-quantum on every op' : 'hybrid'}`
                    : 'Quantum-safe account · post-quantum only'}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-accent">{safeAddress}</div>
              </div>
            )}
            {isSweep && installMailbox && contracts?.forwarder && (
              <p className="text-xs leading-relaxed text-zinc-400">
                Your old address now forwards to the new account. Future deposits (exchange
                withdrawals, refunds) land there and anyone can push them on with a flush. This is
                transitional — see the security model for the re-delegation caveat.
              </p>
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
            {isSweep ? (
              <>
                <p className="text-sm text-zinc-400">
                  Sweep your native balance — and the tokens listed below — into a fresh
                  post-quantum account in a single transaction.
                </p>
                <label className="mt-4 block text-xs uppercase tracking-wide text-zinc-500">
                  ERC-20 token addresses (pre-filled from your scan; edit freely)
                </label>
                <textarea
                  value={tokensInput}
                  onChange={(event) => setTokensInput(event.target.value)}
                  placeholder="0x… token addresses to include"
                  spellCheck={false}
                  rows={3}
                  className="mt-2 w-full rounded-control bg-black/30 px-3 py-2 font-mono text-xs text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 focus:ring-brand/60"
                />
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-control border border-rule bg-black/20 p-3">
                  <input
                    type="checkbox"
                    checked={installMailbox}
                    disabled={!contracts?.forwarder}
                    onChange={(event) => setInstallMailbox(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#3f7fbf]"
                  />
                  <span className="text-sm text-zinc-300">
                    <span className="font-medium text-white">Keep my old address as a mailbox</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      Exchange whitelists and anyone paying your old address keep working. Incoming
                      funds auto-forward to your new account instead of resting on the exposed key.
                      {!contracts?.forwarder && ' (Unavailable until the forwarder is deployed.)'}
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-400">
                  Delegate your address to the PQWeave account implementation in a single
                  transaction. Your ECDSA key still authorizes routine actions; sensitive ones need
                  your post-quantum key.
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-control border border-rule bg-black/20 p-3">
                  <input
                    type="checkbox"
                    checked={pqcOnly}
                    onChange={(event) => setPqcOnly(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#3f7fbf]"
                  />
                  <span className="text-sm text-zinc-300">
                    <span className="font-medium text-white">
                      Require post-quantum for every operation
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      Stronger, but every transaction then needs your post-quantum key, and each one
                      consumes a one-time key from your tree.
                    </span>
                  </span>
                </label>
              </>
            )}
            <button
              onClick={run}
              disabled={!seedSaved || migrating}
              className="mt-4 rounded-control bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright disabled:opacity-60"
            >
              {migrating
                ? 'Working…'
                : outcome === 'harden'
                  ? 'Harden my address (one transaction)'
                  : 'Migrate my wallet (one transaction)'}
            </button>
            {!seedSaved && (
              <p className="mt-3 text-xs text-zinc-500">Save your recovery key in step 4 first.</p>
            )}
            {migrateError && <p className="mt-3 text-sm text-rose-300">{migrateError}</p>}
          </div>
        )}
      </Step>
    </div>
  );
}
