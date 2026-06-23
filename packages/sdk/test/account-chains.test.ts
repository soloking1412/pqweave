import { describe, expect, it } from 'vitest';
import {
  assessCosmosRisk,
  COSMOS_HUB,
  isCosmosAddress,
  scanCosmosAddress,
} from '../src/cosmos/index.js';
import { assessXrpRisk, isXrpAddress, scanXrpAddress } from '../src/xrp/index.js';

const COSMOS_ADDR = 'cosmos1qy352eufqy352eufqy352eufqy35qqqstvcgnz';
const XRP_ADDR = 'rPdvC6ccq8hCdPKSPJkPmyZ4Mi1oG2FFkT';

describe('Cosmos scanner', () => {
  it('validates addresses', () => {
    expect(isCosmosAddress(COSMOS_ADDR)).toBe(true);
    expect(isCosmosAddress('0xabc')).toBe(false);
    expect(isCosmosAddress('osmo1abc', 'cosmos')).toBe(false);
  });

  it('marks an account with a stored public key as exposed', () => {
    const result = assessCosmosRisk(COSMOS_ADDR, COSMOS_HUB, true, 5_000_000n); // 5 ATOM
    expect(result.exposed).toBe(true);
    expect(result.symbol).toBe('ATOM');
    expect(result.balance).toBe('5');
    expect(result.level).toBe('high');
  });

  it('treats an account that never signed as not exposed', () => {
    expect(assessCosmosRisk(COSMOS_ADDR, COSMOS_HUB, false, 5_000_000n).level).toBe('safe');
  });

  it('scans via the LCD auth + bank endpoints', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('/auth/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ account: { pub_key: { key: 'A...' } } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ balances: [{ denom: 'uatom', amount: '2000000' }] }),
      };
    }) as unknown as typeof fetch;

    const result = await scanCosmosAddress(COSMOS_ADDR, { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('2');
  });
});

describe('XRP scanner', () => {
  it('validates addresses', () => {
    expect(isXrpAddress(XRP_ADDR)).toBe(true);
    expect(isXrpAddress('0xabc')).toBe(false);
    expect(isXrpAddress('bc1qxyz')).toBe(false);
  });

  it('scores an exposed account by balance', () => {
    expect(assessXrpRisk(XRP_ADDR, true, 50_000_000n).level).toBe('high'); // 50 XRP
    expect(assessXrpRisk(XRP_ADDR, false, 50_000_000n).level).toBe('safe');
    expect(assessXrpRisk(XRP_ADDR, true, 50_000_000n).balance).toBe('50');
  });

  it('detects exposure from a sent transaction', async () => {
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const method = JSON.parse(init.body).method as string;
      if (method === 'account_info') {
        return {
          ok: true,
          json: async () => ({ result: { account_data: { Balance: '25000000' } } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ result: { transactions: [{ tx: { Account: XRP_ADDR } }] } }),
      };
    }) as unknown as typeof fetch;

    const result = await scanXrpAddress(XRP_ADDR, { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('25');
  });

  it('treats an unfunded account as not exposed', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ result: { error: 'actNotFound' } }),
    })) as unknown as typeof fetch;

    const result = await scanXrpAddress(XRP_ADDR, { fetchImpl });
    expect(result.exposed).toBe(false);
    expect(result.balance).toBe('0');
  });
});
