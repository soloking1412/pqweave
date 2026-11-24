'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  type Address,
  type Hex,
  getAddress,
  isAddress,
  keccak256,
  parseEther,
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
import { knownTokens } from '@pqweave/sdk/chains';
import {
  buildHardenInPlace,
  encodeCreateAccount,
  pqWeaveAccountAbi,
  predictAccountAddress,
} from '@pqweave/sdk/account';
import {
  buildOneClickMigration,
  discoverErc20Balances,
  mergeTokenCandidates,
} from '@pqweave/sdk/migration';
import { ENTRYPOINT_V07 } from '@pqweave/sdk/userop';
import { verifyEthereumDestination } from '@pqweave/sdk/migration';
import { buildForwarderInstall } from '@pqweave/sdk/forwarder';
import Link from 'next/link';
import { ScanReportCard } from '@/components/scan-report-card';
import { MigrateStatusBanner } from '@/components/migrate-status-banner';
import { PqcKeygen, type PqcKeyState } from '@/components/pqc-keygen';
import { explorerTxUrl } from '@/lib/contracts';
import { chainName, getDeploymentStatus, isExecutionNetwork } from '@/lib/deployment';
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
    title: 'Move listed assets to a separate PQ account',
    blurb:
      'Move the assets this transaction supports to a separate account. Verify the inventory, destination policy, and any assets left behind.',
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
            done ? 'bg-ok/20 text-ok' : active ? 'bg-brand text-paper' : 'bg-ink/10 text-ink-dim'
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
  const [installMailbox, setInstallMailbox] = useState(false);
  const [pqcOnly, setPqcOnly] = useState(false);
  const [tokensInput, setTokensInput] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<Address | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [deploymentHash, setDeploymentHash] = useState<Hex | null>(null);
  const [txConfirmed, setTxConfirmed] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState<string | null>(null);

  const chainKey = CHAIN_KEY_BY_ID[chainId] ?? 'ethereum';
  const network = chainName(chainId);
  const status = getDeploymentStatus();
  const contracts = status.contracts;
  const executionLive = status.live && isExecutionNetwork(status.stage, chainId);
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

  useEffect(() => {
    setReport(null);
    setKey(null);
    setSafeAddress(null);
    setTxHash(null);
    setDeploymentHash(null);
    setTxConfirmed(false);
    setReconciliation(null);
    setTokensInput('');
  }, [address, chainId]);

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
    setDeploymentHash(null);
    setTxConfirmed(false);
    setPhase(null);
    setReconciliation(null);
    setMigrating(true);
    try {
      if (!executionLive || !contracts || !walletClient || !publicClient || !address || !pqcRoot) {
        throw new Error('Not ready to migrate.');
      }
      const assertWalletContext = async () => {
        const accounts = await walletClient.getAddresses();
        if (
          (await walletClient.getChainId()) !== chainId ||
          (await publicClient.getChainId()) !== chainId ||
          accounts[0]?.toLowerCase() !== address.toLowerCase()
        ) {
          throw new Error('Wallet or network changed. Reconnect and review again.');
        }
      };
      await assertWalletContext();
      const requiredContracts = [
        contracts.factory,
        contracts.verifier,
        contracts.batchExecutor,
        ENTRYPOINT_V07,
      ];
      const expectedHashes = [
        contracts.codeHashes.factory,
        contracts.codeHashes.verifier,
        contracts.codeHashes.batchExecutor,
        contracts.codeHashes.entryPoint,
      ];
      const deployed = await Promise.all(
        requiredContracts.map((contract) => publicClient.getCode({ address: contract })),
      );
      if (
        deployed.some(
          (code, index) =>
            !code ||
            code === '0x' ||
            keccak256(code).toLowerCase() !== expectedHashes[index].toLowerCase(),
        )
      ) {
        throw new Error('Migration contract code does not match the reviewed deployment manifest.');
      }

      if (outcome === 'harden') {
        if (!contracts.accountImpl) throw new Error('Harden-in-place is not available yet.');
        const implementationCode = await publicClient.getCode({ address: contracts.accountImpl });
        if (
          !implementationCode ||
          !contracts.codeHashes.accountImpl ||
          keccak256(implementationCode).toLowerCase() !==
            contracts.codeHashes.accountImpl.toLowerCase()
        ) {
          throw new Error('The hardening implementation is missing on this wallet network.');
        }
        const { delegate, data } = buildHardenInPlace({
          accountImpl: contracts.accountImpl,
          owner: address,
          pqcRoot,
          verifier: contracts.verifier,
          valueThreshold: DEFAULT_THRESHOLD,
          pqcOnly,
        });
        await assertWalletContext();
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
        setPhase('Waiting for the delegation to confirm…');
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('The delegation transaction reverted.');
        const [delegatedOwner, delegatedRoot] = await Promise.all([
          publicClient.readContract({ address, abi: pqWeaveAccountAbi, functionName: 'owner' }),
          publicClient.readContract({
            address,
            abi: pqWeaveAccountAbi,
            functionName: 'pqcPublicKey',
          }),
        ]);
        if (
          delegatedOwner.toLowerCase() !== address.toLowerCase() ||
          delegatedRoot.toLowerCase() !== pqcRoot.toLowerCase()
        ) {
          throw new Error('The confirmed delegation does not match your account configuration.');
        }
        setTxConfirmed(true);
        return;
      }

      // full / emergency: sweep into a fresh sole-authority account.
      const rawTokens = tokensInput
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const invalidToken = rawTokens.find((value) => !isAddress(value));
      if (invalidToken) throw new Error(`Invalid token address: ${invalidToken}`);
      const tokenList = [...new Set(rawTokens.map((value) => getAddress(value)))];
      const salt = keccak256(pqcRoot);
      const safe = await predictAccountAddress(publicClient, contracts.factory, {
        owner: zeroAddress,
        pqcPublicKey: pqcRoot,
        verifier: contracts.verifier,
        valueThreshold: DEFAULT_THRESHOLD,
        salt,
      });
      setSafeAddress(safe);

      // A predicted CREATE2 address is not yet an account. Deploy and verify its
      // sole-authority configuration before any asset can be swept into it.
      let safeCode = await publicClient.getCode({ address: safe });
      if (!safeCode || safeCode === '0x') {
        setPhase('Deploying and verifying the destination account…');
        const deployHash = await walletClient.sendTransaction({
          to: contracts.factory,
          data: encodeCreateAccount({
            owner: zeroAddress,
            pqcPublicKey: pqcRoot,
            verifier: contracts.verifier,
            valueThreshold: DEFAULT_THRESHOLD,
            salt,
          }),
        });
        setDeploymentHash(deployHash);
        const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
        if (deployReceipt.status !== 'success') {
          throw new Error('The destination account deployment reverted. No assets were moved.');
        }
        safeCode = await publicClient.getCode({ address: safe });
      }
      if (!safeCode || safeCode === '0x') {
        throw new Error('Destination account code is missing. No assets were moved.');
      }
      const [safeOwner, safeRoot, safeVerifier] = await Promise.all([
        publicClient.readContract({ address: safe, abi: pqWeaveAccountAbi, functionName: 'owner' }),
        publicClient.readContract({
          address: safe,
          abi: pqWeaveAccountAbi,
          functionName: 'pqcPublicKey',
        }),
        publicClient.readContract({
          address: safe,
          abi: pqWeaveAccountAbi,
          functionName: 'pqcVerifier',
        }),
      ]);
      if (
        safeOwner.toLowerCase() !== zeroAddress ||
        safeRoot.toLowerCase() !== pqcRoot.toLowerCase() ||
        safeVerifier.toLowerCase() !== contracts.verifier.toLowerCase()
      ) {
        throw new Error(
          'Destination account authority does not match this migration. No assets were moved.',
        );
      }

      await verifyEthereumDestination(
        publicClient,
        {
          chainId,
          account: safe,
          root: pqcRoot,
          verifier: contracts.verifier,
          entryPoint: ENTRYPOINT_V07,
          accountCodeHash: contracts.codeHashes.account,
          verifierCodeHash: contracts.codeHashes.verifier,
          entryPointCodeHash: contracts.codeHashes.entryPoint,
        },
        await publicClient.getBlockNumber(),
      );
      const erc20s = tokenList.length
        ? await discoverErc20Balances(publicClient, address, tokenList, true)
        : [];
      const balance = await publicClient.getBalance({ address });

      const useMailbox = installMailbox && Boolean(contracts.forwarder);
      let delegate: Address;
      let data: Hex;
      if (useMailbox) {
        const code = await publicClient.getCode({ address: contracts.forwarder! });
        if (
          !code ||
          !contracts.codeHashes.forwarder ||
          keccak256(code).toLowerCase() !== contracts.codeHashes.forwarder.toLowerCase()
        ) {
          throw new Error('Forwarder does not match the reviewed deployment manifest.');
        }
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

      await assertWalletContext();
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
      setPhase('Waiting for the sweep to confirm…');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success')
        throw new Error(
          'The sweep reverted. Your EIP-7702 delegation may still be active. Check the original wallet and revoke or reconcile the delegation before retrying.',
        );
      setTxConfirmed(true);
      try {
        const remaining = await discoverErc20Balances(publicClient, address, tokenList, true);
        setReconciliation(
          remaining.length > 0
            ? `${remaining.length} listed token balance(s) remain at the original address. Review them before considering this complete.`
            : 'Listed token balances at the original address are now zero. Check the destination and any unlisted assets separately.',
        );
      } catch {
        setReconciliation(
          'The sweep confirmed, but token balances could not be checked. Verify both addresses in a block explorer.',
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Migration failed.';
      setMigrateError(
        /authorization|7702|eip-7702/i.test(message)
          ? `${message} Check wallet support and any existing delegation before retrying.`
          : message,
      );
    } finally {
      setMigrating(false);
      setPhase(null);
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
              <span className="font-mono text-sm text-ink">{shortenAddress(address)}</span>
              {network ? (
                <span className="rounded-full border border-rule px-2 py-0.5 text-xs text-ink-dim">
                  {network}
                </span>
              ) : (
                <span className="rounded-full border border-caution/30 bg-caution/10 px-2 py-0.5 text-xs text-caution">
                  Unsupported network
                </span>
              )}
            </div>
            <button
              onClick={() => disconnect()}
              className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink-2 transition hover:bg-ink/5"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-ink-dim">
              Works with MetaMask, Rabby, and any injected EVM wallet. PQWeave never takes custody
              of your keys.
            </p>
            <button
              onClick={() => connect({ connector: connectors[0]! })}
              disabled={connecting}
              className="mt-4 rounded-control bg-brand px-5 py-3 font-medium text-paper transition hover:bg-brand-strong disabled:opacity-60"
            >
              {connecting ? 'Connecting…' : 'Connect wallet'}
            </button>
            {connectError && (
              <p className="mt-3 text-sm text-danger">
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
          <p className="text-sm text-ink-dim">Connect a wallet to scan it.</p>
        ) : scanning ? (
          <p className="text-sm text-ink-dim">Scanning {shortenAddress(address ?? '')}…</p>
        ) : report ? (
          <ScanReportCard report={report} />
        ) : (
          <p className="text-sm text-ink-dim">No scan result yet.</p>
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
                  : 'border-rule bg-well hover:bg-ink/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-3.5 w-3.5 rounded-full border ${
                    outcome === meta.key ? 'border-brand bg-brand' : 'border-rule-strong'
                  }`}
                />
                <span className="text-sm font-semibold text-ink">{meta.title}</span>
              </div>
              <p className="mt-1.5 pl-5 text-xs leading-relaxed text-ink-dim">{meta.blurb}</p>
            </button>
          ))}
        </div>
        {outcome === 'harden' && (
          <div className="mt-3 rounded-lg border border-caution/30 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
            Transitional, not quantum-safe. Delegating keeps your original ECDSA key&apos;s
            protocol-level authority — a quantum attacker who recovers it could sign a new
            authorization and remove this guard. A separate account removes that ECDSA fallback;
            network and token risks still remain.
          </div>
        )}
      </Step>

      <Step
        index={4}
        title="Generate your post-quantum key"
        active={isConnected && !seedSaved}
        done={seedSaved}
      >
        <PqcKeygen
          key={`${chainId}:${address ?? 'none'}`}
          disabled={!isConnected || migrating}
          onChange={setKey}
        />
      </Step>

      <Step index={5} title="Execute" active={seedSaved && !txConfirmed} done={txConfirmed}>
        {!executionLive ? (
          <div className="space-y-3 rounded-lg border border-rule bg-well p-4">
            <p className="text-sm leading-relaxed text-ink-2">
              {status.live
                ? 'This wallet is on a different network from the configured deployment. Switch to the supported testnet before executing, and use test funds only.'
                : 'The post-quantum key was generated locally. On-chain execution is unavailable until a configured deployment is ready; contracts must pass an independent audit before real funds are used.'}
            </p>
            <Link
              href="/security"
              className="inline-flex text-sm font-medium text-brand hover:underline"
            >
              Read the security model →
            </Link>
          </div>
        ) : txHash ? (
          <div className="space-y-3">
            <p className={txConfirmed ? 'text-sm text-ok' : 'text-sm text-caution'}>
              {txConfirmed
                ? outcome === 'harden'
                  ? 'Delegation confirmed. The original ECDSA key can still revoke it.'
                  : 'Sweep confirmed. Verify every asset at the destination before relying on it.'
                : (phase ?? 'Transaction submitted; confirmation is pending.')}
            </p>
            {migrateError && <p className="text-sm text-danger">{migrateError}</p>}
            {reconciliation && <p className="text-sm text-ink-2">{reconciliation}</p>}
            {safeAddress && (
              <div className="rounded-lg border border-rule bg-well p-3">
                <div className="text-xs uppercase tracking-wide text-ink-dim">
                  {outcome === 'harden'
                    ? `Revocable delegation · ${pqcOnly ? 'PQ check on account operations' : 'hybrid'}`
                    : 'Destination account · verify sole authority'}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-accent">{safeAddress}</div>
              </div>
            )}
            {isSweep && installMailbox && contracts?.forwarder && (
              <p className="text-xs leading-relaxed text-ink-dim">
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
                className="inline-flex text-sm font-medium text-brand hover:underline"
              >
                View transaction →
              </a>
            )}
          </div>
        ) : (
          <div>
            {isSweep ? (
              <>
                <p className="text-sm text-ink-dim">
                  Deploy a fresh post-quantum account, then sweep your native balance and listed
                  tokens to it. This takes up to two transactions.
                </p>
                <label className="mt-4 block text-xs uppercase tracking-wide text-ink-dim">
                  ERC-20 token addresses (pre-filled from your scan; edit freely)
                </label>
                <textarea
                  value={tokensInput}
                  onChange={(event) => setTokensInput(event.target.value)}
                  placeholder="0x… token addresses to include"
                  spellCheck={false}
                  rows={3}
                  className="mt-2 w-full rounded-control bg-well px-3 py-2 font-mono text-xs text-ink outline-none ring-1 ring-rule transition placeholder:text-ink-faint focus:ring-brand/60"
                />
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-control border border-rule bg-well p-3">
                  <input
                    type="checkbox"
                    checked={installMailbox}
                    disabled={!contracts?.forwarder}
                    onChange={(event) => setInstallMailbox(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span className="text-sm text-ink-2">
                    <span className="font-medium text-ink">Keep my old address as a mailbox</span>
                    <span className="mt-0.5 block text-xs text-ink-dim">
                      Exchange whitelists and anyone paying your old address keep working. Receipts
                      need a separate flush from the old address. The old ECDSA key can still
                      replace this mailbox.
                      {!contracts?.forwarder && ' (Unavailable until the forwarder is deployed.)'}
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-dim">
                  Delegate your address to the PQWeave account implementation in a single
                  transaction. Your ECDSA key still authorizes routine actions; sensitive ones need
                  your post-quantum key.
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-control border border-rule bg-well p-3">
                  <input
                    type="checkbox"
                    checked={pqcOnly}
                    onChange={(event) => setPqcOnly(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span className="text-sm text-ink-2">
                    <span className="font-medium text-ink">
                      Require post-quantum for every operation
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-dim">
                      Stronger, but every transaction then needs your post-quantum key, and each one
                      consumes a one-time key from your tree.
                    </span>
                  </span>
                </label>
              </>
            )}
            <button
              onClick={run}
              disabled={!seedSaved || migrating || !executionLive}
              className="mt-4 rounded-control bg-brand px-5 py-3 font-medium text-paper transition hover:bg-brand-strong disabled:opacity-60"
            >
              {migrating
                ? 'Working…'
                : outcome === 'harden'
                  ? 'Harden my address (one transaction)'
                  : 'Deploy and migrate my wallet'}
            </button>
            {deploymentHash && (
              <p className="mt-3 text-xs text-ink-dim">
                Destination deployment submitted: {deploymentHash.slice(0, 12)}…
              </p>
            )}
            {phase && <p className="mt-3 text-xs text-caution">{phase}</p>}
            {!seedSaved && (
              <p className="mt-3 text-xs text-ink-dim">Save your recovery key in step 4 first.</p>
            )}
            {migrateError && <p className="mt-3 text-sm text-danger">{migrateError}</p>}
          </div>
        )}
      </Step>
    </div>
  );
}
