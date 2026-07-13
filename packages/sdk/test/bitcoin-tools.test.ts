import * as btc from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';
import {
  buildEvacuationPsbts,
  estimateSweepVsize,
  finalizeSweep,
  type EvacuationInput,
} from '../src/bitcoin/evacuation.js';
import { feeTiers } from '../src/bitcoin/esplora.js';
import { deriveAddresses, isExtendedKey, parseExtendedKey } from '../src/bitcoin/hd.js';

// Canonical BIP-84 test vector (mnemonic "abandon abandon … about").
const BIP84_ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

describe('xpub derivation (BIP-84 vector)', () => {
  it('recognizes extended keys', () => {
    expect(isExtendedKey(BIP84_ZPUB)).toBe(true);
    expect(isExtendedKey('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe(false);
  });

  it('derives the published native-segwit addresses', () => {
    const parsed = parseExtendedKey(BIP84_ZPUB);
    expect(parsed.scriptType).toBe('p2wpkh');
    expect(parsed.testnet).toBe(false);

    const addrs = deriveAddresses(parsed, { maxPerChain: 2 });
    const receive = addrs.filter((a) => a.chain === 'receive').map((a) => a.address);
    const change = addrs.filter((a) => a.chain === 'change').map((a) => a.address);

    expect(receive[0]).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(receive[1]).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(change[0]).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });

  it('rejects a non-extended-key string', () => {
    expect(() => parseExtendedKey('not-a-key')).toThrow();
  });
});

describe('fee tiers', () => {
  it('collapses Esplora estimates into three tiers with floors', () => {
    const tiers = feeTiers({ '1': 50, '6': 12, '144': 3 });
    expect(tiers.priority).toBe(50);
    expect(tiers.standard).toBe(12);
    expect(tiers.economy).toBe(3);
  });

  it('applies floors when the mempool is quiet', () => {
    const tiers = feeTiers({});
    expect(tiers.economy).toBeGreaterThanOrEqual(1);
    expect(tiers.priority).toBeGreaterThanOrEqual(2);
  });
});

describe('evacuation sweep', () => {
  const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
  const utxo = (value: number): EvacuationInput => ({
    txid: '11'.repeat(32),
    vout: 0,
    value,
    status: { confirmed: true },
    address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // p2wpkh
  });

  it('estimates vsize for a single p2wpkh sweep', () => {
    // 11 overhead + 68 input + 31 output = 110
    expect(estimateSweepVsize(['p2wpkh'])).toBe(110);
  });

  it('builds one RBF PSBT per viable tier and subtracts fee correctly', () => {
    const plan = buildEvacuationPsbts({
      inputs: [utxo(100_000)],
      destination: DEST,
      feeRates: { economy: 1, standard: 10, priority: 50 },
    });
    expect(plan.tiers).toHaveLength(3);
    const priority = plan.tiers.find((t) => t.label === 'priority')!;
    // vsize 110 * 50 = 5500 sat fee
    expect(priority.feeSats).toBe(5_500n);
    expect(priority.outputSats).toBe(94_500n);

    // Every PSBT decodes and carries one input, one output, RBF sequence.
    for (const tier of plan.tiers) {
      const tx = btc.Transaction.fromPSBT(base64Decode(tier.psbtBase64));
      expect(tx.inputsLength).toBe(1);
      expect(tx.outputsLength).toBe(1);
      expect(tx.getInput(0).sequence).toBe(0xfffffffd);
    }
  });

  it('skips a tier whose fee would leave dust and throws when nothing is viable', () => {
    const plan = buildEvacuationPsbts({
      inputs: [utxo(6_000)],
      destination: DEST,
      feeRates: { economy: 1, standard: 10, priority: 50 },
    });
    // priority: 110*50 = 5500 fee -> 500 sat output < 546 dust -> skipped
    expect(plan.skipped.some((s) => s.label === 'priority')).toBe(true);
    expect(plan.tiers.some((t) => t.label === 'economy')).toBe(true);

    expect(() =>
      buildEvacuationPsbts({
        inputs: [utxo(600)],
        destination: DEST,
        feeRates: { economy: 100, standard: 200, priority: 300 },
      }),
    ).toThrow(/too small/);
  });

  it('rejects an unrecognized destination', () => {
    expect(() =>
      buildEvacuationPsbts({
        inputs: [utxo(100_000)],
        destination: 'not-an-address',
        feeRates: { economy: 1, standard: 10, priority: 50 },
      }),
    ).toThrow();
  });

  it('signs and finalizes a sweep round-trip', () => {
    // A key we control, to prove finalizeSweep produces a valid raw tx.
    const priv = new Uint8Array(32).fill(0);
    priv[31] = 1;
    const pubkey = secp256k1.getPublicKey(priv, true);
    const source = btc.p2wpkh(pubkey, btc.NETWORK);

    const input: EvacuationInput = {
      txid: '22'.repeat(32),
      vout: 1,
      value: 200_000,
      status: { confirmed: true },
      address: source.address!,
    };
    const plan = buildEvacuationPsbts({
      inputs: [input],
      destination: DEST,
      feeRates: { economy: 5, standard: 5, priority: 5 },
    });
    const tier = plan.tiers[0]!;

    const tx = btc.Transaction.fromPSBT(base64Decode(tier.psbtBase64));
    tx.sign(priv);
    const signedB64 = base64Encode(tx.toPSBT());
    const { txid, hex: rawHex } = finalizeSweep(signedB64);
    expect(txid).toMatch(/^[0-9a-f]{64}$/);
    expect(rawHex.length).toBeGreaterThan(20);
  });
});

// Small base64 helpers to avoid a direct @scure/base import in the test.
function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function base64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
