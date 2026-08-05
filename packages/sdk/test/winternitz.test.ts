import { encodeAbiParameters, keccak256, toHex, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  WINTERNITZ_CHAINS,
  createWinternitzKey,
  decodeWinternitz,
  signWinternitz,
  toDigits,
  verifyWinternitz,
  W,
  WinternitzSigner,
  type WinternitzParts,
} from '../src/pqc/winternitz.js';
import { createHashSigKey, KeyExhaustedError, signHashSig } from '../src/pqc/hashsig.js';

const seed = keccak256(toHex('winternitz-test-seed'));
const message = keccak256(toHex('authorize-transfer'));

/** Re-encode decoded parts, so a test can tamper with one field in isolation. */
function reencode(parts: WinternitzParts): Hex {
  return encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'bytes32[67]' }, { type: 'bytes32[]' }],
    [BigInt(parts.leafIndex), parts.signature, parts.proof] as never,
  );
}

describe('digit encoding', () => {
  it('produces one digit per chain', () => {
    expect(toDigits(message)).toHaveLength(WINTERNITZ_CHAINS);
    expect(WINTERNITZ_CHAINS).toBe(67);
  });

  it('reads the message most-significant-nibble first', () => {
    // 0xab… must give digits 10, 11, …
    const digits = toDigits(`0x${'ab'.repeat(32)}` as Hex);
    expect(digits[0]).toBe(0xa);
    expect(digits[1]).toBe(0xb);
  });

  it('every digit is a valid base-16 value', () => {
    for (const digit of toDigits(message)) {
      expect(digit).toBeGreaterThanOrEqual(0);
      expect(digit).toBeLessThan(W);
    }
  });

  it('the checksum falls as the message digits rise', () => {
    const low = toDigits(`0x${'00'.repeat(32)}` as Hex).slice(64);
    const high = toDigits(`0x${'ff'.repeat(32)}` as Hex).slice(64);
    // All-zero digits: checksum is maximal (64 * 15 = 960 = 0x3c0).
    expect(low).toEqual([0x3, 0xc, 0x0]);
    // All-max digits: checksum is zero.
    expect(high).toEqual([0, 0, 0]);
  });

  it('rejects a digest that is not 32 bytes', () => {
    expect(() => toDigits('0x1234' as Hex)).toThrow(/32-byte/);
  });
});

describe('sign and verify', () => {
  it('round-trips for every leaf in the tree', () => {
    const key = createWinternitzKey(seed, 4);
    for (let leaf = 0; leaf < 4; leaf++) {
      expect(verifyWinternitz(key.root, message, signWinternitz(key, message, leaf))).toBe(true);
    }
  });

  it('rejects a signature over a different message', () => {
    const key = createWinternitzKey(seed, 4);
    const signature = signWinternitz(key, message, 0);
    expect(verifyWinternitz(key.root, keccak256(toHex('something-else')), signature)).toBe(false);
  });

  it('rejects a signature against a different root', () => {
    const key = createWinternitzKey(seed, 4);
    const other = createWinternitzKey(keccak256(toHex('other-seed')), 4);
    expect(verifyWinternitz(other.root, message, signWinternitz(key, message, 0))).toBe(false);
  });

  it('rejects a tampered chain value', () => {
    const key = createWinternitzKey(seed, 4);
    const parts = decodeWinternitz(signWinternitz(key, message, 1));
    parts.signature[5] = keccak256(toHex('tampered'));
    expect(verifyWinternitz(key.root, message, reencode(parts))).toBe(false);
  });

  it('rejects a tampered Merkle proof', () => {
    const key = createWinternitzKey(seed, 4);
    const parts = decodeWinternitz(signWinternitz(key, message, 1));
    parts.proof[0] = keccak256(toHex('wrong-sibling'));
    expect(verifyWinternitz(key.root, message, reencode(parts))).toBe(false);
  });

  it('rejects a signature relabelled with a different leaf index', () => {
    const key = createWinternitzKey(seed, 8);
    // Genuine chains and proof for leaf 3, but claiming to be leaf 5. The
    // per-leaf tweak means the chains no longer reconstruct leaf 3's public key,
    // and the proof no longer applies at position 5 either.
    const parts = decodeWinternitz(signWinternitz(key, message, 3));
    parts.leafIndex = 5;
    expect(verifyWinternitz(key.root, message, reencode(parts))).toBe(false);
  });

  it('rejects malformed signature bytes without throwing', () => {
    const key = createWinternitzKey(seed, 4);
    expect(verifyWinternitz(key.root, message, '0xdeadbeef')).toBe(false);
  });

  it('refuses a leaf index outside the tree', () => {
    const key = createWinternitzKey(seed, 4);
    expect(() => signWinternitz(key, message, 4)).toThrow(/out of range/);
    expect(() => signWinternitz(key, message, -1)).toThrow(/out of range/);
  });
});

