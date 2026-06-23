import { describe, expect, it } from 'vitest';
import { assessAptosRisk, isAptosAddress, scanAptosAddress } from '../src/aptos/index.js';
import { migrationCapability } from '../src/migration/index.js';
import { assessNearRisk, isNearAddress, scanNearAddress } from '../src/near/index.js';

describe('NEAR scanner', () => {
  it('validates account ids', () => {
    expect(isNearAddress('alice.near')).toBe(true);
    expect(isNearAddress('token.sweat')).toBe(true);
    expect(isNearAddress('UPPER.near')).toBe(false);
  });

  it('marks an existing account as exposed', () => {
    expect(assessNearRisk('a.near', true, 5n * 10n ** 24n).exposed).toBe(true);
    expect(assessNearRisk('a.near', true, 5n * 10n ** 24n).balance).toBe('5');
    expect(assessNearRisk('a.near', false, 0n).exposed).toBe(false);
  });

  it('scans via view_account', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ result: { amount: (2n * 10n ** 24n).toString() } }),
    })) as unknown as typeof fetch;
    const result = await scanNearAddress('a.near', { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('2');
  });
});

describe('Aptos scanner', () => {
  it('validates 0x addresses', () => {
    expect(isAptosAddress('0x1')).toBe(true);
    expect(isAptosAddress('alice')).toBe(false);
  });

  it('uses the sequence number as the exposure signal', () => {
    expect(assessAptosRisk('0x1', true, 500_000_000n).level).toBe('high'); // 5 APT, exposed
    expect(assessAptosRisk('0x1', false, 500_000_000n).level).toBe('safe');
  });

  it('scans account sequence number and coin store', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/v1/accounts/0x1')) {
        return { ok: true, status: 200, json: async () => ({ sequence_number: '7' }) };
      }
      return { ok: true, status: 200, json: async () => ['300000000'] }; // /v1/view → 3 APT
    }) as unknown as typeof fetch;

    const result = await scanAptosAddress('0x1', { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('3');
  });
});

describe('migrationCapability', () => {
  it('reports quantum-safe only for EVM', () => {
    expect(migrationCapability('evm').level).toBe('quantum-safe');
    expect(migrationCapability('utxo').level).toBe('transitional');
    expect(migrationCapability('account-first-spend').level).toBe('transitional');
    expect(migrationCapability('address-is-key').level).toBe('none');
  });
});
