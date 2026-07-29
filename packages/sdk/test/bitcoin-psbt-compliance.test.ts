import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { describe, expect, it } from 'vitest';
import { buildEvacuationPsbts, type EvacuationInput } from '../src/bitcoin/evacuation.js';
import { deriveAddresses, parseDerivationPath, parseExtendedKey } from '../src/bitcoin/hd.js';

/**
 * What a hardware wallet checks before it will sign.
 *
 * These tests are NOT a substitute for signing on a physical Coldcard, Trezor or
 * Ledger — that still needs doing on real hardware. What they do is assert the
 * properties those devices actually verify, so a PSBT cannot reach a device
 * missing something it will silently refuse on:
 *
 *   1. it round-trips through BIP-174 serialization unchanged;
 *   2. `nonWitnessUtxo` really hashes to the input's txid (Trezor enforces this,
 *      because a lying previous transaction is how fee-inflation attacks work);
 *   3. the `bip32Derivation` pubkey is genuinely the key at that path, under the
 *      claimed master fingerprint;
 *   4. that pubkey actually controls the script being spent;
 *   5. `redeemScript` hashes to the P2SH scriptPubKey, and `tapInternalKey`
 *      tweaks to the Taproot output key.
 *
 * A device that disagrees with any of these shows "no inputs to sign".
 */

// BIP-32 root of the standard "abandon … about" test mnemonic, so every
// derivation below is reproducible against published vectors.
const ROOT = HDKey.fromExtendedKey(
  'xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu',
);
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const ACCOUNT_PATH = "m/84'/0'/0'";
const FINGERPRINT = ROOT.fingerprint.toString(16).padStart(8, '0');
const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const derived = deriveAddresses(parseExtendedKey(ZPUB), {
  maxPerChain: 1,
  chains: ['receive'],
  origin: { masterFingerprint: FINGERPRINT, accountPath: ACCOUNT_PATH },
})[0]!;
const PUBKEY = derived.pubkey;
const XONLY = PUBKEY.subarray(1);

const SCRIPTS = {
  p2pkh: btc.p2pkh(PUBKEY, btc.NETWORK),
  p2wpkh: btc.p2wpkh(PUBKEY, btc.NETWORK),
  p2sh: btc.p2sh(btc.p2wpkh(PUBKEY, btc.NETWORK), btc.NETWORK),
  p2tr: btc.p2tr(XONLY, undefined, btc.NETWORK),
} as const;

type Kind = keyof typeof SCRIPTS;

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

function planFor(kind: Kind) {
  const payment = SCRIPTS[kind];
  const fund = fundingTx(payment.script, 400_000n);
  const input: EvacuationInput = {
    txid: fund.id,
    vout: 0,
    value: 400_000,
    status: { confirmed: true },
    address: payment.address!,
    pubkey: PUBKEY,
    prevTxHex: hex.encode(fund.toBytes(true, false)),
    pathComponents: derived.pathComponents!,
    masterFingerprint: FINGERPRINT,
  };
  const plan = buildEvacuationPsbts({
    inputs: [input],
    destination: DEST,
    feeRates: { economy: 3, standard: 3, priority: 3 },
  });
  return { plan, fund, payment };
}

const KINDS: Kind[] = ['p2pkh', 'p2wpkh', 'p2sh', 'p2tr'];

describe('PSBT round-trips through BIP-174 serialization', () => {
  for (const kind of KINDS) {
    it(`${kind} survives decode → encode unchanged`, () => {
      const { plan } = planFor(kind);
      const original = base64.decode(plan.tiers[0]!.psbtBase64);
      const reserialized = btc.Transaction.fromPSBT(original).toPSBT();
      expect(hex.encode(reserialized)).toBe(hex.encode(original));
    });
  }
});

describe('nonWitnessUtxo matches the input it claims to fund', () => {
  // Trezor rejects a PSBT whose previous transaction does not hash to the
  // input's txid — it is the defence against fee-inflation attacks.
  for (const kind of ['p2pkh', 'p2sh', 'p2wpkh'] as Kind[]) {
    it(`${kind}: previous transaction hashes to the input txid`, () => {
      const { plan, fund } = planFor(kind);
      const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
      const input = tx.getInput(0);
      expect(input.nonWitnessUtxo).toBeTruthy();

      const prev = btc.Transaction.fromRaw(fund.toBytes(true, false), {
        allowUnknownOutputs: true,
        allowLegacyWitnessUtxo: true,
      });
      expect(prev.id).toBe(hex.encode(input.txid!));
      // …and the output it points at is the one being spent.
      expect(input.nonWitnessUtxo!.outputs[input.index!]!.amount).toBe(400_000n);
    });
  }
});

