import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';
import {
  checkDestination,
  assertSafeDestination,
  UnsafeDestinationError,
} from '../src/bitcoin/safety.js';
import { describePsbt, verifySweepMatchesPlan } from '../src/bitcoin/verify.js';
import { buildEvacuationPsbts, type EvacuationInput } from '../src/bitcoin/evacuation.js';
import { parseDerivationPath } from '../src/bitcoin/hd.js';

const FRESH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const USED = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const TAPROOT = 'bc1pr896td3mmjl5vc57mutumgfmeet8hyzy9w6zr6hg5vhrtppevlpsp3x3nm';

/** Esplora stub: `txCount` per address. */
function stubFetch(txCounts: Record<string, number>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const href = typeof url === 'string' ? url : url.toString();
    const address = href.split('/address/')[1]?.split('/')[0] ?? '';
    const tx_count = txCounts[address] ?? 0;
    return new Response(
      JSON.stringify({
        chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, spent_txo_count: 0, tx_count },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, spent_txo_count: 0, tx_count: 0 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

describe('destination safety rails', () => {
  it('accepts a fresh, never-used destination', async () => {
    const check = await checkDestination(FRESH, undefined, { fetchImpl: stubFetch({}) });
    expect(check.verdict).toBe('safe');
    expect(check.problems).toHaveLength(0);
    expect(check.txCount).toBe(0);
  });

  it('refuses a destination that has already been used', async () => {
    const check = await checkDestination(FRESH, undefined, {
      fetchImpl: stubFetch({ [FRESH]: 4 }),
    });
    expect(check.verdict).toBe('unsafe');
    expect(check.problems.join(' ')).toMatch(/already been used/i);
    await expect(
      assertSafeDestination(FRESH, undefined, { fetchImpl: stubFetch({ [FRESH]: 4 }) }),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
  });

  it('refuses a destination with an unconfirmed transaction', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, spent_txo_count: 0, tx_count: 0 },
          mempool_stats: {
            funded_txo_sum: 10_000,
            spent_txo_sum: 0,
            spent_txo_count: 0,
            tx_count: 1,
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const check = await checkDestination(FRESH, undefined, { fetchImpl });
    expect(check.verdict).toBe('unsafe');
  });

  it('refuses sweeping to one of the source addresses', async () => {
    const check = await checkDestination(FRESH, undefined, {
      fetchImpl: stubFetch({}),
      sourceAddresses: [USED, FRESH],
    });
    expect(check.verdict).toBe('unsafe');
    expect(check.problems.join(' ')).toMatch(/sweeping from/i);
  });

  it('warns on a Taproot destination but does not block it', async () => {
    const check = await checkDestination(TAPROOT, undefined, { fetchImpl: stubFetch({}) });
    expect(check.verdict).toBe('warn');
    expect(check.warnings.join(' ')).toMatch(/public key in the output/i);
  });

  it('refuses an unrecognized address', async () => {
    const check = await checkDestination('not-an-address', undefined, { fetchImpl: stubFetch({}) });
    expect(check.verdict).toBe('unsafe');
  });

  it('degrades to a warning when the indexer is unreachable', async () => {
    const failing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const check = await checkDestination(FRESH, undefined, { fetchImpl: failing, retries: 0 });
    // An outage must not block an emergency evacuation.
    expect(check.verdict).toBe('warn');
    expect(check.warnings.join(' ')).toMatch(/could not confirm/i);
  });
});

describe('PSBT dry run', () => {
  const priv = (() => {
    const k = new Uint8Array(32).fill(0);
    k[31] = 9;
    return k;
  })();
  const pubkey = secp256k1.getPublicKey(priv, true);
  const payment = btc.p2wpkh(pubkey, btc.NETWORK);

  function plan() {
    const fund = new btc.Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
    fund.addOutput({ script: payment.script, amount: 500_000n });
    fund.addInput({
      txid: new Uint8Array(32),
      index: 0xffffffff,
      finalScriptSig: Uint8Array.of(1, 1),
      sequence: 0xffffffff,
    });
    const input: EvacuationInput = {
      txid: fund.id,
      vout: 0,
      value: 500_000,
      status: { confirmed: true },
      address: payment.address!,
      pubkey,
      prevTxHex: hex.encode(fund.toBytes(true, false)),
      pathComponents: [...parseDerivationPath("m/84'/0'/0'"), 0, 0],
      masterFingerprint: '73c5da0a',
    };
    return buildEvacuationPsbts({
      inputs: [input],
      destination: FRESH,
      feeRates: { economy: 2, standard: 10, priority: 40 },
    });
  }

  it('describes what the transaction actually does', () => {
    const p = plan();
    const tier = p.tiers.find((t) => t.label === 'standard')!;
    const d = describePsbt(tier.psbtBase64);

    expect(d.inputCount).toBe(1);
    expect(d.outputCount).toBe(1);
    expect(d.isSweep).toBe(true);
    expect(d.replaceable).toBe(true);
    expect(d.hardwareReady).toBe(true);
    expect(d.totalInputSats).toBe(500_000n);
    expect(d.outputs[0]!.address).toBe(FRESH);
    expect(d.outputs[0]!.amountSats).toBe(tier.outputSats);
    expect(d.feeSats).toBe(tier.feeSats);
    expect(d.notes).toHaveLength(0);
  });

  it('confirms a PSBT matches the tier it claims to be', () => {
    const p = plan();
    const tier = p.tiers.find((t) => t.label === 'priority')!;
    const match = verifySweepMatchesPlan(tier.psbtBase64, p, tier);
    expect(match.ok).toBe(true);
    expect(match.mismatches).toHaveLength(0);
  });

  it('catches a PSBT presented as the wrong tier', () => {
    const p = plan();
    const economy = p.tiers.find((t) => t.label === 'economy')!;
    const priority = p.tiers.find((t) => t.label === 'priority')!;
    // Economy bytes, but claimed to be the priority tier.
    const match = verifySweepMatchesPlan(economy.psbtBase64, p, priority);
    expect(match.ok).toBe(false);
    expect(match.mismatches.join(' ')).toMatch(/output is|fee is/);
  });

  it('rejects a signed-bundle substitute that spends a different outpoint', () => {
    const p = plan();
    const tier = p.tiers[0]!;
    const original = btc.Transaction.fromPSBT(base64.decode(tier.psbtBase64));
    const replacement = new btc.Transaction();
    replacement.addInput({
      txid: new Uint8Array(32).fill(7),
      index: original.getInput(0).index!,
      witnessUtxo: original.getInput(0).witnessUtxo!,
      sequence: original.getInput(0).sequence,
    });
    replacement.addOutput({
      script: original.getOutput(0).script!,
      amount: original.getOutput(0).amount!,
    });
    const match = verifySweepMatchesPlan(base64.encode(replacement.toPSBT()), p, tier);
    expect(match.ok).toBe(false);
    expect(match.mismatches.join(' ')).toMatch(/inputs.*differ/);
  });

  it('flags a transaction that is not a clean sweep', () => {
    const tx = new btc.Transaction();
    tx.addInput({
      txid: new Uint8Array(32).fill(3),
      index: 0,
      witnessUtxo: { script: payment.script, amount: 100_000n },
      sequence: 0xffffffff, // no RBF
    });
    tx.addOutputAddress(FRESH, 40_000n, btc.NETWORK);
    tx.addOutputAddress(USED, 40_000n, btc.NETWORK); // change → not a sweep
    const d = describePsbt(base64.encode(tx.toPSBT()));

    expect(d.isSweep).toBe(false);
    expect(d.replaceable).toBe(false);
    expect(d.notes.join(' ')).toMatch(/not replaceable/i);
    expect(d.notes.join(' ')).toMatch(/not a clean sweep/i);
  });
});
