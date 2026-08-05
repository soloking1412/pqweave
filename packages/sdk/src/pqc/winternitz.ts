import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
  keccak256,
  numberToHex,
} from 'viem';
// Shared with the Lamport scheme so `instanceof` behaves the same whichever
// verifier an account is configured with.
import { KeyExhaustedError } from './hashsig.js';

/**
 * Winternitz (WOTS+) one-time signatures over a Merkle tree — a generalized
 * XMSS construction, keccak256 only.
 *
 * This is the same security assumption as the Lamport scheme in `hashsig.ts`
 * (preimage and collision resistance of a hash, nothing lattice-based), but far
 * cheaper on chain. Winternitz trades hashing for bandwidth: instead of
 * revealing one secret per message *bit*, it walks a hash chain per message
 * *digit*.
 *
 * The saving is larger than the chain count suggests. A Lamport signature has to
 * ship the one-time public key as well, because the verifier needs all 512
 * elements to rebuild the Merkle leaf. Here the verifier *derives* the public
 * key by finishing each chain, so nothing but the chain values travel:
 *
 *   Lamport : 512 + 256 words = 24,736 bytes per signature
 *   WOTS+   :        67 words =  2,304 bytes per signature   (10.7x smaller)
 *
 * Measured end to end on EVM at tree depth 2 (see VerifierGas.t.sol), that is
 * 670,062 gas down to 254,218 — calldata falls 11x, and execution falls too,
 * because Lamport has to hash a 16 KB one-time public key to commit its leaf.
 *
 * Ethereum's own post-quantum work (leanSig / leanXMSS) picked the same family
 * for the same reason, though it instantiates the hash differently.
 *
 * **One-time keys are still one-time.** A leaf that signs twice leaks enough
 * chain preimages to forge, and Winternitz leaks *more* per reuse than Lamport
 * does, because a lower digit exposes every step above it. Use
 * {@link WinternitzSigner}, never the raw sign function.
 */

/** Winternitz parameter: each chain encodes log2(w) = 4 bits. */
export const W = 16;
const LOG_W = 4;

/** Chains covering the 256-bit message digest. */
const MESSAGE_CHAINS = 64; // 256 / 4

/**
 * Chains covering the checksum. The checksum is at most
 * MESSAGE_CHAINS * (W - 1) = 960, which needs 3 base-16 digits.
 *
 * The checksum is what makes forgery hard: an attacker can always walk a chain
 * *forward* to a higher digit, so without it they could raise any digit at will.
 * Raising a message digit lowers the checksum, and lowering a checksum digit
 * would require inverting the hash.
 */
const CHECKSUM_CHAINS = 3;

/** Total chains per one-time key. */
export const WINTERNITZ_CHAINS = MESSAGE_CHAINS + CHECKSUM_CHAINS; // 67

const SIGNATURE_ABI = [
  { type: 'uint256' },
  { type: 'bytes32[67]' },
  { type: 'bytes32[]' },
] as const;

export interface WinternitzKey {
  /** Master seed the one-time keys are derived from. Treat as a secret. */
  masterSeed: Hex;
  /** Number of one-time keys (Merkle leaves); a power of two. */
  treeSize: number;
  /** Merkle root committing to the keys; the on-chain public key. */
  root: Hex;
}

function word(index: number | bigint): Hex {
  return numberToHex(index, { size: 32 });
}

/**
 * Domain separator for one step of one chain.
 *
 * Without it, every chain in every leaf would be the same function, and an
 * attacker inverting one hash could apply the result across all 2^h leaves at
 * once — a multi-target attack that cheapens the whole tree rather than a single
 * key. Packing the position into the hash input makes each step its own
 * function. This is the "tweakable hash" idea generalized XMSS is built on.
 */
function tweak(leafIndex: number, chainIndex: number, step: number): Hex {
  return word((BigInt(leafIndex) << 64n) | (BigInt(chainIndex) << 32n) | BigInt(step));
}

/** Walk a chain from `from` up to `to`, hashing with position-dependent tweaks. */
function chain(start: Hex, leafIndex: number, chainIndex: number, from: number, to: number): Hex {
  let node = start;
  for (let step = from; step < to; step++) {
    node = keccak256(concatHex([node, tweak(leafIndex, chainIndex, step)]));
  }
  return node;
}