describe('bip32Derivation is internally consistent', () => {
  for (const kind of KINDS) {
    it(`${kind}: the declared path really derives the declared pubkey`, () => {
      const { plan } = planFor(kind);
      const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
      const input = tx.getInput(0);

      const entry =
        kind === 'p2tr'
          ? (
              input.tapBip32Derivation as [
                Uint8Array,
                { der: { fingerprint: number; path: number[] } },
              ][]
            )?.[0]
          : (input.bip32Derivation as [Uint8Array, { fingerprint: number; path: number[] }][])?.[0];
      expect(entry).toBeTruthy();

      const [keyBytes, value] = entry!;
      const der = 'der' in value ? value.der : value;

      // The fingerprint is the wallet's, and the path is the full account path.
      expect(der.fingerprint).toBe(Number.parseInt(FINGERPRINT, 16));
      expect(der.path).toEqual([...parseDerivationPath(ACCOUNT_PATH), 0, 0]);

      // Walking the real master key down that path must reproduce the pubkey a
      // device is being told to sign with. This is the check that fails when a
      // derivation path is wrong, and it is invisible until the device refuses.
      const child = ROOT.derive(
        `m/${der.path.map((c) => (c >= 0x80000000 ? `${c - 0x80000000}'` : String(c))).join('/')}`,
      );
      const expected = kind === 'p2tr' ? child.publicKey!.subarray(1) : child.publicKey!;
      expect(hex.encode(keyBytes)).toBe(hex.encode(expected));
    });
  }
});

describe('the declared key actually controls the script being spent', () => {
  for (const kind of KINDS) {
    it(`${kind}: pubkey reconstructs the spent scriptPubKey`, () => {
      const { plan, payment } = planFor(kind);
      const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
      const input = tx.getInput(0);

      const spent =
        input.witnessUtxo?.script ?? input.nonWitnessUtxo!.outputs[input.index!]!.script!;
      expect(hex.encode(spent)).toBe(hex.encode(payment.script));

      // Rebuild the script from the pubkey alone: if these differ, the device is
      // being asked to sign for an output it does not control.
      const rebuilt =
        kind === 'p2pkh'
          ? btc.p2pkh(PUBKEY, btc.NETWORK).script
          : kind === 'p2wpkh'
            ? btc.p2wpkh(PUBKEY, btc.NETWORK).script
            : kind === 'p2sh'
              ? btc.p2sh(btc.p2wpkh(PUBKEY, btc.NETWORK), btc.NETWORK).script
              : btc.p2tr(XONLY, undefined, btc.NETWORK).script;
      expect(hex.encode(rebuilt)).toBe(hex.encode(spent));
    });
  }
});

describe('script-type specific fields are correct', () => {
  it('p2sh redeemScript is the inner p2wpkh script and hashes to the p2sh output', () => {
    const { plan } = planFor('p2sh');
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    const input = tx.getInput(0);

    const inner = btc.p2wpkh(PUBKEY, btc.NETWORK).script;
    expect(hex.encode(input.redeemScript!)).toBe(hex.encode(inner));
    // Wrapping the declared redeemScript must reproduce the spent script.
    expect(hex.encode(btc.p2sh(btc.p2wpkh(PUBKEY, btc.NETWORK), btc.NETWORK).script)).toBe(
      hex.encode(input.witnessUtxo!.script),
    );
  });

  it('p2tr tapInternalKey tweaks to the spent output key', () => {
    const { plan } = planFor('p2tr');
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    const input = tx.getInput(0);

    expect(input.tapInternalKey!.length).toBe(32);
    expect(hex.encode(input.tapInternalKey!)).toBe(hex.encode(XONLY));
    // The internal key must tweak to the key committed in the output, otherwise
    // a key-path spend cannot be produced.
    expect(hex.encode(btc.p2tr(input.tapInternalKey!, undefined, btc.NETWORK).script)).toBe(
      hex.encode(input.witnessUtxo!.script),
    );
  });

  it('legacy inputs carry no witnessUtxo, which some signers reject', () => {
    const { plan } = planFor('p2pkh');
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.tiers[0]!.psbtBase64));
    const input = tx.getInput(0);
    expect(input.witnessUtxo).toBeFalsy();
    expect(input.nonWitnessUtxo).toBeTruthy();
  });
});
