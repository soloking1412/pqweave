import { formatEther, formatUnits, getAddress, isAddress } from 'viem';
import { isAlgorandAddress, scanAlgorandAddress } from '@pqweave/sdk/algorand';
import { isAptosAddress, scanAptosAddress } from '@pqweave/sdk/aptos';
import {
  bitcoinAddressNetwork,
  isUtxoAddress,
  LITECOIN,
  scanUtxoAddress,
} from '@pqweave/sdk/bitcoin';
import { isCardanoAddress, scanCardanoAddress } from '@pqweave/sdk/cardano';
import { isChainKey, MAINNET_CHAIN_KEYS } from '@pqweave/sdk/chains';
import { isCosmosAddress, scanCosmosAddress } from '@pqweave/sdk/cosmos';
import { isDogecoinAddress, scanDogecoinAddress } from '@pqweave/sdk/dogecoin';
import { isNearAddress, scanNearAddress } from '@pqweave/sdk/near';
import { isPolkadotAddress, scanPolkadotAddress } from '@pqweave/sdk/polkadot';
import { scanAddress, scanAddressAcrossChains, type RiskAssessment } from '@pqweave/sdk/scanner';
import { isSolanaAddress, scanSolanaAddress } from '@pqweave/sdk/solana';
import { isStellarAddress, scanStellarAddress } from '@pqweave/sdk/stellar';
import { isSuiAddress, scanSuiAddress } from '@pqweave/sdk/sui';
import { isTonAddress, scanTonAddress } from '@pqweave/sdk/ton';
import { isTronAddress, scanTronAddress } from '@pqweave/sdk/tron';
import { isXrpAddress, scanXrpAddress } from '@pqweave/sdk/xrp';
import { bitcoinIndexerNetwork, bitcoinJson, BITCOIN_FETCH } from '@/lib/bitcoin-indexer';
import { getKnownPQWeave } from '@/lib/contracts';
import type {
  AccountScanReport,
  MultiChainScanEntry,
  MultiChainScanReport,
  ScanReport,
  UtxoScanReport,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Reject if a scan takes too long, so a slow RPC/indexer can't hang the request. */
async function withTimeout<T>(promise: Promise<T>, ms = 18_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('scan timed out')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

type AccountFields = Omit<AccountScanReport, 'kind' | 'addressIsKey'>;

interface AccountScanner {
  valid: (address: string) => boolean;
  /** True when the address itself is the public key (no fresh-address fix). */
  addressIsKey: boolean;
  scan: (address: string) => Promise<AccountFields>;
}

const accountScanners: Record<string, AccountScanner> = {
  solana: {
    valid: isSolanaAddress,
    addressIsKey: true,
    scan: async (a) => {
      const r = await scanSolanaAddress(a);
      return {
        chain: 'Solana',
        symbol: 'SOL',
        address: r.address,
        exposed: r.exposed,
        balance: r.balanceSol,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  algorand: {
    valid: isAlgorandAddress,
    addressIsKey: true,
    scan: async (a) => {
      const r = await scanAlgorandAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
        ...(r.authorizationAddress ? { authorizationAddress: r.authorizationAddress } : {}),
        currentAuthority: r.currentAuthority,
      };
    },
  },
  stellar: {
    valid: isStellarAddress,
    addressIsKey: true,
    scan: async (a) => {
      const r = await scanStellarAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  cosmos: {
    valid: isCosmosAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanCosmosAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  xrp: {
    valid: isXrpAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanXrpAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  cardano: {
    valid: isCardanoAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanCardanoAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  near: {
    valid: isNearAddress,
    addressIsKey: true,
    scan: async (a) => {
      const r = await scanNearAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  aptos: {
    valid: isAptosAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanAptosAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  tron: {
    valid: isTronAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanTronAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  sui: {
    valid: isSuiAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanSuiAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  ton: {
    valid: isTonAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanTonAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  polkadot: {
    valid: isPolkadotAddress,
    addressIsKey: true,
    scan: async (a) => {
      const r = await scanPolkadotAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
  dogecoin: {
    valid: isDogecoinAddress,
    addressIsKey: false,
    scan: async (a) => {
      const r = await scanDogecoinAddress(a);
      return {
        chain: r.chain,
        symbol: r.symbol,
        address: r.address,
        exposed: r.exposed,
        balance: r.balance,
        score: r.score,
        level: r.level,
        reasons: r.reasons,
      };
    },
  },
};

function toEvmReport(assessment: RiskAssessment): ScanReport {
  return {
    kind: 'evm',
    address: assessment.address,
    chain: assessment.chain,
    exposed: assessment.exposed,
    nonce: assessment.nonce,
    isContract: assessment.isContract,
    delegatedTo: assessment.delegatedTo,
    hardened: assessment.hardened,
    pqweaveProtected: assessment.pqweaveProtected,
    publicKey: assessment.publicKey,
    nativeBalanceWei: assessment.nativeBalanceWei.toString(),
    nativeBalanceFormatted: formatEther(assessment.nativeBalanceWei),
    tokenHoldings: assessment.tokenHoldings.map((holding) => ({
      token: holding.token,
      symbol: holding.symbol,
      decimals: holding.decimals,
      amountWei: holding.amount.toString(),
      amountFormatted: formatUnits(holding.amount, holding.decimals),
    })),
    score: assessment.score,
    level: assessment.level,
    reasons: assessment.reasons,
  };
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const address = (searchParams.get('address') ?? '').trim();
  const chain = searchParams.get('chain') ?? 'ethereum';

  if (chain === 'evm-all') {
    if (!isAddress(address)) {
      return Response.json({ error: 'Enter a valid EVM address.' }, { status: 400 });
    }
    try {
      const known = getKnownPQWeave();
      // Per-chain 12s deadlines bound the aggregate; 18s outer cap is a safety
      // net that still beats the client's 20s abort.
      const outcomes = await withTimeout(
        scanAddressAcrossChains(getAddress(address), MAINNET_CHAIN_KEYS, {
          knownImplementations: known.implementations,
          knownVerifiers: known.verifiers,
        }),
        18_000,
      );
      const results: MultiChainScanEntry[] = outcomes.map((outcome) =>
        outcome.ok
          ? { chain: outcome.chain, ok: true, report: toEvmReport(outcome.assessment!) }
          : {
              chain: outcome.chain,
              ok: false,
              error: 'Scan failed, the RPC endpoint may be unavailable.',
            },
      );
      const succeeded = results.filter(
        (entry): entry is Extract<MultiChainScanEntry, { ok: true }> => entry.ok,
      );
      if (succeeded.length === 0) {
        return Response.json(
          { error: 'Every chain scan failed, RPC endpoints may be unavailable. Try again.' },
          { status: 502 },
        );
      }
      const worst = succeeded.reduce((max, entry) =>
        entry.report.score > max.report.score ? entry : max,
      );
      const report: MultiChainScanReport = {
        kind: 'evm-multi',
        address: getAddress(address),
        results,
        score: worst.report.score,
        level: worst.report.level,
        exposedChains: succeeded.filter((entry) => entry.report.exposed).map((e) => e.chain),
      };
      return Response.json(report);
    } catch {
      return Response.json(
        { error: 'Multi-chain scan failed or timed out. Try again.' },
        { status: 502 },
      );
    }
  }

  if (chain === 'bitcoin' || chain === 'litecoin') {
    let network;
    try {
      network =
        chain === 'litecoin'
          ? LITECOIN
          : bitcoinIndexerNetwork(
              bitcoinAddressNetwork(address) === 'testnet' ? 'testnet' : 'bitcoin',
            ).network;
    } catch {
      return bitcoinJson({ error: 'Bitcoin indexer configuration unavailable' }, 503);
    }
    if (!isUtxoAddress(address, network)) {
      return Response.json({ error: `Enter a valid ${network.name} address.` }, { status: 400 });
    }
    try {
      const a = await withTimeout(
        scanUtxoAddress(address, network, { ...BITCOIN_FETCH, signal: request.signal }),
      );
      const report: UtxoScanReport = {
        kind: 'utxo',
        network: a.network,
        symbol: a.symbol,
        address: a.address,
        type: a.type,
        exposed: a.exposed,
        hasSpent: a.hasSpent,
        txCount: a.txCount,
        balance: a.balance,
        score: a.score,
        level: a.level,
        reasons: a.reasons,
      };
      return bitcoinJson(report);
    } catch {
      return Response.json(
        { error: `${network.name} scan failed, the indexer may be unavailable. Try again.` },
        { status: 502 },
      );
    }
  }

  const accountScanner = Object.hasOwn(accountScanners, chain) ? accountScanners[chain] : undefined;
  if (accountScanner) {
    if (!accountScanner.valid(address)) {
      return Response.json(
        { error: 'Enter a valid address for the selected chain.' },
        { status: 400 },
      );
    }
    try {
      const fields = await withTimeout(accountScanner.scan(address));
      const report: AccountScanReport = {
        kind: 'account',
        addressIsKey: accountScanner.addressIsKey,
        ...fields,
      };
      return Response.json(report);
    } catch {
      return Response.json(
        { error: 'Scan failed, the endpoint may be unavailable. Try again.' },
        { status: 502 },
      );
    }
  }

  if (!isAddress(address)) {
    return Response.json({ error: 'Enter a valid EVM address.' }, { status: 400 });
  }
  if (!isChainKey(chain)) {
    return Response.json({ error: 'Unsupported chain.' }, { status: 400 });
  }

  try {
    const known = getKnownPQWeave();
    const assessment = await withTimeout(
      scanAddress(chain, getAddress(address), {
        knownImplementations: known.implementations,
        knownVerifiers: known.verifiers,
      }),
    );
    return Response.json(toEvmReport(assessment), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // The visitor gets a plain message; the cause goes to the server log.
    console.error(`evm scan failed on ${chain}:`, error instanceof Error ? error.message : error);
    return Response.json(
      {
        error:
          'Scan failed. Every public endpoint for this chain is unavailable right now. Try again in a moment.',
      },
      { status: 502 },
    );
  }
}
