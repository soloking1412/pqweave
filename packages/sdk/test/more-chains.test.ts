import { describe, expect, it } from 'vitest';
import {
  assessAlgorandRisk,
  isAlgorandAddress,
  scanAlgorandAddress,
} from '../src/algorand/index.js';
import { assessCardanoRisk, isCardanoAddress, scanCardanoAddress } from '../src/cardano/index.js';
import { assessStellarRisk, isStellarAddress, scanStellarAddress } from '../src/stellar/index.js';

const ALGO = '737777777777777777777777777777777777777777777777777UFEJ2CI';
const STELLAR = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
const CARDANO =
  'addr1qxt208dm7m6zn4u2ljhs6ehwu7sglp57rtr9gylxauw49s07arfgvxt6gm3yaj7w37mjl4lxgl9xzfx563r2jlejkznsk49rh5';

describe('Algorand scanner', () => {
  it('validates 58-char addresses', () => {
    expect(isAlgorandAddress(ALGO)).toBe(true);
    expect(isAlgorandAddress('0xabc')).toBe(false);
  });

  it('is always exposed and scores by balance', () => {
    expect(assessAlgorandRisk(ALGO, 0n).exposed).toBe(true);
    expect(assessAlgorandRisk(ALGO, 5_000_000n).level).toBe('high'); // 5 ALGO
    expect(assessAlgorandRisk(ALGO, 5_000_000n).balance).toBe('5');
  });

  it('scans via the algod REST API', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ amount: 2_000_000 }),
    })) as unknown as typeof fetch;
    const result = await scanAlgorandAddress(ALGO, { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('2');
  });
});

describe('Stellar scanner', () => {
  it('validates G… addresses', () => {
    expect(isStellarAddress(STELLAR)).toBe(true);
    expect(isStellarAddress('rabc')).toBe(false);
  });

  it('scans the native balance via Horizon', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ balances: [{ asset_type: 'native', balance: '12.5000000' }] }),
    })) as unknown as typeof fetch;
    const result = await scanStellarAddress(STELLAR, { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('12.5');
  });

  it('treats an unfunded account as zero balance', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    expect((await scanStellarAddress(STELLAR, { fetchImpl })).balance).toBe('0');
  });
});

describe('Cardano scanner', () => {
  it('validates addr1 addresses', () => {
    expect(isCardanoAddress(CARDANO)).toBe(true);
    expect(isCardanoAddress('0xabc')).toBe(false);
  });

  it('marks an address that was a transaction input as exposed', () => {
    expect(assessCardanoRisk(CARDANO, true, 5_000_000n).level).toBe('high');
    expect(assessCardanoRisk(CARDANO, false, 5_000_000n).level).toBe('safe');
  });

  it('detects exposure when the address appears in a tx input', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('/address_info')) {
        return { ok: true, json: async () => [{ balance: '3000000' }] };
      }
      if (url.includes('/address_txs')) {
        return { ok: true, json: async () => [{ tx_hash: 'abc' }] };
      }
      return { ok: true, json: async () => [{ inputs: [{ payment_addr: { bech32: CARDANO } }] }] };
    }) as unknown as typeof fetch;

    const result = await scanCardanoAddress(CARDANO, { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('3');
  });

  it('treats a never-used address as not exposed', async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
    expect((await scanCardanoAddress(CARDANO, { fetchImpl })).exposed).toBe(false);
  });
});
