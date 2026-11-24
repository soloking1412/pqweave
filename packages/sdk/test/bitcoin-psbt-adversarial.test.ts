import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  buildBitcoinReadinessPlan,
  createBitcoinPlanBundle,
  restoreBitcoinPlanBundle,
} from '../src/bitcoin/kit.js';
import { verifySweepMatchesPlan } from '../src/bitcoin/verify.js';
const privateKey = new Uint8Array(32).fill(11);
const pubkey = secp256k1.getPublicKey(privateKey, true);
const destination = btc.p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(12), true)).address!;

for (const [name, source] of Object.entries({
  legacy: btc.p2pkh(pubkey),
  native: btc.p2wpkh(pubkey),
  wrapped: btc.p2sh(btc.p2wpkh(pubkey)),
  taproot: btc.p2tr(pubkey.slice(1)),
})) {
  describe(`Bitcoin ${name} hostile plan/PSBT boundary`, () => {
    const funding = new btc.Transaction();
    funding.addOutput({ script: source.script, amount: 1_000_000n });
    funding.addInput({
      txid: new Uint8Array(32),
      index: 0xffffffff,
      finalScriptSig: Uint8Array.of(1, 1),
    });
    const input = {
      txid: funding.id,
      vout: 0,
      value: 1_000_000,
      address: source.address!,
      pubkey,
      status: { confirmed: true },
      prevTxHex: hex.encode(funding.toBytes(true, false)),
    };
    const params = {
      inputs: [input],
      destination,
      feeRates: { economy: 2, standard: 3, priority: 5 },
    };
    const plan = buildBitcoinReadinessPlan(params);
    const tier = plan.tiers[0]!;
    const parsed = () => btc.Transaction.fromPSBT(base64.decode(tier.psbtBase64));
    const rejected = (mutate: (tx: btc.Transaction) => void) => {
      let valid = false;
      try {
        const tx = parsed();
        mutate(tx);
        valid = verifySweepMatchesPlan(base64.encode(tx.toPSBT()), plan, tier).ok;
      } catch {
        /* Rejection by the underlying BIP-174 parser is also a closed boundary. */
      }
      expect(valid).toBe(false);
    };
    it('accepts unsigned, signed and finalized transactions without altering the plan', () => {
      const tx = parsed();
      expect(verifySweepMatchesPlan(base64.encode(tx.toPSBT()), plan, tier).ok).toBe(true);
      tx.sign(privateKey);
      expect(verifySweepMatchesPlan(base64.encode(tx.toPSBT()), plan, tier).ok).toBe(true);
      tx.finalize();
      expect(verifySweepMatchesPlan(base64.encode(tx.toPSBT()), plan, tier).ok).toBe(true);
    });
    it('rejects any changed output amount (128 generated cases)', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 1n, max: 1_000_000n }), (amount) => {
          fc.pre(amount !== tier.outputSats);
          rejected((tx) => tx.updateOutput(0, { amount }));
        }),
        { numRuns: 128, seed: 20260925 },
      );
    });
    it.each([2, 3, 0x81, 0x82, 0x83])('rejects signature hash mode %s', (sighashType) => {
      rejected((tx) => tx.updateInput(0, { sighashType }));
    });
    it('rejects changed recipient, added output, RBF removal and outpoint substitution', () => {
      rejected((tx) => tx.updateOutput(0, { script: source.script }));
      rejected((tx) => tx.addOutput({ script: source.script, amount: 1n }));
      rejected((tx) => tx.updateInput(0, { sequence: 0xffffffff }));
      rejected((tx) => tx.updateInput(0, { txid: new Uint8Array(32).fill(13) }));
      rejected((tx) => tx.updateInput(0, { index: 1 }));
    });
    it('rejects inconsistent funding transactions even when the spent output is unchanged', () => {
      const other = new btc.Transaction();
      other.addOutput({ script: source.script, amount: 1_000_000n });
      other.addOutput({ script: source.script, amount: 1n });
      other.addInput({
        txid: new Uint8Array(32),
        index: 0xffffffff,
        finalScriptSig: Uint8Array.of(1, 1),
      });
      rejected((tx) => tx.updateInput(0, { nonWitnessUtxo: other.toBytes(true, false) }));
    });
    it.each([false, 'true', 1, null, undefined])(
      'requires a literal confirmed boolean (%s)',
      (confirmed) => {
        const file = createBitcoinPlanBundle(params);
        (file.request.inputs[0]!.status as { confirmed: unknown }).confirmed = confirmed;
        expect(() => restoreBitcoinPlanBundle(JSON.stringify(file))).toThrow('Unconfirmed');
      },
    );
    it('rejects funding amount, script, key, index and transaction-id lies', () => {
      for (const change of [
        { value: 999_999 },
        { vout: 1 },
        { txid: 'ff'.repeat(32) },
        { address: destination },
        { pubkey: secp256k1.getPublicKey(new Uint8Array(32).fill(14), true) },
      ])
        expect(() =>
          buildBitcoinReadinessPlan({ ...params, inputs: [{ ...input, ...change }] }),
        ).toThrow();
    });
  });
}
