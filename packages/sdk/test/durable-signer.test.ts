import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import { DurablePqcSigner } from '../src/pqc/durable.js';
import { FileLeafReservationStore } from '../src/pqc/node.js';
import { createHashSigKey, verifyHashSig } from '../src/pqc/hashsig.js';
import { WinternitzSigner } from '../src/pqc/winternitz.js';

const seed = keccak256(toHex('TEST ONLY durable seed'));
const digest = keccak256(toHex('operation'));
const root = createHashSigKey(seed, 4).root;
const dirs: string[] = [];
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'pqweave-journal-'));
  dirs.push(dir);
  const path = join(dir, 'journal.json');
  const store = new FileLeafReservationStore(path);
  await store.initializeFreshKey(root, 4);
  return { store, path };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('durable one-time signature reservations', () => {
  it('commits before releasing a signature and survives a new signer instance', async () => {
    const { store, path } = await setup();
    const first = await new DurablePqcSigner(seed, 4, 'lamport', store).signNext(digest);
    expect(JSON.parse(await readFile(path, 'utf8')).nextIndex).toBe(1);
    expect(verifyHashSig(root, digest, first.signature)).toBe(true);
    const second = await new DurablePqcSigner(
      seed,
      4,
      'lamport',
      new FileLeafReservationStore(path),
    ).signNext(digest);
    expect(second.leafIndex).toBe(1);
  });
  it('burns a reservation when the caller crashes before signing', async () => {
    const { store } = await setup();
    await store.reserve(root, 4);
    expect((await new DurablePqcSigner(seed, 4, 'lamport', store).signNext(digest)).leafIndex).toBe(
      1,
    );
  });
  it('does not release a signature when persistence acknowledgement fails', async () => {
    const { store } = await setup();
    const failing = new DurablePqcSigner(seed, 4, 'lamport', {
      reserve: async (r, n) => {
        await store.reserve(r, n);
        throw new Error('lost acknowledgement');
      },
    });
    await expect(failing.signNext(digest)).rejects.toThrow('lost acknowledgement');
    expect((await new DurablePqcSigner(seed, 4, 'lamport', store).signNext(digest)).leafIndex).toBe(
      1,
    );
  });
  it('refuses concurrent access without duplicate successful reservations', async () => {
    const { store } = await setup();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => store.reserve(root, 4)),
    );
    const indices = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    expect(indices.length).toBeGreaterThan(0);
    expect(new Set(indices).size).toBe(indices.length);
  });
  it('refuses missing, corrupt and mismatched journals instead of resetting', async () => {
    const { store, path } = await setup();
    await expect(store.initializeFreshKey(root, 4)).rejects.toThrow();
    await writeFile(path, '{}');
    await expect(store.reserve(root, 4)).rejects.toThrow('Invalid');
    await expect(store.reserve(root, 4)).rejects.toThrow('locked');
    await expect(
      new FileLeafReservationStore(`${path}.missing`).reserve(root, 4),
    ).rejects.toThrow();
  });
  it('stops at exhaustion and validates the digest before reserving', async () => {
    const { store } = await setup();
    await expect(new DurablePqcSigner(seed, 4, 'lamport', store).signNext('0x12')).rejects.toThrow(
      '32-byte',
    );
    for (let i = 0; i < 4; i++) expect(await store.reserve(root, 4)).toBe(i);
    await expect(store.reserve(root, 4)).rejects.toThrow('exhausted');
  });
  it('validates Winternitz restore roots and indices', () => {
    const state = WinternitzSigner.create(seed, 2).serialize();
    for (const nextIndex of [-1, 0.5, 3, NaN]) {
      expect(() => WinternitzSigner.restore({ ...state, nextIndex })).toThrow('nextIndex');
    }
    expect(() => WinternitzSigner.restore({ ...state, root: digest })).toThrow('inconsistent');
  });
});
