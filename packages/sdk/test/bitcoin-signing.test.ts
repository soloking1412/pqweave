import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';
import {
  buildEvacuationPsbts,
  finalizeSweep,
  UnsignableInputError,
  type EvacuationInput,
} from '../src/bitcoin/evacuation.js';
import { parseDerivationPath } from '../src/bitcoin/hd.js';

/**
 * These tests exist because the evacuation kit once produced PSBTs that no
 * signer would accept: legacy inputs carried only `witnessUtxo`, so even
 * in-process signing with the correct private key returned "No inputs signed".
 * The old suite missed it by testing p2wpkh only, where `witnessUtxo` happens
 * to be sufficient. Every script type is now signed and finalized for real.
 */

const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const FINGERPRINT = '73c5da0a';
const ACCOUNT_PATH = "m/84'/0'/0'";

const priv = (() => {
  const k = new Uint8Array(32).fill(0);
  k[31] = 7;
  return k;
})();
const pubkey = secp256k1.getPublicKey(priv, true);

/** A real previous transaction paying `script`, so nonWitnessUtxo is valid. */
function fundingTx(script: Uint8Array, amount: bigint) {
  const tx = new btc.Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
  tx.addOutput({ script, amount });
  tx.addInput({
    txid: new Uint8Array(32),
    index: 0xffffffff,
    finalScriptSig: Uint8Array.of(1, 1),
    sequence: 0xffffffff,
  });
  return tx;
}

type Payment = { address?: string; script: Uint8Array };

const PAYMENTS: Record<string, Payment> = {
  p2pkh: btc.p2pkh(pubkey, btc.NETWORK),
  p2wpkh: btc.p2wpkh(pubkey, btc.NETWORK),
  p2sh: btc.p2sh(btc.p2wpkh(pubkey, btc.NETWORK), btc.NETWORK),
  p2tr: btc.p2tr(pubkey.subarray(1), undefined, btc.NETWORK),
};

/** Build a sweep input backed by a real funding transaction. */
function inputFor(kind: keyof typeof PAYMENTS, opts: { origin?: boolean; prevTx?: boolean } = {}) {
  const payment = PAYMENTS[kind]!;
  const fund = fundingTx(payment.script, 100_000n);
  const input: EvacuationInput = {
    txid: fund.id,
    vout: 0,
    value: 100_000,
    status: { confirmed: true },
    address: payment.address!,
    pubkey,
    ...(opts.prevTx === false ? {} : { prevTxHex: hex.encode(fund.toBytes(true, false)) }),
    ...(opts.origin === false
      ? {}
      : {
          pathComponents: [...parseDerivationPath(ACCOUNT_PATH), 0, 0],
          masterFingerprint: FINGERPRINT,
        }),
  };
  return input;
}

function buildOne(input: EvacuationInput) {
  return buildEvacuationPsbts({
    inputs: [input],
    destination: DEST,
    feeRates: { economy: 5, standard: 5, priority: 5 },
  });
}

describe('sweep PSBTs are signable for every script type', () => {
  // The regression that motivated this suite: p2pkh must sign end to end.
  for (const kind of ['p2pkh', 'p2wpkh', 'p2sh', 'p2tr'] as const) {
    it(`signs and finalizes a ${kind} sweep`, () => {
      const plan = buildOne(inputFor(kind));
      const tier = plan.tiers[0]!;

      const tx = btc.Transaction.fromPSBT(base64.decode(tier.psbtBase64));
      tx.sign(priv);
      const signed = base64.encode(tx.toPSBT());

      const { txid, hex: rawHex } = finalizeSweep(signed);
      expect(txid).toMatch(/^[0-9a-f]{64}$/);
      expect(rawHex.length).toBeGreaterThan(20);
    });
  }
});

