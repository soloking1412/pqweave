import { describe, expect, it } from 'vitest';
import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  buildBitcoinReadinessPlan,
  createBitcoinPlanBundle,
  restoreBitcoinPlanBundle,
  revalidateBitcoinPlan,
} from '../src/bitcoin/kit.js';
import { verifySweepMatchesPlan } from '../src/bitcoin/verify.js';
import { listUtxos, readEsploraBody, validateAddressStats } from '../src/bitcoin/esplora.js';

const pubkey = secp256k1.getPublicKey(new Uint8Array(32).fill(7), true);
const source = btc.p2wpkh(pubkey);
const destination = btc.p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true)).address!;
const fund = new btc.Transaction();
fund.addOutput({ script: source.script, amount: 1_000_000n });
fund.addInput({ txid: new Uint8Array(32), index: 0xffffffff, finalScriptSig: Uint8Array.of(1, 1) });
const input = {
  txid: fund.id,
  vout: 0,
  value: 1_000_000,
  address: source.address!,
  status: { confirmed: true },
  prevTxHex: hex.encode(fund.toBytes(true, false)),
  pubkey,
};
const params = { inputs: [input], destination, feeRates: { economy: 2, standard: 3, priority: 5 } };
const now = new Date('2026-09-25T00:00:00Z');
const bundle = () => createBitcoinPlanBundle(params, now);
const options = (utxos: unknown) => ({
  retries: 0,
  fetchImpl: (async () => Response.json(utxos)) as typeof fetch,
});

