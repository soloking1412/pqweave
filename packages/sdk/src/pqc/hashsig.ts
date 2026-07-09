import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  hexToBytes,
  keccak256,
  numberToHex,
} from 'viem';

/**
 * Hash-based (Lamport + Merkle) post-quantum signatures, matching the on-chain
 * LamportMerkleVerifier contract byte for byte. This is the scheme used for the
 * account's quantum gate: its security depends only on keccak256, so it has no
 * lattice or discrete-log assumptions and is unaffected by Shor's algorithm.
 *
 * A key commits to `treeSize` one-time keys via a Merkle root (the on-chain
 * public key). Each high-value operation consumes one leaf; rotate the key once
 * the leaves are exhausted.
 */

const LEAVES_PER_KEY = 512; // two hash commitments per message bit (256 bits)
const SIG_ELEMENTS = 256; // one revealed secret per message bit

const SIGNATURE_ABI = [
  { type: 'uint256' },
  { type: 'bytes32[512]' },
  { type: 'bytes32[256]' },
  { type: 'bytes32[]' },
] as const;

export interface HashSigKey {
  /** Master seed the one-time keys are derived from. Treat as a secret. */
  masterSeed: Hex;
  /** Number of one-time keys (Merkle leaves); a power of two. */
  treeSize: number;
  /** Merkle root committing to the keys; the on-chain public key. */
  root: Hex;
}

function word(index: number): Hex {
  return numberToHex(index, { size: 32 });
}

function deriveSecrets(leafSeed: Hex): Hex[] {
  const secrets = new Array<Hex>(LEAVES_PER_KEY);
  for (let i = 0; i < LEAVES_PER_KEY; i++) {
    secrets[i] = keccak256(concatHex([leafSeed, word(i)]));
  }
  return secrets;
}

function publicFromSecrets(secrets: Hex[]): Hex[] {
  return secrets.map((secret) => keccak256(secret));
}

function leafCommit(publicKey: Hex[]): Hex {
  return keccak256(concatHex(publicKey));
}

function leafSeed(masterSeed: Hex, index: number): Hex {
  return keccak256(concatHex([masterSeed, word(index)]));
}

function allLeaves(masterSeed: Hex, treeSize: number): Hex[] {
  const leaves = new Array<Hex>(treeSize);
  for (let j = 0; j < treeSize; j++) {
    leaves[j] = leafCommit(publicFromSecrets(deriveSecrets(leafSeed(masterSeed, j))));
  }
  return leaves;
}

