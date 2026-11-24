import type { Hex } from 'viem';
import { createHashSigKey, signHashSig, type HashSigKey } from './hashsig.js';
import { createWinternitzKey, signWinternitz } from './winternitz.js';

export type StatefulScheme = 'lamport' | 'winternitz';

/**
 * Trusted storage boundary: atomically persist the increment BEFORE returning.
 * All signers/devices using this root must share this journal. Never roll it
 * back, recreate it from chain history, or restore an old backup into service.
 */
export interface LeafReservationStore {
  reserve(root: Hex, treeSize: number): Promise<number>;
}

/** Reserves before signing. A failed signature/storage acknowledgement burns a leaf. */
export class DurablePqcSigner {
  private readonly key: HashSigKey;

  constructor(
    seed: Hex,
    treeSize: number,
    readonly scheme: StatefulScheme,
    private readonly store: LeafReservationStore,
  ) {
    if (scheme !== 'lamport' && scheme !== 'winternitz') throw new Error('Unknown scheme');
    if (!Number.isInteger(treeSize) || treeSize < 1 || treeSize > 4096) {
      throw new Error('Invalid tree size');
    }
    this.key = (scheme === 'lamport' ? createHashSigKey : createWinternitzKey)(seed, treeSize);
  }

  get root(): Hex {
    return this.key.root;
  }

  async signNext(message: Hex): Promise<{ signature: Hex; leafIndex: number }> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(message)) throw new Error('Expected a 32-byte digest');
    const leafIndex = await this.store.reserve(this.key.root, this.key.treeSize);
    if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= this.key.treeSize) {
      throw new Error('Reservation store returned an invalid leaf');
    }
    const sign = this.scheme === 'lamport' ? signHashSig : signWinternitz;
    return { signature: sign(this.key, message, leafIndex), leafIndex };
  }
}
