import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { keccak256, toHex, type Hex } from 'viem';
import { createHashSigKey, signHashSig, verifyHashSig, decodeHashSig } from '../src/pqc/hashsig.js';
import {
  createWinternitzKey,
  signWinternitz,
  verifyWinternitz,
  decodeWinternitz,
} from '../src/pqc/winternitz.js';

const seed = keccak256(toHex('TEST ONLY adversarial seed'));
const message = keccak256(toHex('operation'));
const word = (value: bigint) => value.toString(16).padStart(64, '0');
const replaceWord = (sig: Hex, index: number, value: bigint): Hex =>
  `0x${sig.slice(2, 2 + index * 64)}${word(value)}${sig.slice(2 + (index + 1) * 64)}`;

for (const [name, create, sign, verify, decode, head] of [
  ['Lamport', createHashSigKey, signHashSig, verifyHashSig, decodeHashSig, 770],
  ['Winternitz', createWinternitzKey, signWinternitz, verifyWinternitz, decodeWinternitz, 69],
] as const) {
  describe(`${name} hostile signature boundary`, () => {
    const key = create(seed, 2);
    const signature = sign(key, message, 1);
    it('accepts both canonical leaves and hexadecimal case variants', () => {
      for (const index of [0, 1])
        expect(verify(key.root, message, sign(key, message, index))).toBe(true);
      expect(verify(`0x${key.root.slice(2).toUpperCase()}`, message, signature)).toBe(true);
    });
    it('rejects index aliases sharing all Merkle path bits (256 generated cases)', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 1n, max: (1n << 254n) - 1n }), (high) => {
          const alias = replaceWord(signature, 0, (high << 1n) | 1n);
          expect(verify(key.root, message, alias)).toBe(false);
          expect(() => decode(alias)).toThrow();
        }),
        { numRuns: 256, seed: 20260925 },
      );
    });
    it('rejects malformed bytes without throwing (512 generated cases)', () => {
      fc.assert(
        fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
          expect(verify(key.root, message, toHex(bytes))).toBe(false);
        }),
        { numRuns: 512, seed: 20260925 },
      );
    });
    it('rejects truncated, extended, noncanonical and oversized proof encodings', () => {
      const mutations: Hex[] = [
        '0x',
        '0xz1',
        signature.slice(0, -1) as Hex,
        signature.slice(0, -2) as Hex,
        `${signature}00`,
        `${signature}${'00'.repeat(32)}`,
        replaceWord(signature, head - 1, 0n),
        replaceWord(signature, head - 1, BigInt(head * 32 + 32)),
        replaceWord(signature, head, 0n),
        replaceWord(signature, head, 13n),
        replaceWord(signature, head, (1n << 256n) - 1n),
      ];
      for (const mutation of mutations) {
        expect(verify(key.root, message, mutation)).toBe(false);
        expect(() => decode(mutation)).toThrow();
      }
    });
    it.each([
      '0x',
      '0x12',
      `0x${'ab'.repeat(31)}`,
      `0x${'ab'.repeat(33)}`,
      `0x${'gg'.repeat(32)}`,
    ] as Hex[])('rejects invalid digest/root %s before signing or verification', (bad) => {
      expect(verify(key.root, bad, signature)).toBe(false);
      expect(verify(bad, message, signature)).toBe(false);
      expect(() => sign(key, bad, 0)).toThrow();
    });
    it.each([0, -1, 0.5, 1.5, 3, 8192, 2 ** 32, Infinity, NaN])(
      'rejects unsupported tree size %s before allocating',
      (size) => {
        expect(() => create(seed, size)).toThrow();
        expect(() => sign({ ...key, treeSize: size }, message, 0)).toThrow();
      },
    );
    it('rejects wrong root and different digest', () => {
      expect(verify(seed, message, signature)).toBe(false);
      expect(verify(key.root, seed, signature)).toBe(false);
    });
  });
}
