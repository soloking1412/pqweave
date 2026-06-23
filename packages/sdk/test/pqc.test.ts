import { keccak256, toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PQC_SCHEME,
  derivePqcKeypair,
  generatePqcKeypair,
  PQC_SCHEMES,
  pqcPublicKeyHash,
  pqcSign,
  pqcVerify,
  RECOVERY_PQC_SCHEME,
  type PqcSchemeId,
} from '../src/pqc/index.js';

const message = keccak256(toHex('pqweave-operation-digest'));
const schemes = Object.keys(PQC_SCHEMES) as PqcSchemeId[];

describe('pqc', () => {
  it('defaults to the NIST-primary ML-DSA-65', () => {
    expect(DEFAULT_PQC_SCHEME).toBe('ml-dsa-65');
    expect(RECOVERY_PQC_SCHEME).toBe('slh-dsa-sha2-192f');
  });

  for (const scheme of schemes) {
    it(`signs and verifies with ${scheme}`, () => {
      const keypair = generatePqcKeypair(scheme);
      const signature = pqcSign({ scheme, secretKey: keypair.secretKey, message });
      expect(pqcVerify({ scheme, publicKey: keypair.publicKey, message, signature })).toBe(true);
    });

    it(`rejects a tampered message for ${scheme}`, () => {
      const keypair = generatePqcKeypair(scheme);
      const signature = pqcSign({ scheme, secretKey: keypair.secretKey, message });
      const tampered = keccak256(toHex('different-digest'));
      expect(
        pqcVerify({ scheme, publicKey: keypair.publicKey, message: tampered, signature }),
      ).toBe(false);
    });
  }

  it('derives the same keypair from the same master seed', () => {
    const seed = keccak256(toHex('wallet-signature-derived-seed'));
    const a = derivePqcKeypair(seed);
    const b = derivePqcKeypair(seed);
    expect(a.publicKey).toBe(b.publicKey);
    expect(a.secretKey).toBe(b.secretKey);
  });

  it('derives distinct keypairs per index', () => {
    const seed = keccak256(toHex('wallet-signature-derived-seed'));
    expect(derivePqcKeypair(seed, { index: 0 }).publicKey).not.toBe(
      derivePqcKeypair(seed, { index: 1 }).publicKey,
    );
  });

  it('rejects a short master seed', () => {
    expect(() => derivePqcKeypair('0x1234')).toThrow();
  });

  it('produces a keccak256 commitment to the public key', () => {
    const keypair = generatePqcKeypair();
    expect(pqcPublicKeyHash(keypair.publicKey)).toBe(keccak256(keypair.publicKey));
  });
});
