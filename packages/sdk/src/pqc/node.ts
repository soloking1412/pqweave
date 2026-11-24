import { open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Hex } from 'viem';
import { KeyExhaustedError } from './hashsig.js';
import type { LeafReservationStore } from './durable.js';

interface Journal {
  version: 1;
  root: Hex;
  treeSize: number;
  nextIndex: number;
}

/**
 * Single-host POSIX journal. Use a private local directory, not a network drive.
 * Exclusive lock refuses concurrent requests; caller may retry later. A crash
 * leaves a lock and fails closed. No automatic stale-lock deletion or recovery.
 * This does not defend against disk rollback, a malicious OS or copied seeds.
 */
export class FileLeafReservationStore implements LeafReservationStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  /** Only for a newly generated key that has NEVER signed, on any chain/device. */
  async initializeFreshKey(root: Hex, treeSize: number): Promise<void> {
    this.validate({ version: 1, root, treeSize, nextIndex: 0 }, root, treeSize);
    const handle = await open(this.path, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify({ version: 1, root, treeSize, nextIndex: 0 }));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await this.syncDirectory();
  }

  async reserve(root: Hex, treeSize: number): Promise<number> {
    const lockPath = `${this.path}.lock`;
    const lock = await open(lockPath, 'wx', 0o600).catch(() => {
      throw new Error('Signer journal is locked or unavailable; do not reset it');
    });
    let committed = false;
    try {
      const raw = await readFile(this.path, 'utf8');
      if (raw.length > 1024) throw new Error('Invalid signer journal');
      const state: Journal = JSON.parse(raw);
      this.validate(state, root, treeSize);
      if (state.nextIndex === treeSize) throw new KeyExhaustedError();
      const leafIndex = state.nextIndex;
      state.nextIndex++;
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(state));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.path);
      await this.syncDirectory();
      committed = true;
      return leafIndex;
    } finally {
      await lock.close();
      // Any uncertain write/read leaves the signer locked for operator recovery.
      if (committed) await unlink(lockPath);
    }
  }

  private validate(state: Journal, root: Hex, treeSize: number): void {
    if (
      !state ||
      state.version !== 1 ||
      !/^0x[0-9a-fA-F]{64}$/.test(root) ||
      typeof state.root !== 'string' ||
      state.root.toLowerCase() !== root.toLowerCase() ||
      !Number.isInteger(treeSize) ||
      treeSize < 1 ||
      treeSize > 4096 ||
      (treeSize & (treeSize - 1)) !== 0 ||
      state.treeSize !== treeSize ||
      !Number.isInteger(state.nextIndex) ||
      state.nextIndex < 0 ||
      state.nextIndex > treeSize
    )
      throw new Error('Invalid or mismatched signer journal');
  }

  private async syncDirectory(): Promise<void> {
    const handle = await open(dirname(this.path), 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