describe('the forgery barrier is the checksum', () => {
  it('walking a chain forward alone cannot forge, because the checksum falls', () => {
    const digits = toDigits(message);
    // An attacker who sees a signature can advance any message digit by hashing.
    // Doing so lowers the checksum, and the checksum chains would have to be
    // walked *backwards* to match — that is the preimage problem.
    const messageSum = digits.slice(0, 64).reduce((sum, digit) => sum + (W - 1 - digit), 0);
    const checksum = (digits[64]! << 8) | (digits[65]! << 4) | digits[66]!;
    expect(checksum).toBe(messageSum);
  });

  it('a signature is not accepted for a different message', () => {
    const key = createWinternitzKey(seed, 2);
    const signature = signWinternitz(key, message, 0);
    // Flip the digest so at least one digit differs; verification must fail.
    const altered = keccak256(message);
    expect(verifyWinternitz(key.root, altered, signature)).toBe(false);
  });
});

describe('signature size versus Lamport', () => {
  it('is roughly an order of magnitude smaller on the wire', () => {
    const wKey = createWinternitzKey(seed, 4);
    const lKey = createHashSigKey(seed, 4);
    const wBytes = (signWinternitz(wKey, message, 0).length - 2) / 2;
    const lBytes = (signHashSig(lKey, message, 0).length - 2) / 2;

    // 67 chain words vs 512 public-key words + 256 secrets.
    expect(wBytes).toBeLessThan(lBytes / 8);
    // Both carry the same 2-deep Merkle proof and leaf index.
    expect(wBytes).toBeLessThan(2_600);
  });
});

describe('WinternitzSigner enforces one-time use', () => {
  it('advances the leaf index on every signature', () => {
    const signer = WinternitzSigner.create(seed, 4);
    expect(signer.signNext(message).leafIndex).toBe(0);
    expect(signer.signNext(message).leafIndex).toBe(1);
    expect(signer.nextIndex).toBe(2);
    expect(signer.remaining).toBe(2);
  });

  it('never reuses a leaf, even for an identical message', () => {
    const signer = WinternitzSigner.create(seed, 4);
    const first = signer.signNext(message);
    const second = signer.signNext(message);
    expect(first.leafIndex).not.toBe(second.leafIndex);
    expect(first.signature).not.toBe(second.signature);
    expect(verifyWinternitz(signer.root, message, first.signature)).toBe(true);
    expect(verifyWinternitz(signer.root, message, second.signature)).toBe(true);
  });

  it('throws once the tree is exhausted rather than wrapping around', () => {
    const signer = WinternitzSigner.create(seed, 2);
    signer.signNext(message);
    signer.signNext(message);
    expect(() => signer.signNext(message)).toThrow(KeyExhaustedError);
  });

  it('survives serialize and restore without losing its position', () => {
    const signer = WinternitzSigner.create(seed, 4);
    signer.signNext(message);
    const restored = WinternitzSigner.restore(signer.serialize());
    expect(restored.nextIndex).toBe(1);
    expect(restored.root).toBe(signer.root);
    expect(restored.signNext(message).leafIndex).toBe(1);
  });
});

describe('key construction', () => {
  it('is deterministic in the seed', () => {
    expect(createWinternitzKey(seed, 4).root).toBe(createWinternitzKey(seed, 4).root);
  });

  it('rejects a tree size that is not a power of two', () => {
    expect(() => createWinternitzKey(seed, 6)).toThrow(/power of two/);
  });

  it('rejects a short seed', () => {
    expect(() => createWinternitzKey('0x1234', 4)).toThrow(/at least 16 bytes/);
  });

  it('differs from the Lamport root for the same seed', () => {
    // Different scheme, different commitment — a key must not be usable as if
    // it were the other kind.
    expect(createWinternitzKey(seed, 4).root).not.toBe(createHashSigKey(seed, 4).root);
  });
});
