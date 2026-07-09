import { describe, expect, it } from 'vitest';
import { assessTronRisk, isTronAddress } from '../src/tron/index.js';
import { assessSuiRisk, isSuiAddress } from '../src/sui/index.js';
import { assessTonRisk, isTonAddress } from '../src/ton/index.js';
import { assessPolkadotRisk, isPolkadotAddress } from '../src/polkadot/index.js';
import { assessDogecoinRisk, isDogecoinAddress } from '../src/dogecoin/index.js';

describe('address validation', () => {
  it('accepts valid Tron addresses and rejects others', () => {
    expect(isTronAddress('TJRabPrwbZy45sbavfcjinPJC18kjpRTv8')).toBe(true);
    expect(isTronAddress('0x396343362be2a4da1ce0c1c210945346fb82aa49')).toBe(false);
    expect(isTronAddress('not-an-address')).toBe(false);
  });

  it('accepts valid Sui addresses and rejects others', () => {
    expect(isSuiAddress('0x0000000000000000000000000000000000000000000000000000000000000005')).toBe(
      true,
    );
    expect(isSuiAddress('0x1234')).toBe(false);
    expect(isSuiAddress('TJRabPrwbZy45sbavfcjinPJC18kjpRTv8')).toBe(false);
  });

  it('accepts valid TON addresses (friendly and raw) and rejects others', () => {
    expect(isTonAddress('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')).toBe(true);
    expect(isTonAddress(`EQ${'A'.repeat(46)}`)).toBe(true); // 48-char friendly form
    expect(isTonAddress(`0:${'a'.repeat(64)}`)).toBe(true); // raw workchain:hex form
    expect(isTonAddress('too-short')).toBe(false);
  });

  it('accepts valid Polkadot addresses and rejects others', () => {
    expect(isPolkadotAddress('12xtAYsRUrmbniiWQqJtECiBQrMn8AypQcXhnQAc6RB6XkLW')).toBe(true);
    expect(isPolkadotAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false); // BTC, too short
    expect(isPolkadotAddress('0xdead')).toBe(false);
  });

  it('accepts valid Dogecoin addresses and rejects others', () => {
    expect(isDogecoinAddress('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L')).toBe(true);
    expect(isDogecoinAddress('A'.padEnd(34, '1'))).toBe(true); // P2SH prefix
    expect(isDogecoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false); // BTC prefix
  });
});

describe('risk scoring', () => {
  it('Tron: exposed + large balance is critical', () => {
    const r = assessTronRisk('T'.padEnd(34, '1'), true, 60_000n * 1_000_000n);
    expect(r.level).toBe('critical');
    expect(r.exposed).toBe(true);
  });

  it('Sui: unexposed with balance is safe', () => {
    const r = assessSuiRisk('0x' + '0'.repeat(64), false, 5_000_000_000n);
    expect(r.exposed).toBe(false);
    expect(r.level).toBe('safe');
  });

  it('TON: active wallet with large balance is critical', () => {
    const r = assessTonRisk('E'.padEnd(48, 'Q'), true, 2_000n * 1_000_000_000n);
    expect(r.level).toBe('critical');
  });

  it('Polkadot: always exposed (address-is-key), even with unknown balance', () => {
    const r = assessPolkadotRisk('1'.padEnd(48, 'x'), null);
    expect(r.exposed).toBe(true);
    expect(r.balance).toBe('—');
  });

  it('Dogecoin: unspent address is not yet exposed', () => {
    const r = assessDogecoinRisk('D'.padEnd(34, '1'), false, 1_000n * 100_000_000n);
    expect(r.exposed).toBe(false);
    expect(r.level).toBe('safe');
    const spent = assessDogecoinRisk('D'.padEnd(34, '1'), true, 200_000n * 100_000_000n);
    expect(spent.level).toBe('critical');
  });
});