function leafSeed(masterSeed: Hex, index: number): Hex {
  return keccak256(concatHex([masterSeed, word(index)]));
}

function deriveSecrets(masterSeed: Hex, leafIndex: number): Hex[] {
  const seed = leafSeed(masterSeed, leafIndex);
  const secrets = new Array<Hex>(WINTERNITZ_CHAINS);
  for (let i = 0; i < WINTERNITZ_CHAINS; i++) {
    secrets[i] = keccak256(concatHex([seed, word(i)]));
  }
  return secrets;
}

/** Complete every chain to w-1 to get the one-time public key. */
function publicFromSecrets(secrets: Hex[], leafIndex: number): Hex[] {
  return secrets.map((secret, i) => chain(secret, leafIndex, i, 0, W - 1));
}

function leafCommit(publicKey: Hex[]): Hex {
  return keccak256(concatHex(publicKey));
}

/**
 * Split the message into base-16 digits, then append the checksum digits.
 * Digits are read most-significant-nibble first, matching the contract.
 */
export function toDigits(message: Hex): number[] {
  const bytes = hexToBytes(message);
  if (bytes.length !== 32) throw new Error('message must be a 32-byte digest');

  const digits = new Array<number>(WINTERNITZ_CHAINS);
  for (let i = 0; i < MESSAGE_CHAINS; i++) {
    const byte = bytes[i >> 1]!;
    digits[i] = (i & 1) === 0 ? byte >> LOG_W : byte & 0x0f;
  }

  let checksum = 0;
  for (let i = 0; i < MESSAGE_CHAINS; i++) checksum += W - 1 - digits[i]!;

  // Checksum digits, most significant first.
  for (let i = 0; i < CHECKSUM_CHAINS; i++) {
    const shift = LOG_W * (CHECKSUM_CHAINS - 1 - i);
    digits[MESSAGE_CHAINS + i] = (checksum >> shift) & 0x0f;
  }
  return digits;
}

function nextLevel(nodes: Hex[]): Hex[] {
  const next = new Array<Hex>(nodes.length / 2);
  for (let i = 0; i < next.length; i++) {
    next[i] = keccak256(concatHex([nodes[2 * i]!, nodes[2 * i + 1]!]));
  }
  return next;
}

function allLeaves(masterSeed: Hex, treeSize: number): Hex[] {
  const leaves = new Array<Hex>(treeSize);
  for (let j = 0; j < treeSize; j++) {
    leaves[j] = leafCommit(publicFromSecrets(deriveSecrets(masterSeed, j), j));
  }
  return leaves;
}

function merkleRoot(leaves: Hex[]): Hex {
  let nodes = leaves;
  while (nodes.length > 1) nodes = nextLevel(nodes);
  return nodes[0]!;
}

