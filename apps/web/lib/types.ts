import type { UtxoAddressType, UtxoNetworkId } from '@pqweave/sdk/bitcoin';
import type { ChainKey } from '@pqweave/sdk/chains';
import type { RiskLevel } from '@pqweave/sdk/scanner';

/** A non-zero known-token balance included in an EVM scan. */
export interface TokenHoldingReport {
  /** ERC-20 contract address — lets the migrate flow pre-fill its sweep list. */
  token: string;
  symbol: string;
  decimals: number;
  amountWei: string;
  amountFormatted: string;
}

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
  tokenHoldings: TokenHoldingReport[];
  score: number;
  level: RiskLevel;
  reasons: string[];
}

/** One chain's outcome within a multi-chain EVM scan. */
export type MultiChainScanEntry =
  | { chain: ChainKey; ok: true; report: ScanReport }
  | { chain: ChainKey; ok: false; error: string };

/** JSON-serializable multi-chain EVM scan (`chain=evm-all`) returned by /api/scan. */
export interface MultiChainScanReport {
  kind: 'evm-multi';
  address: string;
  results: MultiChainScanEntry[];
  /** Worst score/level across the chains that scanned successfully. */
  score: number;
  level: RiskLevel;
  /** Chains where the public key is exposed. */
  exposedChains: ChainKey[];
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

export type AnyScanReport = ScanReport | UtxoScanReport | AccountScanReport | MultiChainScanReport;
