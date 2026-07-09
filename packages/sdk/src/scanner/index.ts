import { erc20Abi, formatEther, formatUnits, type Address, type PublicClient } from 'viem';
import { type ChainKey, getPublicClient, MAINNET_CHAIN_KEYS } from '../chains/index.js';
import { knownTokens, type KnownToken } from '../chains/tokens.js';
import { getExposure } from './exposure.js';
import { assessRisk } from './risk.js';
import type { ExposureOptions, RiskAssessment, TokenHolding } from './types.js';

export { getExposure, recoverTransactionPublicKey } from './exposure.js';
export { assessRisk } from './risk.js';
export type {
  ExposureOptions,
  ExposureResult,
  RiskAssessment,
  RiskLevel,
  ScannerClient,
  TokenHolding,
} from './types.js';

export interface ScanOptions extends ExposureOptions {
  /** Override the RPC URL for the target chain. */
  rpcUrl?: string;
}

/**
 * Read balances for the chain's well-known tokens. Best-effort: a failed
 * multicall (or a chain with no registry) degrades to "no token data" rather
 * than failing the scan.
 */
async function readTokenHoldings(
  client: PublicClient,
  owner: Address,
  tokens: KnownToken[],
): Promise<TokenHolding[]> {
  if (tokens.length === 0) return [];
  try {
    const results = await client.multicall({
      allowFailure: true,
      contracts: tokens.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [owner] as const,
      })),
    });
    const holdings: TokenHolding[] = [];
    results.forEach((result, index) => {
      if (result.status === 'success' && (result.result as bigint) > 0n) {
        const token = tokens[index]!;
        holdings.push({
          token: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
          amount: result.result as bigint,
          stable: token.stable,
        });
      }
    });
    return holdings;
  } catch {
    return [];
  }
}

/** Scan a single address on a chain and return a full risk assessment. */
export async function scanAddress(
  chain: ChainKey,
  address: Address,
  options: ScanOptions = {},
): Promise<RiskAssessment> {
  const { rpcUrl, ...exposureOptions } = options;
  const client = getPublicClient(chain, rpcUrl);
  const [exposure, nativeBalanceWei, tokenHoldings] = await Promise.all([
    getExposure(client, address, exposureOptions),
    client.getBalance({ address }),
    readTokenHoldings(client, address, knownTokens(chain)),
  ]);
  return assessRisk(exposure, nativeBalanceWei, chain, tokenHoldings);
}

/** Scan many addresses on the same chain, reusing one client. */
export async function scanAddresses(
  chain: ChainKey,
  addresses: Address[],
  options: ScanOptions = {},
): Promise<RiskAssessment[]> {
  const { rpcUrl, ...exposureOptions } = options;
  const client = getPublicClient(chain, rpcUrl);
  const tokens = knownTokens(chain);
  return Promise.all(
    addresses.map(async (address) => {
      const [exposure, nativeBalanceWei, tokenHoldings] = await Promise.all([
        getExposure(client, address, exposureOptions),
        client.getBalance({ address }),
        readTokenHoldings(client, address, tokens),
      ]);
      return assessRisk(exposure, nativeBalanceWei, chain, tokenHoldings);
    }),
  );
}

/** Outcome of scanning one chain during a multi-chain scan. */
export interface ChainScanOutcome {
  chain: ChainKey;
  ok: boolean;
  assessment: RiskAssessment | null;
  /** Human-readable failure (RPC down, timeout) when `ok` is false. */
  error: string | null;
}

export interface MultiChainScanOptions extends ExposureOptions {
  /** Per-chain time budget in ms; a chain that exceeds it reports as failed. */
  timeoutMs?: number;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('scan timed out')), ms)),
  ]);
}

/**
 * Scan the same address across several EVM chains in parallel. An EVM address
 * exists on every chain, and its exposure differs per chain (nonces, balances,
 * and delegations are independent), so the full picture needs all of them.
 * Each chain gets its own deadline, so one slow or failing RPC reports as a
 * failed outcome instead of sinking (or stalling) the whole scan.
 */
export async function scanAddressAcrossChains(
  address: Address,
  chains: ChainKey[] = MAINNET_CHAIN_KEYS,
  options: MultiChainScanOptions = {},
): Promise<ChainScanOutcome[]> {
  const { timeoutMs = 12_000, ...exposureOptions } = options;
  const settled = await Promise.allSettled(
    chains.map((chain) => withDeadline(scanAddress(chain, address, exposureOptions), timeoutMs)),
  );
  return settled.map((result, index) => {
    const chain = chains[index]!;
    if (result.status === 'fulfilled') {
      return { chain, ok: true, assessment: result.value, error: null };
    }
    const message = result.reason instanceof Error ? result.reason.message : 'scan failed';
    return { chain, ok: false, assessment: null, error: message };
  });
}

const CSV_HEADER = 'address,chain,level,score,exposed,nonce,nativeBalance,tokensAtRisk,hardened';

/** Serialize assessments to CSV for reporting and enterprise batch jobs. */
export function assessmentsToCsv(assessments: RiskAssessment[]): string {
  const rows = assessments.map((a) =>
    [
      a.address,
      a.chain,
      a.level,
      String(a.score),
      String(a.exposed),
      String(a.nonce),
      formatEther(a.nativeBalanceWei),
      a.tokenHoldings.map((h) => `${formatUnits(h.amount, h.decimals)} ${h.symbol}`).join('; '),
      String(a.hardened),
    ].join(','),
  );
  return [CSV_HEADER, ...rows].join('\n');
}