describe('strict Bitcoin readiness kit', () => {
  it('restores the exact unsigned transactions and public signing details', () => {
    const restored = restoreBitcoinPlanBundle(JSON.stringify(bundle()));
    expect(restored.plan).toEqual(buildBitcoinReadinessPlan(params));
    expect(restored.inputs[0]!.pubkey).toEqual(pubkey);
  });
  it('snapshots mutable source status and derivation paths', () => {
    const original = { ...input, status: { confirmed: true }, pathComponents: [1, 2] };
    const file = createBitcoinPlanBundle({ ...params, inputs: [original] });
    file.request.inputs[0]!.status.confirmed = false;
    file.request.inputs[0]!.pathComponents![0] = 99;
    expect(original.status.confirmed).toBe(true);
    expect(original.pathComponents).toEqual([1, 2]);
  });
  it('requires full funding data even for native SegWit', () => {
    const { prevTxHex: _, ...without } = input;
    expect(() => buildBitcoinReadinessPlan({ ...params, inputs: [without] })).toThrow(
      /full funding/,
    );
  });
  it('rejects signatures using ANYONECANPAY even when transaction bytes match', () => {
    const plan = buildBitcoinReadinessPlan(params),
      tier = plan.tiers[0]!;
    const tx = btc.Transaction.fromPSBT(base64.decode(tier.psbtBase64));
    tx.updateInput(0, { sighashType: 0x81 });
    tx.sign(new Uint8Array(32).fill(7), [0x81]);
    const check = verifySweepMatchesPlan(base64.encode(tx.toPSBT()), plan, tier);
    expect(check.ok).toBe(false);
    expect(check.mismatches.join(' ')).toMatch(/complete transaction/);
    tx.finalize();
    expect(verifySweepMatchesPlan(base64.encode(tx.toPSBT()), plan, tier).ok).toBe(false);
  });
  it('rejects unconfirmed inputs', () => {
    expect(() =>
      buildBitcoinReadinessPlan({
        ...params,
        inputs: [{ ...input, status: { confirmed: false } }],
      }),
    ).toThrow(/Unconfirmed/);
  });
  it('rejects excessive absolute fees', () => {
    expect(() =>
      buildBitcoinReadinessPlan({
        ...params,
        feeRates: { economy: 1000, standard: 1000, priority: 1000 },
      }),
    ).toThrow(/Fee exceeds/);
  });
  it('rejects excessive proportional fees', () => {
    expect(() =>
      buildBitcoinReadinessPlan({
        ...params,
        feeRates: { economy: 500, standard: 500, priority: 500 },
      }),
    ).toThrow(/Fee exceeds/);
  });
  it('rejects Taproot destinations on the standard kit route', () => {
    expect(() =>
      buildBitcoinReadinessPlan({ ...params, destination: btc.p2tr(pubkey.slice(1)).address! }),
    ).toThrow(/P2WPKH/);
  });
  it('rejects self transfer even with uppercase Bech32', () => {
    expect(() =>
      buildBitcoinReadinessPlan({ ...params, destination: source.address!.toUpperCase() }),
    ).toThrow(/differ/);
  });
  it('bounds batch size before parsing input transactions', () => {
    expect(() => buildBitcoinReadinessPlan({ ...params, inputs: Array(101).fill(input) })).toThrow(
      /100 inputs/,
    );
  });
  it('rejects edited valid destinations using the plan checksum', () => {
    const file = bundle();
    file.request.destination = btc.p2wpkh(
      secp256k1.getPublicKey(new Uint8Array(32).fill(9), true),
    ).address!;
    expect(() => restoreBitcoinPlanBundle(JSON.stringify(file))).toThrow(/checksum/);
  });
  it('rejects funding amount lies and malformed files', () => {
    const file = bundle();
    file.request.inputs[0]!.value++;
    expect(() => restoreBitcoinPlanBundle(JSON.stringify(file))).toThrow();
    expect(() => restoreBitcoinPlanBundle('{}')).toThrow(/malformed/);
    expect(() => restoreBitcoinPlanBundle(' '.repeat(8_000_001))).toThrow(/too large/);
  });
  it('accepts an unchanged confirmed plan', async () => {
    await expect(revalidateBitcoinPlan(bundle(), options([input]), now)).resolves.toHaveProperty(
      'plan',
    );
  });
  it.each([
    ['spent', []],
    ['added', [input, { ...input, vout: 1 }]],
    ['value changed', [{ ...input, value: input.value + 1 }]],
    ['reorged', [{ ...input, status: { confirmed: false } }]],
  ])('rejects a plan whose source was %s', async (_, current) => {
    await expect(revalidateBitcoinPlan(bundle(), options(current), now)).rejects.toThrow(
      /changed|unconfirmed/,
    );
  });
  it('rejects expired and future-dated plans before any network call', async () => {
    const noNetwork = {
      fetchImpl: (async () => {
        throw new Error('unexpected network');
      }) as typeof fetch,
    };
    await expect(
      revalidateBitcoinPlan(bundle(), noNetwork, new Date(now.getTime() + 86_400_001)),
    ).rejects.toThrow(/expired/);
    await expect(
      revalidateBitcoinPlan(bundle(), noNetwork, new Date(now.getTime() - 60_001)),
    ).rejects.toThrow(/future/);
  });
});

describe('bounded and untrusted indexer data', () => {
  it('rejects a missing or malformed statistics response', () => {
    expect(() => validateAddressStats({})).toThrow(/invalid/);
    expect(() =>
      validateAddressStats({
        chain_stats: { funded_txo_sum: -1, spent_txo_sum: 0, spent_txo_count: 0, tx_count: 0 },
      }),
    ).toThrow(/invalid/);
  });
  it('rejects duplicate outpoints and invalid amounts', async () => {
    await expect(listUtxos(source.address!, undefined, options([input, input]))).rejects.toThrow();
    await expect(
      listUtxos(source.address!, undefined, options([{ ...input, value: -1 }])),
    ).rejects.toThrow();
  });
  it('bounds streamed bytes even without a content-length', async () => {
    await expect(readEsploraBody(new Response('123456789'), 8)).rejects.toThrow(/size limit/);
  });
  it('times out a stalled body even when stream cancellation stalls', async () => {
    const stream = new ReadableStream({
      pull: () => new Promise(() => {}),
      cancel: () => new Promise(() => {}),
    });
    await expect(readEsploraBody(new Response(stream), 100, 10)).rejects.toThrow(/timed out/);
  });
});
