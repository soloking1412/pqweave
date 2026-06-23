import type { UtxoAddressType, UtxoNetworkId } from '@pqweave/sdk/bitcoin';
import type { ChainKey } from '@pqweave/sdk/chains';
import type { RiskLevel } from '@pqweave/sdk/scanner';

/** JSON-serializable EVM scan result returned by /api/scan. */
export interface ScanReport {
  kind: 'evm';
  address: string;
  chain: ChainKey;
  exposed: boolean;
  nonce: number;
  isContract: boolean;
  delegatedTo: string | null;
  hardened: boolean;
  pqweaveProtected: boolean;
  publicKey: string | null;
  nativeBalanceWei: string;
  nativeBalanceFormatted: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

/** JSON-serializable UTXO (Bitcoin, Litecoin, …) scan result returned by /api/scan. */
export interface UtxoScanReport {
  kind: 'utxo';
  network: UtxoNetworkId;
  symbol: string;
  address: string;
  type: UtxoAddressType;
  exposed: boolean;
  hasSpent: boolean;
  txCount: number;
  balance: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

/**
 * JSON-serializable account-model scan result (Solana, Algorand, Stellar,
 * Cosmos, XRP, Cardano) — chains whose exposure is a single balance + flag.
 */
export interface AccountScanReport {
  kind: 'account';
  chain: string;
  symbol: string;
  address: string;
  exposed: boolean;
  balance: string;
  /** True when the address itself is the public key (no fresh-address fix). */
  addressIsKey: boolean;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export type AnyScanReport = ScanReport | UtxoScanReport | AccountScanReport;
