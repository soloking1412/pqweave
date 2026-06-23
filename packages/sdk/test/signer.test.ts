import { keccak256, toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { HashSigSigner, KeyExhaustedError, verifyHashSig } from '../src/pqc/hashsig.js';

const masterSeed = keccak256(toHex('signer-master-seed'));

function digest(label: string) {
  return keccak256(toHex(label));
}

describe('HashSigSigner', () => {
  it('hands out strictly increasing leaf indices', () => {
    const signer = HashSigSigner.create(masterSeed, 4);
    expect(signer.signNext(digest('a')).leafIndex).toBe(0);
    expect(signer.signNext(digest('b')).leafIndex).toBe(1);
    expect(signer.signNext(digest('c')).leafIndex).toBe(2);
    expect(signer.nextLeafIndex).toBe(3);
    expect(signer.remaining).toBe(1);
  });

  it('never reuses a leaf, even for the same message', () => {
    const signer = HashSigSigner.create(masterSeed, 8);
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const { leafIndex } = signer.signNext(digest('same-message'));
      expect(seen.has(leafIndex)).toBe(false);
      seen.add(leafIndex);
    }
    expect(seen.size).toBe(8);
  });

  it('produces signatures that verify against the root', () => {
    const signer = HashSigSigner.create(masterSeed, 4);
    const message = digest('op');
    const { signature } = signer.signNext(message);
    expect(verifyHashSig(signer.root, message, signature)).toBe(true);
  });

  it('throws once the key is exhausted', () => {
    const signer = HashSigSigner.create(masterSeed, 2);
    signer.signNext(digest('1'));
    signer.signNext(digest('2'));
    expect(signer.remaining).toBe(0);
    expect(() => signer.signNext(digest('3'))).toThrow(KeyExhaustedError);
  });

  it('persists and restores the counter so leaves are never reused across sessions', () => {
    const signer = HashSigSigner.create(masterSeed, 8);
    signer.signNext(digest('a'));
    signer.signNext(digest('b'));
    const state = signer.serialize();
    expect(state.nextLeafIndex).toBe(2);

    const restored = HashSigSigner.restore(state);
    expect(restored.nextLeafIndex).toBe(2);
    expect(restored.signNext(digest('c')).leafIndex).toBe(2);
  });

  it('rejects state whose root does not match its seed', () => {
    const state = HashSigSigner.create(masterSeed, 4).serialize();
    expect(() => HashSigSigner.restore({ ...state, root: keccak256(toHex('tampered')) })).toThrow();
  });

  it('rejects an out-of-range leaf index on restore', () => {
    const state = HashSigSigner.create(masterSeed, 4).serialize();
    expect(() => HashSigSigner.restore({ ...state, nextLeafIndex: 5 })).toThrow();
  });
});
