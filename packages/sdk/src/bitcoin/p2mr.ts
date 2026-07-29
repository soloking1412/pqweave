import * as btc from '@scure/btc-signer';
// tapLeafHash / TAP_LEAF_VERSION live in the payment subpath, not the root.
import { TAP_LEAF_VERSION, tapLeafHash as btcTapLeafHash } from '@scure/btc-signer/payment.js';
import { tagSchnorr } from '@scure/btc-signer/utils.js';
import { bech32m } from '@scure/base';

/**
 * BIP-360 Pay-to-Merkle-Root (P2MR) primitives.
 *
 * **BIP-360 is `Status: Draft`. It is merged into bitcoin/bips (Feb 2026) but
 * NOT activated on any network.** Everything here builds structurally correct
 * outputs against the specification; none of it is spendable yet.
 *
 * P2MR is Taproot with the quantum-vulnerable key path removed. A P2TR output
 * commits to a tweaked public key, which is why spending it — or even funding a
 * key-path address — exposes a key to Shor's algorithm. P2MR omits the internal
 * key entirely and commits only to the Merkle root of a script tree, so there is
 * nothing for a quantum attacker to recover from the output itself.
 *
 * Wire format (BIP-360):
 *   scriptPubKey : OP_2 OP_PUSHBYTES_32 <32-byte merkle root>   (SegWit v2)
 *   address      : bech32m, mainnet prefix `bc1z`
 *   control block: 1 + 32*m bytes, parity bit always 1 (no key path exists)
 *
 * The BIP deliberately contains **no post-quantum signature schemes** — those
 * are deferred to a companion BIP via `OP_SUCCESSx`. This module therefore takes
 * leaf scripts from the caller and never invents opcodes.
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki
 */

/** SegWit version P2MR occupies. bech32m maps v2 to the character `z`. */
export const P2MR_WITNESS_VERSION = 2;

/** Default tapleaf version, shared with BIP-341. */
export const P2MR_LEAF_VERSION = TAP_LEAF_VERSION; // 0xc0

/** Human-readable bech32 prefixes by network. */
const HRP = { bitcoin: 'bc', testnet: 'tb', signet: 'tb', regtest: 'bcrt' } as const;
export type P2mrNetwork = keyof typeof HRP;

export interface P2mrLeaf {
  /** Raw leaf script. Supplied by the caller — this module invents no opcodes. */
  script: Uint8Array;
  /** Tapleaf version byte. Defaults to 0xc0. */
  leafVersion?: number;
}

export interface P2mrLeafPosition {
  index: number;
  /** Tagged leaf hash (BIP-341 `TapLeaf`). */
  hash: Uint8Array;
  /** Sibling hashes from leaf to root — the control block's Merkle path. */
  path: Uint8Array[];
  /** Ready-to-use control block for spending via this leaf. */
  controlBlock: Uint8Array;
}

export interface P2mrTree {
  /** 32-byte Merkle root — the witness program. */
  root: Uint8Array;
  leaves: P2mrLeafPosition[];
}

/**
 * BIP-341 tagged leaf hash. Delegates to `@scure/btc-signer`, which applies the
 * compact-size prefix the specification requires — reimplementing it is an easy
 * way to produce a subtly wrong tree.
 */
export function tapLeafHash(script: Uint8Array, leafVersion = P2MR_LEAF_VERSION): Uint8Array {
  return btcTapLeafHash(script, leafVersion);
}

/**
 * BIP-341 tagged branch hash. Children are sorted lexicographically before
 * hashing, so the root does not depend on left/right ordering.
 */
export function tapBranchHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  const swap = compareBytes(b, a) === -1;
  return tagSchnorr('TapBranch', swap ? b : a, swap ? a : b);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/**
 * The control block that accompanies a leaf spend: `leafVersion | parity`
 * followed by the Merkle path. P2MR has no key-path spend, so the BIP fixes the
 * parity bit to 1.
 */