function nextLevel(nodes: Hex[]): Hex[] {
  const next = new Array<Hex>(nodes.length / 2);
  for (let i = 0; i < next.length; i++) {
    next[i] = keccak256(concatHex([nodes[2 * i]!, nodes[2 * i + 1]!]));
  }
  return next;
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

function messageBit(messageBytes: Uint8Array, i: number): number {
  return (messageBytes[i >> 3]! >> (7 - (i & 7))) & 1;
}

function signOneTime(message: Hex, secrets: Hex[]): Hex[] {
  const bytes = hexToBytes(message);
  const sig = new Array<Hex>(SIG_ELEMENTS);
  for (let i = 0; i < SIG_ELEMENTS; i++) {
    sig[i] = secrets[2 * i + messageBit(bytes, i)]!;
  }
  return sig;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Create a hash-based key from a master seed. */
export function createHashSigKey(masterSeed: Hex, treeSize = 16): HashSigKey {
  if (!isPowerOfTwo(treeSize)) throw new Error('treeSize must be a power of two');
  if (hexToBytes(masterSeed).length < 16) throw new Error('master seed must be at least 16 bytes');
  return { masterSeed, treeSize, root: merkleRoot(allLeaves(masterSeed, treeSize)) };
}

/** Sign a 32-byte message digest with the one-time key at `leafIndex`. */
export function signHashSig(key: HashSigKey, message: Hex, leafIndex: number): Hex {
  if (leafIndex < 0 || leafIndex >= key.treeSize) throw new Error('leafIndex out of range');
  const secrets = deriveSecrets(leafSeed(key.masterSeed, leafIndex));
  const publicKey = publicFromSecrets(secrets);
  const signature = signOneTime(message, secrets);
  const proof = merkleProof(allLeaves(key.masterSeed, key.treeSize), leafIndex);
  return encodeAbiParameters(SIGNATURE_ABI, [
    BigInt(leafIndex),
    publicKey,
    signature,
    proof,
  ] as never);
}

/** Verify a hash-based signature against a Merkle root. Mirrors the contract. */
export function verifyHashSig(root: Hex, message: Hex, signature: Hex): boolean {
  const [leafIndex, publicKey, sig, proof] = decodeAbiParameters(SIGNATURE_ABI, signature) as [
    bigint,
    readonly Hex[],
    readonly Hex[],
    readonly Hex[],
  ];

  const bytes = hexToBytes(message);
  for (let i = 0; i < SIG_ELEMENTS; i++) {
    if (keccak256(sig[i]!) !== publicKey[2 * i + messageBit(bytes, i)]) return false;
  }

  let node = leafCommit([...publicKey]);
  let idx = Number(leafIndex);
  for (const sibling of proof) {
    node =
      (idx & 1) === 0
        ? keccak256(concatHex([node, sibling]))
        : keccak256(concatHex([sibling, node]));
    idx >>= 1;
  }
  return node === root;
}

/** The components of a hash signature. */
export interface HashSigParts {
  leafIndex: number;
  /** 512 one-time public-key elements. */
  publicKey: Hex[];
  /** 256 revealed secrets (one per message bit). */
  signature: Hex[];
  /** Merkle authentication path. */
  proof: Hex[];
}

/**
 * Decode an ABI-encoded hash signature into its raw components — used to
 * re-serialize it for a non-EVM verifier (e.g. the Solana vault) that expects a
 * flat `publicKey || signature || proof` layout rather than ABI encoding.
 */
export function decodeHashSig(signature: Hex): HashSigParts {
  const [leafIndex, publicKey, sig, proof] = decodeAbiParameters(SIGNATURE_ABI, signature) as [
    bigint,
    readonly Hex[],
    readonly Hex[],
    readonly Hex[],
  ];
  return {
    leafIndex: Number(leafIndex),
    publicKey: [...publicKey],
    signature: [...sig],
    proof: [...proof],
  };
}

/** Serializable state of a {@link HashSigSigner}. Contains the secret seed. */
export interface HashSigSignerState {
  masterSeed: Hex;
  treeSize: number;
  root: Hex;
  /** Next one-time key to use; never decreases. */
  nextLeafIndex: number;
}

/** Thrown when every one-time key has been consumed. */
export class KeyExhaustedError extends Error {
  constructor() {
    super('post-quantum key exhausted; rotate to a new key');
    this.name = 'KeyExhaustedError';
  }
}

/**
 * Stateful signer that makes Lamport one-time-key reuse impossible: it hands out
 * a strictly increasing leaf index and never repeats one, even across different
 * messages. Reusing a one-time key would break the scheme, so the index must be
 * durably persisted — call {@link serialize} and store the result after every
 * signature, before the signature is used.
 */
export class HashSigSigner {
  private state: HashSigSignerState;

  private constructor(state: HashSigSignerState) {
    this.state = state;
  }

  /** Create a signer from a master seed, starting at leaf 0. */
  static create(masterSeed: Hex, treeSize = 16): HashSigSigner {
    const key = createHashSigKey(masterSeed, treeSize);
    return new HashSigSigner({ masterSeed, treeSize, root: key.root, nextLeafIndex: 0 });
  }

  /** Restore a signer from persisted state, verifying its integrity. */
  static restore(state: HashSigSignerState): HashSigSigner {
    const key = createHashSigKey(state.masterSeed, state.treeSize);
    if (key.root !== state.root) throw new Error('signer state is inconsistent with its seed');
    if (!Number.isInteger(state.nextLeafIndex) || state.nextLeafIndex < 0) {
      throw new Error('invalid nextLeafIndex');
    }
    if (state.nextLeafIndex > state.treeSize) throw new Error('nextLeafIndex out of range');
    return new HashSigSigner({ ...state });
  }

  /** The on-chain public key (Merkle root). */
  get root(): Hex {
    return this.state.root;
  }

  /** Index of the next one-time key that will be used. */
  get nextLeafIndex(): number {
    return this.state.nextLeafIndex;
  }

  /** One-time keys still available before a rotation is required. */
  get remaining(): number {
    return this.state.treeSize - this.state.nextLeafIndex;
  }

  /**
   * Sign a 32-byte digest with the next unused one-time key, then advance the
   * counter so that key can never be used again.
   */
  signNext(message: Hex): { signature: Hex; leafIndex: number } {
    if (this.remaining <= 0) throw new KeyExhaustedError();
    const leafIndex = this.state.nextLeafIndex;
    const signature = signHashSig(
      { masterSeed: this.state.masterSeed, treeSize: this.state.treeSize, root: this.state.root },
      message,
      leafIndex,
    );
    this.state = { ...this.state, nextLeafIndex: leafIndex + 1 };
    return { signature, leafIndex };
  }

  /** Snapshot the state for persistence. Contains the secret seed. */
  serialize(): HashSigSignerState {
    return { ...this.state };
  }
}
