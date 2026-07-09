import type { Address, Hex, PublicClient } from 'viem';
import type { ChainKey } from '../chains/index.js';

/** Subset of a viem PublicClient the scanner depends on. */
export type ScannerClient = Pick<
  PublicClient,
  'getTransactionCount' | 'getCode' | 'getBalance' | 'getTransaction' | 'readContract'
>;

export interface ExposureOptions {
  /**
   * Known PQWeave account implementations. An EOA delegated (EIP-7702) to
   * one of these is reported as hardened.
   */
  knownImplementations?: Address[];
  /**
   * Known PQWeave PQC verifier addresses. A contract account whose
   * `pqcVerifier()` returns one of these is recognized as a PQWeave
   * post-quantum account (the migration destination).
   */
  knownVerifiers?: Address[];
  /**
   * Hash of an outgoing transaction. When provided, the scanner recovers and
   * returns the account's secp256k1 public key from that transaction.
   */
  recoverFromTx?: Hex;
}

export interface ExposureResult {
  address: Address;
  /** True once the account has broadcast a transaction, revealing its public key. */
  exposed: boolean;
  /** Number of transactions the account has sent. */
  nonce: number;
  /** Account holds contract bytecode that is not an EIP-7702 delegation. */
  isContract: boolean;
  /** EIP-7702 delegation target, if the account delegates to contract code. */
  delegatedTo: Address | null;
  /** Delegated to a known PQWeave implementation. */
  hardened: boolean;
  /** Contract account recognized as a PQWeave post-quantum account. */
  pqweaveProtected: boolean;
  /** Recovered uncompressed public key, when available. */
  publicKey: Hex | null;
}

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/** A non-zero balance in a known ERC-20, read during the scan. */
export interface TokenHolding {
  token: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
  /** USD-pegged stablecoin — unit count approximates dollar value at risk. */
  stable: boolean;
}

export interface RiskAssessment extends ExposureResult {
  chain: ChainKey;
  nativeBalanceWei: bigint;
  /** Non-zero balances in well-known ERC-20s (USDC, USDT, DAI, WETH, WBTC…). */
  tokenHoldings: TokenHolding[];
  /** 0–100, higher means more exposed to a quantum key-recovery attack. */
  score: number;
  level: RiskLevel;
  reasons: string[];
}