function merkleProof(leaves: Hex[], index: number): Hex[] {
  const proof: Hex[] = [];
  let nodes = leaves;
  let idx = index;
  while (nodes.length > 1) {
    proof.push(nodes[idx ^ 1]!);
    nodes = nextLevel(nodes);
    idx >>= 1;
  }
  return proof;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Create a Winternitz key from a master seed. */
export function createWinternitzKey(masterSeed: Hex, treeSize = 16): WinternitzKey {
  if (!isPowerOfTwo(treeSize)) throw new Error('treeSize must be a power of two');
  if (hexToBytes(masterSeed).length < 16) throw new Error('master seed must be at least 16 bytes');
  return { masterSeed, treeSize, root: merkleRoot(allLeaves(masterSeed, treeSize)) };
}

/**
 * Sign a 32-byte digest with the one-time key at `leafIndex`.
 *
 * Signing twice with the same leaf is a key-compromise event, not a bug to work
 * around. {@link WinternitzSigner} exists to make that impossible.
 */
export function signWinternitz(key: WinternitzKey, message: Hex, leafIndex: number): Hex {
  if (leafIndex < 0 || leafIndex >= key.treeSize) throw new Error('leafIndex out of range');
  const secrets = deriveSecrets(key.masterSeed, leafIndex);
  const digits = toDigits(message);
  const signature = secrets.map((secret, i) => chain(secret, leafIndex, i, 0, digits[i]!));
  const proof = merkleProof(allLeaves(key.masterSeed, key.treeSize), leafIndex);
  return encodeAbiParameters(SIGNATURE_ABI, [BigInt(leafIndex), signature, proof] as never);
}

/**
 * Verify a Winternitz signature against a Merkle root. Mirrors the contract
 * step for step, so a signature that verifies here verifies on chain.
 */
export function verifyWinternitz(root: Hex, message: Hex, signature: Hex): boolean {
  let decoded: readonly [bigint, readonly Hex[], readonly Hex[]];
  try {
    decoded = decodeAbiParameters(SIGNATURE_ABI, signature) as unknown as readonly [
      bigint,
      readonly Hex[],
      readonly Hex[],
    ];
  } catch {
    return false;
  }
  const [leafIndex, sig, proof] = decoded;

  const digits = toDigits(message);
  const index = Number(leafIndex);
  // Finish each chain from the signed digit to w-1; this reconstructs the
  // one-time public key, which is why it never has to be transmitted.
  const publicKey = sig.map((element, i) => chain(element, index, i, digits[i]!, W - 1));

  let node = leafCommit(publicKey);
  let idx = index;
  for (const sibling of proof) {
    node =
      (idx & 1) === 0
        ? keccak256(concatHex([node, sibling]))
        : keccak256(concatHex([sibling, node]));
    idx >>= 1;
  }
  return node === root;
}

/** The components of a Winternitz signature. */
export interface WinternitzParts {
  leafIndex: number;
  /** 67 chain values, one per digit. */
  signature: Hex[];
  /** Merkle authentication path. */
  proof: Hex[];
}

/** Decode an ABI-encoded signature, for re-serializing to a non-EVM verifier. */
export function decodeWinternitz(signature: Hex): WinternitzParts {
  const [leafIndex, sig, proof] = decodeAbiParameters(
    SIGNATURE_ABI,
    signature,
  ) as unknown as readonly [bigint, readonly Hex[], readonly Hex[]];
  return { leafIndex: Number(leafIndex), signature: [...sig], proof: [...proof] };
}

/** Serializable state of a {@link WinternitzSigner}. Contains the secret seed. */
export interface WinternitzSignerState {
  masterSeed: Hex;
  treeSize: number;
  root: Hex;
  nextIndex: number;
}

/**
 * Strictly monotonic signer. The leaf index only ever moves forward, so a key
 * cannot sign twice even if the caller asks it to.
 *
 * Mirrors `HashSigSigner` so the two schemes are interchangeable at the call
 * site and the safety property does not depend on which one is selected.
 */
export class WinternitzSigner {
  private readonly key: WinternitzKey;
  private index: number;

  constructor(key: WinternitzKey, nextIndex = 0) {
    this.key = key;
    this.index = nextIndex;
  }

  static create(masterSeed: Hex, treeSize = 16): WinternitzSigner {
    return new WinternitzSigner(createWinternitzKey(masterSeed, treeSize));
  }

  static restore(state: WinternitzSignerState): WinternitzSigner {
    const key: WinternitzKey = {
      masterSeed: state.masterSeed,
      treeSize: state.treeSize,
      root: state.root,
    };
    return new WinternitzSigner(key, state.nextIndex);
  }

  get root(): Hex {
    return this.key.root;
  }

  get treeSize(): number {
    return this.key.treeSize;
  }

  get nextIndex(): number {
    return this.index;
  }

  get remaining(): number {
    return this.key.treeSize - this.index;
  }

  /** Sign with the next unused leaf, then advance. Never reuses an index. */
  signNext(message: Hex): { signature: Hex; leafIndex: number } {
    if (this.index >= this.key.treeSize) throw new KeyExhaustedError();
    const leafIndex = this.index;
    const signature = signWinternitz(this.key, message, leafIndex);
    // Advance only after signing succeeds, so a throw does not burn a leaf.
    this.index = leafIndex + 1;
    return { signature, leafIndex };
  }

  serialize(): WinternitzSignerState {
    return {
      masterSeed: this.key.masterSeed,
      treeSize: this.key.treeSize,
      root: this.key.root,
      nextIndex: this.index,
    };
  }
}
