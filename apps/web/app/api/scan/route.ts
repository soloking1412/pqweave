import { formatEther, getAddress, isAddress } from 'viem';
import { isAlgorandAddress, scanAlgorandAddress } from '@pqweave/sdk/algorand';
import { isAptosAddress, scanAptosAddress } from '@pqweave/sdk/aptos';
import { BITCOIN, isUtxoAddress, LITECOIN, scanUtxoAddress } from '@pqweave/sdk/bitcoin';
import { isCardanoAddress, scanCardanoAddress } from '@pqweave/sdk/cardano';
import { isChainKey } from '@pqweave/sdk/chains';
import { isCosmosAddress, scanCosmosAddress } from '@pqweave/sdk/cosmos';
import { isNearAddress, scanNearAddress } from '@pqweave/sdk/near';
import { scanAddress } from '@pqweave/sdk/scanner';
import { isSolanaAddress, scanSolanaAddress } from '@pqweave/sdk/solana';
import { isStellarAddress, scanStellarAddress } from '@pqweave/sdk/stellar';
import { isXrpAddress, scanXrpAddress } from '@pqweave/sdk/xrp';
import { getKnownPQWeave } from '@/lib/contracts';
import type { AccountScanReport, ScanReport, UtxoScanReport } from '@/lib/types';

export const dynamic = 'force-dynamic';

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
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const address = (searchParams.get('address') ?? '').trim();
  const chain = searchParams.get('chain') ?? 'ethereum';

  if (chain === 'bitcoin' || chain === 'litecoin') {
    const network = chain === 'litecoin' ? LITECOIN : BITCOIN;
    if (!isUtxoAddress(address, network)) {
      return Response.json({ error: `Enter a valid ${network.name} address.` }, { status: 400 });
    }
    try {
      const a = await scanUtxoAddress(address, network);
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
      return Response.json(report);
    } catch {
      return Response.json(
        { error: `${network.name} scan failed — the indexer may be unavailable. Try again.` },
        { status: 502 },
      );
    }
  }

  const accountScanner = accountScanners[chain];
  if (accountScanner) {
    if (!accountScanner.valid(address)) {
      return Response.json(
        { error: 'Enter a valid address for the selected chain.' },
        { status: 400 },
      );
    }
    try {
      const fields = await accountScanner.scan(address);
      const report: AccountScanReport = {
        kind: 'account',
        addressIsKey: accountScanner.addressIsKey,
        ...fields,
      };
      return Response.json(report);
    } catch {
      return Response.json(
        { error: 'Scan failed — the endpoint may be unavailable. Try again.' },
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
    const assessment = await scanAddress(chain, getAddress(address), {
      knownImplementations: known.implementations,
      knownVerifiers: known.verifiers,
    });
    const report: ScanReport = {
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
      score: assessment.score,
      level: assessment.level,
      reasons: assessment.reasons,
    };
    return Response.json(report);
  } catch {
    return Response.json(
      {
        error: 'Scan failed — the RPC endpoint may be unavailable. Try again or set a custom RPC.',
      },
      { status: 502 },
    );
  }
}
