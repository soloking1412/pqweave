import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  attestationMessage,
  encodeAttest,
  pqWeaveAttestationAbi,
} from '../src/attestation/index.js';

const ROOT = `0x${'ab'.repeat(32)}` as const;
const BTC_ADDR = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

describe('attestation message', () => {
  it('binds the BTC address and PQC root deterministically', () => {
    const message = attestationMessage(BTC_ADDR, ROOT);
    expect(message).toContain(BTC_ADDR);
    expect(message).toContain(ROOT);
    // Stable across calls (both signer and verifier must reproduce it).
    expect(attestationMessage(BTC_ADDR, ROOT)).toBe(message);
  });
});

describe('encodeAttest', () => {
  it('round-trips through the ABI', () => {
    const sig = `0x${'cd'.repeat(65)}` as const;
    const data = encodeAttest(ROOT, BTC_ADDR, sig);
    const decoded = decodeFunctionData({ abi: pqWeaveAttestationAbi, data });
    expect(decoded.functionName).toBe('attest');
    expect(decoded.args[0]).toBe(ROOT);
    expect(decoded.args[1]).toBe(BTC_ADDR);
    expect(decoded.args[2]).toBe(sig);
  });
});
