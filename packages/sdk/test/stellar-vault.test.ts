import { describe, expect, it } from 'vitest';
import { hexToBytes, keccak256, toHex } from 'viem';
import {
  encodePqSignature,
  PUBKEY_BYTES,
  SIG_BYTES,
  signStellarAuth,
} from '../src/stellar-vault/index.js';
import {
  createHashSigKey,
  decodeHashSig,
  HashSigSigner,
  signHashSig,
  verifyHashSig,
} from '../src/pqc/hashsig.js';

// The canonical cross-runtime vector, shared with the EVM verifier, the Solana
// vault, and packages/stellar-vault's Rust __check_auth test. If these bytes
// match, one @pqweave/sdk key works on all three chains.
const MASTER = keccak256(toHex('cross-runtime-master'));
const PAYLOAD = keccak256(toHex('authorize-1.5-eth-transfer'));
const CANONICAL_ROOT = '0x5d0efe09af54753206193066c17b92a1c2b066846cc37b86f85d1c2e6623c0fe';

describe('stellar vault client (cross-runtime parity)', () => {
  it('produces the canonical root and PqSignature the on-chain vault verifies', () => {
    const tree = 4; // height 2
    const leaf = 2;
    const key = createHashSigKey(MASTER, tree);
    expect(key.root).toBe(CANONICAL_ROOT);

    const abiSig = signHashSig(key, PAYLOAD, leaf);
    expect(verifyHashSig(key.root, PAYLOAD, abiSig)).toBe(true);

    const components = encodePqSignature(decodeHashSig(abiSig));
    expect(components.leafIndex).toBe(leaf);
    expect(components.publicKey.length).toBe(PUBKEY_BYTES); // 16384
    expect(components.signature.length).toBe(SIG_BYTES); // 8192
    expect(components.proof.length).toBe(2 * 32); // tree height 2
  });
});

describe('signStellarAuth', () => {
  it('signs the payload with the next one-time leaf and advances the counter', () => {
    const signer = HashSigSigner.create(MASTER, 16);
    expect(signer.nextLeafIndex).toBe(0);

    const first = signStellarAuth(signer, new Uint8Array(32).fill(0x11));
    expect(first.leafIndex).toBe(0);
    expect(signer.nextLeafIndex).toBe(1);
    expect(first.publicKey.length).toBe(PUBKEY_BYTES);
    expect(first.signature.length).toBe(SIG_BYTES);
    expect(first.proof.length).toBe(4 * 32); // tree 16 → height 4

    const second = signStellarAuth(signer, new Uint8Array(32).fill(0x22));
    expect(second.leafIndex).toBe(1);
    expect(signer.nextLeafIndex).toBe(2);
  });

  it('rejects a payload that is not 32 bytes', () => {
    const signer = HashSigSigner.create(MASTER, 4);
    expect(() => signStellarAuth(signer, new Uint8Array(31))).toThrow(/32 bytes/);
  });

  it('a signed payload verifies under the shared hash-based verifier', () => {
    const master = keccak256(toHex('stellar-roundtrip'));
    const signer = HashSigSigner.create(master, 8);
    const root = signer.root;
    const payloadHex = keccak256(toHex('authorize-xlm-withdrawal'));
    const leaf = signer.nextLeafIndex; // 0
    const components = signStellarAuth(signer, hexToBytes(payloadHex));
    // Independently reconstruct the same one-time signature: byte-parity proves
    // signStellarAuth emits exactly what the verifier accepts.
    const abiSig = signHashSig({ masterSeed: master, treeSize: 8, root }, payloadHex, leaf);
    expect(encodePqSignature(decodeHashSig(abiSig))).toEqual(components);
    expect(verifyHashSig(root, payloadHex, abiSig)).toBe(true);
  });
});
