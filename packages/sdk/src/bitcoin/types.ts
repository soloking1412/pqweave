import type { RiskLevel } from '../scanner/index.js';
import type { UtxoNetworkId } from './networks.js';

export type { RiskLevel };

/**
 * `p2mr` is BIP-360 Pay-to-Merkle-Root (SegWit v2, `bc1z…`). The BIP is Draft
 * and not activated on any network, so these outputs are recognized but not yet
 * spendable — see `bitcoin/p2mr.ts`.
 */
export type UtxoAddressType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr' | 'p2mr' | 'unknown';

/** Minimal subset of the Esplora `/address/:address` response the scanner uses. */
export interface EsploraAddressStats {
  chain_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
    spent_txo_count: number;
    tx_count: number;
  };
}

export interface UtxoExposureResult {
  address: string;
  network: UtxoNetworkId;
  type: UtxoAddressType;
  /** True when the public key behind the address is recoverable on-chain. */
  exposed: boolean;
  /** The address has been spent from at least once. */
  hasSpent: boolean;
  txCount: number;
  balanceSats: bigint;
}

export interface UtxoRiskAssessment extends UtxoExposureResult {
  symbol: string;
  /** Balance formatted in whole coins. */
  balance: string;
  /** 0–100, higher means more exposed to a quantum key-recovery attack. */
  score: number;
  level: RiskLevel;
  reasons: string[];
}
