import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildEvacuationPsbts,
  estimateSweepVsize,
  UnsignableInputError,
  type EvacuationInput,
} from '../src/bitcoin/evacuation.js';
import { describePsbt } from '../src/bitcoin/verify.js';

/**
 * Property-based tests for the money path.
 *
 * The example-based suites prove specific cases work. These ask whether the
 * arithmetic holds for *every* input in range, which is where fee and dust bugs
 * actually live — an overpaying sweep or a transaction that never confirms is,
 * in an emergency, the same as failing.
 *
 * Every property here is an invariant an auditor should be able to read and
 * check independently; they are restated in AUDIT.md.
 */

const DUST_SATS = 546n;
const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const priv = (() => {
  const k = new Uint8Array(32).fill(0);
  k[31] = 21;
  return k;
})();
const pubkey = secp256k1.getPublicKey(priv, true);
const payment = btc.p2wpkh(pubkey, btc.NETWORK);

/** A UTXO backed by a real funding transaction, so PSBTs are well-formed. */
function utxo(value: number, salt: number): EvacuationInput {
  const fund = new btc.Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  fund.addOutput({ script: payment.script, amount: BigInt(value) });
  fund.addInput({
    txid: new Uint8Array(32).fill(salt & 0xff),
    index: 0xffffffff,
    finalScriptSig: Uint8Array.of(1, 1),
    sequence: 0xffffffff,
  });
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

/** Sweep-sized amounts and realistic fee rates. */
const satsArb = fc.integer({ min: 1_000, max: 50_000_000 });
const feeRateArb = fc.double({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true });

function build(values: number[], rate: number) {
  return buildEvacuationPsbts({
    inputs: values.map((v, i) => utxo(v, i)),
    destination: DEST,
    feeRates: { economy: rate, standard: rate, priority: rate },
  });
}

describe('fee arithmetic holds for every input', () => {
  it('fee is always ceil(vsize × rate), exactly', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 6 }), feeRateArb, (values, rate) => {
        let plan;
        try {
          plan = build(values, rate);
        } catch {
          return true; // balance too small at this rate; covered by its own property
        }
        for (const tier of plan.tiers) {
          expect(tier.feeSats).toBe(BigInt(Math.ceil(plan.vsize * tier.feeRate)));
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('value is conserved: inputs − fee === output, with no change', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 6 }), feeRateArb, (values, rate) => {
        let plan;
        try {
          plan = build(values, rate);
        } catch {
          return true;
        }
        const total = values.reduce((s, v) => s + BigInt(v), 0n);
        expect(plan.totalInputSats).toBe(total);
        for (const tier of plan.tiers) {
          expect(tier.outputSats).toBe(total - tier.feeSats);
          // A sweep must leave nothing behind.
          const tx = btc.Transaction.fromPSBT(base64.decode(tier.psbtBase64));
          expect(tx.outputsLength).toBe(1);
          expect(tx.getOutput(0).amount).toBe(tier.outputSats);
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('never emits an output at or below the dust limit', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 4 }), feeRateArb, (values, rate) => {
        let plan;
        try {
          plan = build(values, rate);
        } catch {
          return true;
        }
        for (const tier of plan.tiers) expect(tier.outputSats >= DUST_SATS).toBe(true);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('a tier is skipped exactly when it would be dust or negative', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 4 }), feeRateArb, (values, rate) => {
        let plan;
        try {
          plan = build(values, rate);
        } catch {
          // Everything was unviable, which is the all-skipped case.
          const vsize = estimateSweepVsize(values.map(() => 'p2wpkh'));
          const total = values.reduce((s, v) => s + BigInt(v), 0n);
          expect(total - BigInt(Math.ceil(vsize * rate)) < DUST_SATS).toBe(true);
          return true;
        }
        const total = plan.totalInputSats;
        const viable = total - BigInt(Math.ceil(plan.vsize * rate)) >= DUST_SATS;
        // All three tiers share one rate here, so they agree.
        expect(plan.tiers.length > 0).toBe(viable);
        expect(plan.skipped.length).toBe(viable ? 0 : 3);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('a higher fee rate never yields a larger output', () => {
    fc.assert(
      fc.property(satsArb, feeRateArb, feeRateArb, (value, a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        let lowPlan, highPlan;
        try {
          lowPlan = build([value], low);
          highPlan = build([value], high);
        } catch {
          return true;
        }
        expect(highPlan.tiers[0]!.outputSats <= lowPlan.tiers[0]!.outputSats).toBe(true);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe('PSBT structural invariants hold for every sweep', () => {
  it('every input opts into RBF and carries its spending data', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 5 }), (values) => {
        let plan;
        try {
          plan = build(values, 3);
        } catch {
          return true;
        }
        const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
        expect(tx.inputsLength).toBe(values.length);
        for (let i = 0; i < tx.inputsLength; i++) {
          const input = tx.getInput(i);
          expect(input.sequence).toBe(0xfffffffd); // RBF
          // p2wpkh: witnessUtxo is required, nonWitnessUtxo supplied for Trezor.
          expect(input.witnessUtxo).toBeTruthy();
          expect(input.nonWitnessUtxo).toBeTruthy();
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('PSBTs round-trip through BIP-174 serialization unchanged', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 4 }), (values) => {
        let plan;
        try {
          plan = build(values, 7);
        } catch {
          return true;
        }
        for (const tier of plan.tiers) {
          const raw = base64.decode(tier.psbtBase64);
          expect(hex.encode(btc.Transaction.fromPSBT(raw).toPSBT())).toBe(hex.encode(raw));
        }
        return true;
      }),
      { numRuns: 150 },
    );
  });

  it('the dry run always agrees with the plan it describes', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 4 }), feeRateArb, (values, rate) => {
        let plan;
        try {
          plan = build(values, rate);
        } catch {
          return true;
        }
        for (const tier of plan.tiers) {
          const d = describePsbt(tier.psbtBase64);
          expect(d.totalInputSats).toBe(plan.totalInputSats);
          expect(d.feeSats).toBe(tier.feeSats);
          expect(d.outputs[0]!.amountSats).toBe(tier.outputSats);
          expect(d.isSweep).toBe(true);
          expect(d.replaceable).toBe(true);
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('every sweep is signable end to end', () => {
    fc.assert(
      fc.property(fc.array(satsArb, { minLength: 1, maxLength: 4 }), (values) => {
        let plan;
        try {
          plan = build(values, 5);
        } catch {
          return true;
        }
        const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
        tx.sign(priv);
        tx.finalize();
        expect(tx.id).toMatch(/^[0-9a-f]{64}$/);
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

describe('vsize estimation is monotonic and bounded', () => {
  const typeArb = fc.constantFrom('p2pkh', 'p2wpkh', 'p2sh', 'p2tr' as const);

  it('adding an input never shrinks the estimate', () => {
    fc.assert(
      fc.property(fc.array(typeArb, { minLength: 1, maxLength: 20 }), typeArb, (types, extra) => {
        const base = estimateSweepVsize(types as never);
        const grown = estimateSweepVsize([...types, extra] as never);
        expect(grown).toBeGreaterThan(base);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('estimation is order-independent', () => {
    fc.assert(
      fc.property(fc.array(typeArb, { minLength: 1, maxLength: 12 }), (types) => {
        const reversed = [...types].reverse();
        expect(estimateSweepVsize(reversed as never)).toBe(estimateSweepVsize(types as never));
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe('unsignable inputs always throw, never leak into a bundle', () => {
  it('a legacy input without its previous transaction is always rejected', () => {
    fc.assert(
      fc.property(satsArb, (value) => {
        const legacy = btc.p2pkh(pubkey, btc.NETWORK);
        expect(() =>
          buildEvacuationPsbts({
            inputs: [
              {
                txid: '11'.repeat(32),
                vout: 0,
                value,
                status: { confirmed: true },
                address: legacy.address!,
                pubkey,
              },
            ],
            destination: DEST,
            feeRates: { economy: 1, standard: 2, priority: 3 },
          }),
        ).toThrow(UnsignableInputError);
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
