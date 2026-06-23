import { type Chain, createPublicClient, http, type PublicClient, type Transport } from 'viem';
import { arbitrum, base, baseSepolia, mainnet, optimism, polygon, sepolia } from 'viem/chains';

export type ChainKey =
  | 'ethereum'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'polygon'
  | 'sepolia'
  | 'base-sepolia';

export interface ChainConfig {
  key: ChainKey;
  chain: Chain;
  /** Environment variable read for a custom RPC URL. */
  rpcEnvVar: string;
  testnet: boolean;
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  ethereum: { key: 'ethereum', chain: mainnet, rpcEnvVar: 'RPC_URL_ETHEREUM', testnet: false },
  base: { key: 'base', chain: base, rpcEnvVar: 'RPC_URL_BASE', testnet: false },
  arbitrum: { key: 'arbitrum', chain: arbitrum, rpcEnvVar: 'RPC_URL_ARBITRUM', testnet: false },
  optimism: { key: 'optimism', chain: optimism, rpcEnvVar: 'RPC_URL_OPTIMISM', testnet: false },
  polygon: { key: 'polygon', chain: polygon, rpcEnvVar: 'RPC_URL_POLYGON', testnet: false },
  sepolia: { key: 'sepolia', chain: sepolia, rpcEnvVar: 'RPC_URL_SEPOLIA', testnet: true },
  'base-sepolia': {
    key: 'base-sepolia',
    chain: baseSepolia,
    rpcEnvVar: 'RPC_URL_BASE_SEPOLIA',
    testnet: true,
  },
};

export const CHAIN_KEYS = Object.keys(CHAINS) as ChainKey[];

export function isChainKey(value: string): value is ChainKey {
  return value in CHAINS;
}

export function chainConfig(key: ChainKey): ChainConfig {
  return CHAINS[key];
}

function resolveRpcUrl(config: ChainConfig, override?: string): string {
  if (override) return override;
  const fromEnv = typeof process !== 'undefined' ? process.env?.[config.rpcEnvVar] : undefined;
  if (fromEnv) return fromEnv;
  const fallback = config.chain.rpcUrls.default.http[0];
  if (!fallback) throw new Error(`No RPC URL configured for chain "${config.key}"`);
  return fallback;
}

export function getPublicClient(key: ChainKey, rpcUrl?: string): PublicClient<Transport, Chain> {
  const config = CHAINS[key];
  return createPublicClient({
    chain: config.chain,
    transport: http(resolveRpcUrl(config, rpcUrl)),
  });
}
