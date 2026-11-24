import { describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import { encryptSeed, decryptSeed } from '../../../apps/web/lib/keystore.js';

describe('encrypted recovery files', () => {
  it('round-trips and authenticates public metadata', async () => {
    const seed = keccak256(toHex('test recovery seed'));
    const root = keccak256(toHex('root'));
    const file = await encryptSeed(seed, 'test password', root, 16);
    expect(file.version).toBe(3);
    expect(await decryptSeed(file, 'test password')).toBe(seed);
    await expect(decryptSeed(file, 'wrong password')).rejects.toThrow();
    for (const change of [{ publicKeyRoot: seed }, { treeSize: 32 }, { createdAt: '2026-01-01' }]) {
      await expect(decryptSeed({ ...file, ...change }, 'test password')).rejects.toThrow();
    }
    for (const change of [
      { iterations: 1e12 },
      { iterations: 0 },
      { iv: '0x' as const },
      { version: 9 as never },
    ]) {
      await expect(decryptSeed({ ...file, ...change }, 'test password')).rejects.toThrow('Invalid');
    }
  });
});