describe('Bitcoin sweep input boundaries', () => {
  it('rejects duplicate outpoints before building a PSBT', () => {
    const input = inputFor('p2wpkh');
    expect(() =>
      buildEvacuationPsbts({
        inputs: [input, input],
        destination: DEST,
        feeRates: { economy: 1, standard: 2, priority: 3 },
      }),
    ).toThrow(/duplicate UTXO outpoint/);
  });

  it('rejects wrong-network inputs and destinations', () => {
    const input = inputFor('p2wpkh');
    const testnetDest = btc.Address(btc.TEST_NETWORK).encode({
      type: 'wpkh',
      hash: new Uint8Array(20).fill(1),
    });
    expect(() =>
      buildEvacuationPsbts({
        inputs: [input],
        destination: testnetDest,
        feeRates: { economy: 1, standard: 2, priority: 3 },
      }),
    ).toThrow(/destination/);
    expect(() =>
      buildEvacuationPsbts({
        inputs: [input],
        destination: testnetDest,
        feeRates: { economy: 1, standard: 2, priority: 3 },
        testnet: true,
      }),
    ).toThrow(/input address/);
  });

  it('rejects invalid fee rates and UTXO values', () => {
    const input = inputFor('p2wpkh');
    expect(() =>
      buildEvacuationPsbts({
        inputs: [input],
        destination: DEST,
        feeRates: { economy: -1, standard: 2, priority: 3 },
      }),
    ).toThrow(/fee rates/);
    expect(() => buildOne({ ...input, value: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /invalid outpoint or amount/,
    );
  });
});

describe('PSBT carries the fields each signer needs', () => {
  it('legacy input gets nonWitnessUtxo and bip32Derivation', () => {
    const plan = buildOne(inputFor('p2pkh'));
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    const input = tx.getInput(0);
    expect(input.nonWitnessUtxo).toBeTruthy();
    expect(input.bip32Derivation).toBeTruthy();
    const [[keyBytes, der]] = input.bip32Derivation as [
      Uint8Array,
      { fingerprint: number; path: number[] },
    ][];
    expect(hex.encode(keyBytes)).toBe(hex.encode(pubkey));
    expect(der.fingerprint).toBe(Number.parseInt(FINGERPRINT, 16));
    // m/84'/0'/0'/0/0
    expect(der.path).toEqual([...parseDerivationPath(ACCOUNT_PATH), 0, 0]);
  });

  it('wrapped segwit gets a redeemScript', () => {
    const plan = buildOne(inputFor('p2sh'));
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    const input = tx.getInput(0);
    expect(input.redeemScript).toBeTruthy();
    expect(input.witnessUtxo).toBeTruthy();
    expect(input.nonWitnessUtxo).toBeTruthy();
  });

  it('taproot gets tapInternalKey (x-only) and tapBip32Derivation', () => {
    const plan = buildOne(inputFor('p2tr'));
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    const input = tx.getInput(0);
    expect(input.tapInternalKey).toBeTruthy();
    expect(input.tapInternalKey!.length).toBe(32);
    expect(hex.encode(input.tapInternalKey!)).toBe(hex.encode(pubkey.subarray(1)));
    expect(input.tapBip32Derivation).toBeTruthy();
  });

  it('every input keeps the RBF sequence', () => {
    const plan = buildOne(inputFor('p2wpkh'));
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    expect(tx.getInput(0).sequence).toBe(0xfffffffd);
  });
});

describe('unsignable inputs fail loudly instead of silently', () => {
  it('throws when a legacy input has no previous transaction', () => {
    expect(() => buildOne(inputFor('p2pkh', { prevTx: false }))).toThrow(UnsignableInputError);
    expect(() => buildOne(inputFor('p2pkh', { prevTx: false }))).toThrow(/previous transaction/i);
  });

  it('throws when wrapped segwit has no previous transaction', () => {
    expect(() => buildOne(inputFor('p2sh', { prevTx: false }))).toThrow(UnsignableInputError);
  });

  it('throws when taproot has no public key', () => {
    const input = inputFor('p2tr');
    delete (input as { pubkey?: Uint8Array }).pubkey;
    expect(() => buildOne(input)).toThrow(/public key/i);
  });

  it('rejects an unrecognized source address', () => {
    const input = { ...inputFor('p2wpkh'), address: 'not-an-address' };
    expect(() => buildOne(input)).toThrow(UnsignableInputError);
  });
});

describe('signability report', () => {
  it('reports ready when the key origin is present', () => {
    const plan = buildOne(inputFor('p2wpkh'));
    expect(plan.signability.ready).toBe(true);
    expect(plan.signability.inputs[0]!.hardwareSignable).toBe(true);
    expect(plan.signability.warnings).toHaveLength(0);
  });

  it('warns, but still builds, when the key origin is missing', () => {
    const plan = buildOne(inputFor('p2wpkh', { origin: false }));
    expect(plan.signability.ready).toBe(false);
    expect(plan.signability.inputs[0]!.hardwareSignable).toBe(false);
    expect(plan.signability.warnings.join(' ')).toMatch(/hardware wallet/i);
    // Still signable by software that owns the address.
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    tx.sign(priv);
    expect(() => finalizeSweep(base64.encode(tx.toPSBT()))).not.toThrow();
  });
});
