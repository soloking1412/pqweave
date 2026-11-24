import { getAddress, isAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { CHAINS, MAINNET_CHAIN_KEYS } from '../src/chains/index.js';
import { KNOWN_TOKENS, knownTokens } from '../src/chains/tokens.js';
import { assessRisk, type ExposureResult, type TokenHolding } from '../src/scanner/index.js';

const ADDRESS = getAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

function exposure(partial: Partial<ExposureResult>): ExposureResult {
  return {
    address: ADDRESS,
    exposed: false,
    nonce: 0,
    isContract: false,
    delegatedTo: null,
    hardened: false,
    pqweaveProtected: false,
    publicKey: null,
    ...partial,
  };
}

function usdc(amount: bigint): TokenHolding {
  return {
    token: getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    symbol: 'USDC',
    decimals: 6,
    amount,
    stable: true,
  };
}

function weth(amount: bigint): TokenHolding {
  return {
    token: getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    symbol: 'WETH',
    decimals: 18,
    amount,
    stable: false,
  };
}

describe('KNOWN_TOKENS registry', () => {
  it('covers every mainnet chain with checksummed, unique addresses', () => {
    for (const chain of MAINNET_CHAIN_KEYS) {
      const tokens = knownTokens(chain);
      expect(tokens.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const token of tokens) {
        expect(isAddress(token.address)).toBe(true);
        expect(token.address).toBe(getAddress(token.address));
        expect(seen.has(token.address)).toBe(false);
        seen.add(token.address);
        expect(token.decimals).toBeGreaterThan(0);
        expect(token.decimals).toBeLessThanOrEqual(18);
      }
    }
  });

  it('registers no tokens for testnets', () => {
    expect(knownTokens('sepolia')).toEqual([]);
    expect(knownTokens('base-sepolia')).toEqual([]);
  });

  it('marks only USD-pegged tokens as stable', () => {
    for (const tokens of Object.values(KNOWN_TOKENS)) {
      for (const token of tokens) {
        const looksStable = /USD|DAI/i.test(token.symbol);
        expect(token.stable).toBe(looksStable);
      }
    }
  });
});

describe('assessRisk with token holdings', () => {
  it('rates an exposed address with a large stablecoin balance as critical, even with zero native', () => {
    const result = assessRisk(exposure({ exposed: true, nonce: 7 }), 0n, 'ethereum', [
      usdc(25_000_000_000n), // 25,000 USDC
    ]);
    expect(result.level).toBe('critical');
    expect(result.score).toBe(90);
    expect(result.reasons.join(' ')).toContain('25,000 USDC');
  });

  it('rates an exposed address with a small token balance as high', () => {
    const result = assessRisk(exposure({ exposed: true, nonce: 2 }), 0n, 'ethereum', [
      weth(100_000_000_000_000_000n), // 0.1 WETH
    ]);
    expect(result.level).toBe('high');
    expect(result.score).toBe(70);
    expect(result.reasons.join(' ')).toContain('0.1 WETH');
  });

  it('does not escalate on non-stable tokens alone below the native threshold', () => {
    const result = assessRisk(exposure({ exposed: true, nonce: 2 }), 0n, 'ethereum', [
      weth(100_000_000_000_000_000n),
    ]);
    expect(result.level).not.toBe('critical');
  });

  it('keeps a never-used address safe-tier but flags value awaiting first spend', () => {
    const result = assessRisk(exposure({ exposed: false }), 0n, 'ethereum', [usdc(5_000_000n)]);
    expect(result.score).toBe(12);
    expect(result.reasons.join(' ')).toContain('first outgoing transaction can reveal');
  });

  it('drops zero-amount holdings from the assessment', () => {
    const result = assessRisk(exposure({ exposed: true, nonce: 1 }), 0n, 'ethereum', [usdc(0n)]);
    expect(result.tokenHoldings).toEqual([]);
    expect(result.score).toBe(35);
  });

  it('ignores dust balances that would display as zero', () => {
    const result = assessRisk(exposure({ exposed: true, nonce: 1 }), 0n, 'ethereum', [
      weth(10_400n), // ~1e-14 WETH
    ]);
    expect(result.tokenHoldings).toEqual([]);
    expect(result.score).toBe(35);
  });
});

describe('MAINNET_CHAIN_KEYS', () => {
  it('contains exactly the non-testnet chains', () => {
    for (const key of MAINNET_CHAIN_KEYS) {
      expect(CHAINS[key].testnet).toBe(false);
    }
    expect(MAINNET_CHAIN_KEYS).toContain('ethereum');
    expect(MAINNET_CHAIN_KEYS).not.toContain('sepolia');
    expect(MAINNET_CHAIN_KEYS).not.toContain('base-sepolia');
  });
});
