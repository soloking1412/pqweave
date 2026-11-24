import {
  type Chain,
  createPublicClient,
  fallback,
  http,
  type PublicClient,
  type Transport,
} from 'viem';
import { arbitrum, base, baseSepolia, mainnet, optimism, polygon, sepolia } from 'viem/chains';

export { KNOWN_TOKENS, knownTokens, type KnownToken } from './tokens.js';

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
  /**
   * Public endpoints, tried in order. Listed explicitly instead of relying on
   * viem's built-in default, which has pointed at a dead host before.
   */
  rpcUrls: string[];
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  ethereum: {
    key: 'ethereum',
    chain: mainnet,
    rpcEnvVar: 'RPC_URL_ETHEREUM',
    testnet: false,
    rpcUrls: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.drpc.org',
      'https://mainnet.gateway.tenderly.co',
      'https://eth-pokt.nodies.app',
    ],
  },
  base: {
    key: 'base',
    chain: base,
    rpcEnvVar: 'RPC_URL_BASE',
    testnet: false,
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
      'https://base.drpc.org',
      'https://base.gateway.tenderly.co',
      'https://1rpc.io/base',
    ],
  },
  arbitrum: {
    key: 'arbitrum',
    chain: arbitrum,
    rpcEnvVar: 'RPC_URL_ARBITRUM',
    testnet: false,
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
      'https://arbitrum.drpc.org',
      'https://arbitrum.gateway.tenderly.co',
      'https://1rpc.io/arb',
    ],
  },
  optimism: {
    key: 'optimism',
    chain: optimism,
    rpcEnvVar: 'RPC_URL_OPTIMISM',
    testnet: false,
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism-rpc.publicnode.com',
      'https://optimism.drpc.org',
      'https://optimism.gateway.tenderly.co',
      'https://op-pokt.nodies.app',
    ],
  },
  polygon: {
    key: 'polygon',
    chain: polygon,
    rpcEnvVar: 'RPC_URL_POLYGON',
    testnet: false,
    rpcUrls: [
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon.drpc.org',
      'https://polygon.gateway.tenderly.co',
      'https://1rpc.io/matic',
    ],
  },
  sepolia: {
    key: 'sepolia',
    chain: sepolia,
    rpcEnvVar: 'RPC_URL_SEPOLIA',
    testnet: true,
    rpcUrls: [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.gateway.tenderly.co',
      'https://1rpc.io/sepolia',
    ],
  },
  'base-sepolia': {
    key: 'base-sepolia',
    chain: baseSepolia,
    rpcEnvVar: 'RPC_URL_BASE_SEPOLIA',
    testnet: true,
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com',
      'https://base-sepolia.drpc.org',
      'https://base-sepolia.gateway.tenderly.co',
    ],
  },
};

export const CHAIN_KEYS = Object.keys(CHAINS) as ChainKey[];

/** Mainnet chains only — the default set for a multi-chain exposure scan. */
export const MAINNET_CHAIN_KEYS = CHAIN_KEYS.filter((key) => !CHAINS[key].testnet);

export function isChainKey(value: string): value is ChainKey {
  return Object.hasOwn(CHAINS, value);
}

export function chainConfig(key: ChainKey): ChainConfig {
  return CHAINS[key];
}

function resolveTransport(config: ChainConfig, override?: string): Transport {
  // An endpoint the caller names is used alone, so its failures surface.
  if (override) return http(override, { timeout: 6_000, retryCount: 1 });

  // A configured endpoint goes first, but the public list still backs it up: a
  // key that expired or a provider outage should not take scanning down.
  const fromEnv = typeof process !== 'undefined' ? process.env?.[config.rpcEnvVar] : undefined;
  const urls = fromEnv?.trim() ? [fromEnv.trim(), ...config.rpcUrls] : config.rpcUrls;

  // Public endpoints fail and rate-limit unpredictably. Give each a short
  // deadline and no retry, so a dead one costs seconds and the next is tried.
  return fallback(
    urls.map((url) => http(url, { timeout: 4_000, retryCount: 0 })),
    { rank: false },
  );
}

export function getPublicClient(key: ChainKey, rpcUrl?: string): PublicClient<Transport, Chain> {
  const config = CHAINS[key];
  return createPublicClient({
    chain: config.chain,
    transport: resolveTransport(config, rpcUrl),
  });
}
