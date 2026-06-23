import { formatEther, type Address } from 'viem';
import { type ChainKey, getPublicClient } from '../chains/index.js';
import { getExposure } from './exposure.js';
import { assessRisk } from './risk.js';
import type { ExposureOptions, RiskAssessment } from './types.js';

export { getExposure, recoverTransactionPublicKey } from './exposure.js';
export { assessRisk } from './risk.js';
export type {
  ExposureOptions,
  ExposureResult,
  RiskAssessment,
  RiskLevel,
  ScannerClient,
} from './types.js';

export interface ScanOptions extends ExposureOptions {
  /** Override the RPC URL for the target chain. */
  rpcUrl?: string;
}

/** Scan a single address on a chain and return a full risk assessment. */
export async function scanAddress(
  chain: ChainKey,
  address: Address,
  options: ScanOptions = {},
): Promise<RiskAssessment> {
  const { rpcUrl, ...exposureOptions } = options;
  const client = getPublicClient(chain, rpcUrl);
  const [exposure, nativeBalanceWei] = await Promise.all([
    getExposure(client, address, exposureOptions),
    client.getBalance({ address }),
  ]);
  return assessRisk(exposure, nativeBalanceWei, chain);
}

/** Scan many addresses on the same chain, reusing one client. */
export async function scanAddresses(
  chain: ChainKey,
  addresses: Address[],
  options: ScanOptions = {},
): Promise<RiskAssessment[]> {
  const { rpcUrl, ...exposureOptions } = options;
  const client = getPublicClient(chain, rpcUrl);
  return Promise.all(
    addresses.map(async (address) => {
      const [exposure, nativeBalanceWei] = await Promise.all([
        getExposure(client, address, exposureOptions),
        client.getBalance({ address }),
      ]);
      return assessRisk(exposure, nativeBalanceWei, chain);
    }),
  );
}

const CSV_HEADER = 'address,chain,level,score,exposed,nonce,nativeBalance,hardened';

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
      String(a.hardened),
    ].join(','),
  );
  return [CSV_HEADER, ...rows].join('\n');
}
