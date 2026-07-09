import { describe, expect, it } from 'vitest';
import {
  assessUtxoExposure,
  assessUtxoRisk,
  BITCOIN,
  classifyUtxoAddress,
  type EsploraAddressStats,
  LITECOIN,
  scanUtxoAddress,
} from '../src/bitcoin/index.js';

function stats(partial: Partial<EsploraAddressStats['chain_stats']>): EsploraAddressStats {
  return {
    chain_stats: {
      funded_txo_sum: 0,
      spent_txo_sum: 0,
      spent_txo_count: 0,
      tx_count: 0,
      ...partial,
    },
  };
}

describe('classifyUtxoAddress', () => {
  it('classifies Bitcoin address types', () => {
    expect(classifyUtxoAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', BITCOIN)).toBe('p2pkh');
    expect(classifyUtxoAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', BITCOIN)).toBe('p2sh');
    expect(classifyUtxoAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BITCOIN)).toBe(
      'p2wpkh',
    );
    expect(
      classifyUtxoAddress(
        'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
        BITCOIN,
      ),
    ).toBe('p2tr');
    expect(classifyUtxoAddress('not-an-address', BITCOIN)).toBe('unknown');
  });

  it('classifies Litecoin address types', () => {
    expect(classifyUtxoAddress('LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL', LITECOIN)).toBe('p2pkh');
    expect(classifyUtxoAddress('ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4ny', LITECOIN)).toBe(
      'p2wpkh',
    );
    // A Litecoin address is not a valid Bitcoin address.
    expect(classifyUtxoAddress('LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL', BITCOIN)).toBe('unknown');
  });
});

describe('assessUtxoExposure', () => {
  it('flags a spent-from address as exposed', () => {
    const result = assessUtxoExposure(
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      BITCOIN,
      stats({
        spent_txo_count: 3,
        tx_count: 5,
        funded_txo_sum: 200_000_000,
        spent_txo_sum: 50_000_000,
      }),
    );
    expect(result.exposed).toBe(true);
    expect(result.hasSpent).toBe(true);
    expect(result.balanceSats).toBe(150_000_000n);
    expect(result.network).toBe('bitcoin');
  });

  it('treats an unspent hash-based address as not exposed', () => {
    const result = assessUtxoExposure(
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      BITCOIN,
      stats({ funded_txo_sum: 100_000_000, tx_count: 1 }),
    );
    expect(result.exposed).toBe(false);
  });

  it('treats Taproot as exposed even when never spent', () => {
    const result = assessUtxoExposure(
      'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
      BITCOIN,
      stats({ funded_txo_sum: 100_000_000, tx_count: 1 }),
    );
    expect(result.exposed).toBe(true);
    expect(result.type).toBe('p2tr');
  });
});

describe('assessUtxoRisk', () => {
  it('rates an exposed, well-funded address as critical', () => {
    const result = assessUtxoRisk(
      assessUtxoExposure(
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        BITCOIN,
        stats({ spent_txo_count: 1, funded_txo_sum: 500_000_000, spent_txo_sum: 0 }),
      ),
      'BTC',
    );
    expect(result.level).toBe('critical');
    expect(result.balance).toBe('5');
    expect(result.symbol).toBe('BTC');
    expect(result.reasons.join(' ')).toContain('transitional, not quantum-safe');
  });

  it('warns a funded Taproot address away from fresh Taproot addresses', () => {
    const result = assessUtxoRisk(
      assessUtxoExposure(
        'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5ck7d3k',
        BITCOIN,
        stats({ funded_txo_sum: 200_000_000 }),
      ),
      'BTC',
    );
    expect(result.type).toBe('p2tr');
    expect(result.exposed).toBe(true);
    const text = result.reasons.join(' ');
    expect(text).toContain('hash-based address type');
    expect(text).toContain('re-expose');
  });

  it('rates an unspent funded address as safe', () => {
    const result = assessUtxoRisk(
      assessUtxoExposure(
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        BITCOIN,
        stats({ funded_txo_sum: 100_000_000 }),
      ),
      'BTC',
    );
    expect(result.level).toBe('safe');
  });
});

describe('scanUtxoAddress', () => {
  it('scans Litecoin via an Esplora-compatible API', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => stats({ spent_txo_count: 2, funded_txo_sum: 50_000_000, spent_txo_sum: 0 }),
    })) as unknown as typeof fetch;

    const result = await scanUtxoAddress('LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL', LITECOIN, {
      fetchImpl,
    });
    expect(result.exposed).toBe(true);
    expect(result.symbol).toBe('LTC');
    expect(result.level).toBe('high'); // 0.5 LTC exposed
  });

  it('rejects an unrecognized address', async () => {
    await expect(scanUtxoAddress('nonsense', BITCOIN)).rejects.toThrow();
  });
});