export function buildControlBlock(path: Uint8Array[], leafVersion = P2MR_LEAF_VERSION): Uint8Array {
  const out = new Uint8Array(1 + path.length * 32);
  out[0] = (leafVersion & 0xfe) | 1; // parity bit always set
  path.forEach((sibling, i) => out.set(sibling, 1 + i * 32));
  return out;
}

/**
 * Build a P2MR script tree and its Merkle root.
 *
 * BIP-341 permits any binary tree shape; this builds a balanced one, carrying an
 * odd node up a level unchanged. The shape is deterministic, so the same leaves
 * always produce the same address.
 */
export function p2mrMerkleRoot(leaves: P2mrLeaf[]): P2mrTree {
  if (leaves.length === 0) throw new Error('a P2MR tree needs at least one leaf script');

  const positions: P2mrLeafPosition[] = leaves.map((leaf, index) => ({
    index,
    hash: tapLeafHash(leaf.script, leaf.leafVersion ?? P2MR_LEAF_VERSION),
    path: [],
    controlBlock: new Uint8Array(0),
  }));

  // Each level pairs adjacent nodes; every leaf under a node records the
  // sibling it was combined with, which is exactly its control-block path.
  let level: { hash: Uint8Array; members: P2mrLeafPosition[] }[] = positions.map((p) => ({
    hash: p.hash,
    members: [p],
  }));

  while (level.length > 1) {
    const next: typeof level = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      if (!right) {
        next.push(left); // odd node moves up untouched
        continue;
      }
      for (const member of left.members) member.path.push(right.hash);
      for (const member of right.members) member.path.push(left.hash);
      next.push({
        hash: tapBranchHash(left.hash, right.hash),
        members: [...left.members, ...right.members],
      });
    }
    level = next;
  }

  for (const position of positions) {
    const leafVersion = leaves[position.index]!.leafVersion ?? P2MR_LEAF_VERSION;
    position.controlBlock = buildControlBlock(position.path, leafVersion);
  }

  return { root: level[0]!.hash, leaves: positions };
}

/** The P2MR scriptPubKey: `OP_2 OP_PUSHBYTES_32 <merkle root>` (34 bytes). */
export function p2mrScript(merkleRoot: Uint8Array): Uint8Array {
  if (merkleRoot.length !== 32) throw new Error('P2MR merkle root must be 32 bytes');
  return btc.Script.encode(['OP_2', merkleRoot]);
}

/** Encode a Merkle root as a bech32m P2MR address (mainnet: `bc1z…`). */
export function encodeP2mrAddress(
  merkleRoot: Uint8Array,
  network: P2mrNetwork = 'bitcoin',
): string {
  if (merkleRoot.length !== 32) throw new Error('P2MR merkle root must be 32 bytes');
  const hrp = HRP[network];
  return bech32m.encode(hrp, [P2MR_WITNESS_VERSION, ...bech32m.toWords(merkleRoot)], false);
}

export interface DecodedP2mr {
  network: P2mrNetwork;
  merkleRoot: Uint8Array;
}

/**
 * Decode a P2MR address, rejecting anything that is not SegWit v2 with a 32-byte
 * program. Returns null rather than throwing, so callers can probe an address.
 */
export function decodeP2mrAddress(address: string): DecodedP2mr | null {
  try {
    const decoded = bech32m.decode(address.trim().toLowerCase() as `${string}1${string}`, false);
    const [version, ...rest] = decoded.words;
    if (version !== P2MR_WITNESS_VERSION) return null;
    const program = bech32m.fromWords(rest);
    if (program.length !== 32) return null;
    const entry = (Object.entries(HRP) as [P2mrNetwork, string][]).find(
      ([, hrp]) => hrp === decoded.prefix,
    );
    if (!entry) return null;
    return { network: entry[0], merkleRoot: Uint8Array.from(program) };
  } catch {
    return null;
  }
}

/** True when `address` is a well-formed P2MR (SegWit v2, 32-byte) address. */
export function isP2mrAddress(address: string): boolean {
  return decodeP2mrAddress(address) !== null;
}
