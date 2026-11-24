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
  /** Extra public endpoints tried when the default RPC fails or rate-limits. */
  fallbackRpcUrls?: string[];
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  ethereum: {
    key: 'ethereum',
    chain: mainnet,
    rpcEnvVar: 'RPC_URL_ETHEREUM',
    testnet: false,
    fallbackRpcUrls: ['https://ethereum-rpc.publicnode.com'],
  },
  base: {
    key: 'base',
    chain: base,
    rpcEnvVar: 'RPC_URL_BASE',
    testnet: false,
    fallbackRpcUrls: ['https://base-rpc.publicnode.com'],
  },
  arbitrum: {
    key: 'arbitrum',
    chain: arbitrum,
    rpcEnvVar: 'RPC_URL_ARBITRUM',
    testnet: false,
    fallbackRpcUrls: ['https://arbitrum-one-rpc.publicnode.com'],
  },
  optimism: {
    key: 'optimism',
    chain: optimism,
    rpcEnvVar: 'RPC_URL_OPTIMISM',
    testnet: false,
    fallbackRpcUrls: ['https://optimism-rpc.publicnode.com'],
  },
  polygon: {
    key: 'polygon',
    chain: polygon,
    rpcEnvVar: 'RPC_URL_POLYGON',
    testnet: false,
    fallbackRpcUrls: ['https://polygon-bor-rpc.publicnode.com'],
  },
  sepolia: { key: 'sepolia', chain: sepolia, rpcEnvVar: 'RPC_URL_SEPOLIA', testnet: true },
  'base-sepolia': {
    key: 'base-sepolia',
    chain: baseSepolia,
    rpcEnvVar: 'RPC_URL_BASE_SEPOLIA',
    testnet: true,
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
  // Fail fast on a slow or unreachable RPC instead of hanging the request.
  const httpOptions = { timeout: 6_000, retryCount: 1 };

  // An explicit override or configured env RPC is dedicated infrastructure —
  // use it alone so failures surface instead of silently degrading.
  const fromEnv = typeof process !== 'undefined' ? process.env?.[config.rpcEnvVar] : undefined;
  const dedicated = override ?? fromEnv;
  if (dedicated) return http(dedicated, httpOptions);

  const urls = [config.chain.rpcUrls.default.http[0], ...(config.fallbackRpcUrls ?? [])].filter(
    (url): url is string => Boolean(url),
  );
  if (urls.length === 0) throw new Error(`No RPC URL configured for chain "${config.key}"`);
  if (urls.length === 1) return http(urls[0], httpOptions);
  // Public endpoints rate-limit unpredictably; rotate through them per request.
  return fallback(urls.map((url) => http(url, httpOptions)));
}

export function getPublicClient(key: ChainKey, rpcUrl?: string): PublicClient<Transport, Chain> {
  const config = CHAINS[key];
  return createPublicClient({
    chain: config.chain,
    transport: resolveTransport(config, rpcUrl),
  });
}
