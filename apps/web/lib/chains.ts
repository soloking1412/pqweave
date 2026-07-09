import type { ChainKey } from '@pqweave/sdk/chains';

export interface ChainOption {
  key: ChainKey;
  label: string;
  nativeSymbol: string;
}

export const CHAIN_OPTIONS: ChainOption[] = [
  { key: 'ethereum', label: 'Ethereum', nativeSymbol: 'ETH' },
  { key: 'base', label: 'Base', nativeSymbol: 'ETH' },
  { key: 'arbitrum', label: 'Arbitrum', nativeSymbol: 'ETH' },
  { key: 'optimism', label: 'Optimism', nativeSymbol: 'ETH' },
  { key: 'polygon', label: 'Polygon', nativeSymbol: 'POL' },
  { key: 'base-sepolia', label: 'Base Sepolia', nativeSymbol: 'ETH' },
  { key: 'sepolia', label: 'Sepolia', nativeSymbol: 'ETH' },
];

export function nativeSymbol(chain: ChainKey): string {
  return CHAIN_OPTIONS.find((option) => option.key === chain)?.nativeSymbol ?? 'ETH';
}

export type ScanChain =
  | ChainKey
  | 'evm-all'
  | 'bitcoin'
  | 'litecoin'
  | 'solana'
  | 'cosmos'
  | 'xrp'
  | 'cardano'
  | 'algorand'
  | 'stellar'
  | 'near'
  | 'aptos'
  | 'tron'
  | 'sui'
  | 'ton'
  | 'polkadot'
  | 'dogecoin';

export interface ScanOption {
  key: ScanChain;
  label: string;
}

export const SCAN_OPTIONS: ScanOption[] = [
  { key: 'evm-all', label: 'All EVM chains' },
  ...CHAIN_OPTIONS.map((option) => ({ key: option.key, label: option.label })),
  { key: 'bitcoin', label: 'Bitcoin' },
  { key: 'litecoin', label: 'Litecoin' },
  { key: 'solana', label: 'Solana' },
  { key: 'cardano', label: 'Cardano' },
  { key: 'cosmos', label: 'Cosmos (ATOM)' },
  { key: 'xrp', label: 'XRP Ledger' },
  { key: 'algorand', label: 'Algorand' },
  { key: 'stellar', label: 'Stellar' },
  { key: 'near', label: 'NEAR' },
  { key: 'aptos', label: 'Aptos' },
  { key: 'tron', label: 'Tron' },
  { key: 'sui', label: 'Sui' },
  { key: 'ton', label: 'TON' },
  { key: 'polkadot', label: 'Polkadot' },
  { key: 'dogecoin', label: 'Dogecoin' },
];
