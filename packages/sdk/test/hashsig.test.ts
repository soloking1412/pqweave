import { keccak256, toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { createHashSigKey, signHashSig, verifyHashSig } from '../src/pqc/hashsig.js';

const masterSeed = keccak256(toHex('pqweave-hashsig-master'));
const message = keccak256(toHex('authorize-large-transfer'));

describe('hashsig (Lamport + Merkle)', () => {
  for (const treeSize of [1, 4, 16]) {
    it(`signs and verifies with a tree of ${treeSize}`, () => {
      const key = createHashSigKey(masterSeed, treeSize);
      for (let leaf = 0; leaf < treeSize; leaf++) {
        const signature = signHashSig(key, message, leaf);
        expect(verifyHashSig(key.root, message, signature)).toBe(true);
      }
    });
  }

  it('rejects a signature for a different message', () => {
    const key = createHashSigKey(masterSeed, 4);
    const signature = signHashSig(key, message, 1);
    expect(verifyHashSig(key.root, keccak256(toHex('other')), signature)).toBe(false);
  });

  it('rejects a signature against the wrong root', () => {
    const key = createHashSigKey(masterSeed, 4);
    const other = createHashSigKey(keccak256(toHex('different-seed')), 4);
    const signature = signHashSig(key, message, 0);
    expect(verifyHashSig(other.root, message, signature)).toBe(false);
  });

  it('rejects non-power-of-two tree sizes', () => {
    expect(() => createHashSigKey(masterSeed, 3)).toThrow();
  });

  it('rejects an out-of-range leaf index', () => {
    const key = createHashSigKey(masterSeed, 4);
    expect(() => signHashSig(key, message, 4)).toThrow();
  });
});
