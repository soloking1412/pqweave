import { describe, expect, it } from 'vitest';
import { assessSolanaRisk, isSolanaAddress, scanSolanaAddress } from '../src/solana/index.js';

const ADDRESS = 'So11111111111111111111111111111111111111112';

describe('isSolanaAddress', () => {
  it('accepts base58 addresses and rejects others', () => {
    expect(isSolanaAddress(ADDRESS)).toBe(true);
    expect(isSolanaAddress('0xabc')).toBe(false);
    expect(isSolanaAddress('not valid!')).toBe(false);
  });
});

describe('assessSolanaRisk', () => {
  it('always reports the address as exposed', () => {
    expect(assessSolanaRisk(ADDRESS, 0n).exposed).toBe(true);
  });

  it('scores by balance', () => {
    expect(assessSolanaRisk(ADDRESS, 0n).level).toBe('low');
    expect(assessSolanaRisk(ADDRESS, 5_000_000_000n).level).toBe('high'); // 5 SOL
    expect(assessSolanaRisk(ADDRESS, 200_000_000_000n).level).toBe('critical'); // 200 SOL
    expect(assessSolanaRisk(ADDRESS, 1_500_000_000n).balanceSol).toBe('1.5');
  });
});

describe('scanSolanaAddress', () => {
  it('scans via JSON-RPC getBalance', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ result: { value: 2_000_000_000 } }),
    })) as unknown as typeof fetch;

    const result = await scanSolanaAddress(ADDRESS, { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balanceSol).toBe('2');
    expect(result.level).toBe('high');
  });

  it('rejects an invalid address', async () => {
    await expect(scanSolanaAddress('nope!')).rejects.toThrow();
  });
});
