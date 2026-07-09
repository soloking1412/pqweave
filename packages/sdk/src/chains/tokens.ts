import type { Address } from 'viem';
import type { ChainKey } from './index.js';

export interface KnownToken {
  address: Address;
  symbol: string;
  decimals: number;
  /** USD-pegged stablecoin — its unit count approximates dollar value at risk. */
  stable: boolean;
}

/**
 * Canonical high-liquidity tokens per mainnet chain, used to surface ERC-20
 * value at risk during a scan. Deliberately short: these few tokens hold the
 * overwhelming majority of non-native EVM value. Reads are best-effort
 * (multicall with allowFailure), so a missing or wrong entry degrades to a
 * zero balance rather than a failed scan.
 */
export const KNOWN_TOKENS: Partial<Record<ChainKey, KnownToken[]>> = {
  ethereum: [
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
      stable: true,
    },
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6,
      stable: true,
    },
    {
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      decimals: 18,
      stable: true,
    },
    {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      symbol: 'WETH',
      decimals: 18,
      stable: false,
    },
    {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      symbol: 'WBTC',
      decimals: 8,
      stable: false,
    },
  ],
  base: [
    {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
      stable: true,
    },
    {
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      symbol: 'DAI',
      decimals: 18,
      stable: true,
    },
    {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      decimals: 18,
      stable: false,
    },
    {
      address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      symbol: 'cbBTC',
      decimals: 8,
      stable: false,
    },
  ],
  arbitrum: [
    {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      symbol: 'USDC',
      decimals: 6,
      stable: true,
    },
    {
      address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      symbol: 'USDC.e',
      decimals: 6,
      stable: true,
    },
    {
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      symbol: 'USDT',
      decimals: 6,
      stable: true,
    },
    {
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      symbol: 'DAI',
      decimals: 18,
      stable: true,
    },
    {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      symbol: 'WETH',
      decimals: 18,
      stable: false,
    },
    {
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      symbol: 'WBTC',
      decimals: 8,
      stable: false,
    },
  ],
  optimism: [
    {
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      symbol: 'USDC',
      decimals: 6,
      stable: true,
    },
    {
      address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      symbol: 'USDC.e',
      decimals: 6,
      stable: true,
    },
    {
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      symbol: 'USDT',
      decimals: 6,
      stable: true,
    },
    {
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      symbol: 'DAI',
      decimals: 18,
      stable: true,
    },
    {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      decimals: 18,
      stable: false,
    },
    {
      address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      symbol: 'WBTC',
      decimals: 8,
      stable: false,
    },
  ],
  polygon: [
    {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      symbol: 'USDC',
      decimals: 6,
      stable: true,
    },
    {
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      symbol: 'USDC.e',
      decimals: 6,
      stable: true,
    },
    {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      symbol: 'USDT',
      decimals: 6,
      stable: true,
    },
    {
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      symbol: 'DAI',
      decimals: 18,
      stable: true,
    },
    {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      symbol: 'WETH',
      decimals: 18,
      stable: false,
    },
    {
      address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      symbol: 'WBTC',
      decimals: 8,
      stable: false,
    },
  ],
};

export function knownTokens(chain: ChainKey): KnownToken[] {
  return KNOWN_TOKENS[chain] ?? [];
}
