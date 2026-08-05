import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildEvacuationPsbts,
  InconsistentUtxoError,
  type EvacuationInput,
} from '../src/bitcoin/evacuation.js';

/**
 * The Esplora indexer is untrusted for correctness.
 *
 * It supplies UTXO amounts, previous transactions and address stats, and we
 * turn those into something a hardware wallet signs. If a hostile or simply
 * buggy indexer can put a previous transaction into a PSBT that does not match
 * the outpoint, it decides what the signing device believes the input is worth,
 * and the gap between the believed amount and the real one is paid to the
 * miner. That is the attack that forced wallets to require full previous
 * transactions in the first place (CVE-2020-14199).
 *
 * These tests are the adversary. Every one of them asserts that we refuse to
 * build, rather than producing a plausible-looking bundle that loses money.
 */

const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const FEES = { economy: 1, standard: 3, priority: 6 };

const priv = (() => {
  const k = new Uint8Array(32).fill(0);
  k[31] = 9;
  return k;
})();
const pubkey = secp256k1.getPublicKey(priv, true);

const otherPriv = (() => {
  const k = new Uint8Array(32).fill(0);
  k[31] = 11;
  return k;
})();
const otherPubkey = secp256k1.getPublicKey(otherPriv, true);

/** A funding transaction paying `value` to `script`. */
function fundingTx(script: Uint8Array, value: number, salt = 1): btc.Transaction {
  const tx = new btc.Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  tx.addOutput({ script, amount: BigInt(value) });
  tx.addInput({
    txid: new Uint8Array(32).fill(salt & 0xff),
    index: 0xffffffff,
    finalScriptSig: Uint8Array.of(1, 1),
    sequence: 0xffffffff,
  });
  return tx;
}

/** An honest, fully consistent input. Each test corrupts one fact about it. */
function honestInput(value = 200_000): EvacuationInput {
  const payment = btc.p2wpkh(pubkey, btc.NETWORK);
  const fund = fundingTx(payment.script, value);
  return {
    txid: fund.id,
    vout: 0,
    value,
    status: { confirmed: true },
    address: payment.address!,
    pubkey,
    prevTxHex: hex.encode(fund.toBytes(true, false)),
  };
}

const build = (inputs: EvacuationInput[]) =>
  buildEvacuationPsbts({ inputs, destination: DEST, feeRates: FEES });

describe('the honest case still works', () => {
  it('builds when every fact agrees', () => {
    const plan = build([honestInput()]);
    expect(plan.tiers.length).toBe(3);
    expect(plan.totalInputSats).toBe(200_000n);
  });
});

describe('a lying indexer cannot inflate or deflate the amount', () => {
  it('rejects an inflated UTXO value', () => {
    const utxo = honestInput(200_000);
    // The previous transaction pays 200,000; the indexer claims 5,000,000.
    utxo.value = 5_000_000;
    expect(() => build([utxo])).toThrow(InconsistentUtxoError);
    expect(() => build([utxo])).toThrow(/pays 200000 sats/);
  });

  it('rejects a deflated UTXO value', () => {
    const utxo = honestInput(200_000);
    utxo.value = 1_000;
    expect(() => build([utxo])).toThrow(InconsistentUtxoError);
  });

  it('rejects any perturbation of the amount, in either direction', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10_000, max: 5_000_000 }),
        fc.integer({ min: -9_999, max: 9_999 }),
        (real, delta) => {
          fc.pre(delta !== 0);
          fc.pre(real + delta > 546);
          const utxo = honestInput(real);
          utxo.value = real + delta;
          expect(() => build([utxo])).toThrow(InconsistentUtxoError);
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('a lying indexer cannot substitute the previous transaction', () => {
  it('rejects a previous transaction for a different outpoint', () => {
    const utxo = honestInput();
    // A real, well-formed transaction — just not the one being spent.
    const decoy = fundingTx(btc.p2wpkh(pubkey, btc.NETWORK).script, 200_000, 42);
    utxo.prevTxHex = hex.encode(decoy.toBytes(true, false));
    expect(() => build([utxo])).toThrow(InconsistentUtxoError);
    expect(() => build([utxo])).toThrow(/hashes to/);
  });

  it('rejects a vout that does not exist in the previous transaction', () => {
    const utxo = honestInput();
    utxo.vout = 7;
    expect(() => build([utxo])).toThrow(InconsistentUtxoError);
    expect(() => build([utxo])).toThrow(/does not exist/);
  });

  it('rejects a previous transaction paying a different script', () => {
    // Same amount, same position — but the coins went to someone else.
    const theirs = btc.p2wpkh(otherPubkey, btc.NETWORK);
    const fund = fundingTx(theirs.script, 200_000);
    const mine = btc.p2wpkh(pubkey, btc.NETWORK);
    expect(() =>
      build([
        {
          txid: fund.id,
          vout: 0,
          value: 200_000,
          status: { confirmed: true },
          address: mine.address!,
          pubkey,
          prevTxHex: hex.encode(fund.toBytes(true, false)),
        },
      ]),
    ).toThrow(/different script/);
  });

  it('rejects an unparseable previous transaction rather than ignoring it', () => {
    const utxo = honestInput();
    utxo.prevTxHex = 'deadbeef';
    expect(() => build([utxo])).toThrow(InconsistentUtxoError);
    expect(() => build([utxo])).toThrow(/could not be parsed/);
  });
});

describe('a wrong public key cannot reach the PSBT', () => {
  it('rejects a key that does not derive the address', () => {
    const utxo = honestInput();
    utxo.pubkey = otherPubkey;
    expect(() => build([utxo])).toThrow(InconsistentUtxoError);
    expect(() => build([utxo])).toThrow(/derives .*, not this one/i);
  });

  it('rejects a P2SH address that is not P2SH-P2WPKH', () => {
    // A 2-of-2 multisig wrapped in P2SH classifies as `p2sh`, and without this
    // check it would be handed a single-sig redeem script and a single-sig fee
    // estimate — an unsignable PSBT that also underpays.
    const multisig = btc.p2sh(btc.p2ms(2, [pubkey, otherPubkey]), btc.NETWORK);
    const fund = fundingTx(multisig.script, 300_000);
    expect(() =>
      build([
        {
          txid: fund.id,
          vout: 0,
          value: 300_000,
          status: { confirmed: true },
          address: multisig.address!,
          pubkey,
          prevTxHex: hex.encode(fund.toBytes(true, false)),
        },
      ]),
    ).toThrow(InconsistentUtxoError);
  });

  it('rejects a Taproot input whose internal key is wrong', () => {
    const mine = btc.p2tr(pubkey.subarray(1, 33), undefined, btc.NETWORK);
    const fund = fundingTx(mine.script, 250_000);
    expect(() =>
      build([
        {
          txid: fund.id,
          vout: 0,
          value: 250_000,
          status: { confirmed: true },
          address: mine.address!,
          pubkey: otherPubkey,
          prevTxHex: hex.encode(fund.toBytes(true, false)),
        },
      ]),
    ).toThrow(InconsistentUtxoError);
  });
});

describe('one bad input poisons the whole bundle, by design', () => {
  it('refuses to emit a partial sweep when any input is inconsistent', () => {
    const good = honestInput(150_000);
    const bad = honestInput(150_000);
    bad.value = 999_999;
    // Not "drop the bad one and carry on": a sweep that silently leaves coins
    // behind is not the transaction the user asked for.
    expect(() => build([good, bad])).toThrow(InconsistentUtxoError);
  });
});
