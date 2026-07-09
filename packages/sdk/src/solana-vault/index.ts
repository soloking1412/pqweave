import { keccak256, sha256, hexToBytes, toHex, type Hex } from 'viem';
import { ed25519 } from '@noble/curves/ed25519';
import { decodeHashSig, type HashSigParts, type HashSigSigner } from '../pqc/hashsig.js';

/**
 * Client for the PQWeave Solana vault (`packages/solana-vault`). It builds the
 * instruction data, derives the vault PDA, computes the withdrawal digest, and
 * serializes the post-quantum signature for buffer staging — all byte-for-byte
 * matching the on-chain program. It deliberately does NOT depend on
 * `@solana/web3.js`: it returns raw bytes, and the caller assembles the
 * transactions with their own Solana library.
 *
 * Reuse the same `@pqweave/sdk` Lamport+Merkle key as the EVM account; the
 * verifier is identical, so one key protects both.
 */

const utf8 = (s: string) => new TextEncoder().encode(s);
const VAULT_SEED = utf8('vault');
const WITHDRAW_DOMAIN = utf8('PQWEAVE_SOLANA_VAULT_v1');
const PDA_MARKER = utf8('ProgramDerivedAddress');

export const PUBKEY_BYTES = 512 * 32; // 16384
export const SIG_BYTES = 256 * 32; // 8192

export const VAULT_INSTRUCTION = {
  Initialize: 0,
  Deposit: 1,
  StageSignature: 2,
  Withdraw: 3,
} as const;

function u16le(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}
function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}
function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * The 32-byte digest the post-quantum key signs to authorize a withdrawal. Binds
 * the signature to this vault, recipient, amount, and one-time leaf. Mirrors the
 * program's `withdraw_message`.
 */
export function withdrawMessage(
  pqcRoot: Uint8Array,
  recipient: Uint8Array,
  amount: bigint,
  leafIndex: number,
): Uint8Array {
  return hexToBytes(
    keccak256(cat(WITHDRAW_DOMAIN, pqcRoot, recipient, u64le(amount), u32le(leafIndex))),
  );
}

function isOnCurve(point: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(point);
    return true;
  } catch {
    return false;
  }
}

/** Derive the vault state PDA (`["vault", pqc_root]`), matching Solana's
 *  `find_program_address`. `pqcRoot` and `programId` are 32-byte arrays. */
export function findVaultPda(
  pqcRoot: Uint8Array,
  programId: Uint8Array,
): { pda: Uint8Array; bump: number } {
  for (let bump = 255; bump >= 0; bump--) {
    const candidate = sha256(
      cat(VAULT_SEED, pqcRoot, Uint8Array.of(bump), programId, PDA_MARKER),
      'bytes',
    );
    if (!isOnCurve(candidate)) return { pda: candidate, bump };
  }
  throw new Error('unable to find a vault PDA bump');
}

export function initializeData(pqcRoot: Uint8Array, leafCount: number): Uint8Array {
  return cat(Uint8Array.of(VAULT_INSTRUCTION.Initialize), pqcRoot, u32le(leafCount));
}
export function depositData(amount: bigint): Uint8Array {
  return cat(Uint8Array.of(VAULT_INSTRUCTION.Deposit), u64le(amount));
}
export function stageSignatureData(offset: number, chunk: Uint8Array): Uint8Array {
  return cat(Uint8Array.of(VAULT_INSTRUCTION.StageSignature), u16le(offset), chunk);
}
export function withdrawData(amount: bigint, leafIndex: number): Uint8Array {
  return cat(Uint8Array.of(VAULT_INSTRUCTION.Withdraw), u64le(amount), u32le(leafIndex));
}

/** Flatten a hash signature into the buffer layout the program reads:
 *  `publicKey(512×32) || signature(256×32) || proof(depth×32)`. */
export function serializeSignature(
  parts: Pick<HashSigParts, 'publicKey' | 'signature' | 'proof'>,
): Uint8Array {
  return cat(
    ...parts.publicKey.map((h) => hexToBytes(h)),
    ...parts.signature.map((h) => hexToBytes(h)),
    ...parts.proof.map((h) => hexToBytes(h)),
  );
}

export interface SignatureChunk {
  offset: number;
  data: Uint8Array;
}

/** Split the ~24 KB signature into `stage_signature` chunks (Solana caps a
 *  transaction at 1232 bytes, so the signature is uploaded across several). */
export function chunkSignature(blob: Uint8Array, maxChunk = 900): SignatureChunk[] {
  const chunks: SignatureChunk[] = [];
  for (let offset = 0; offset < blob.length; offset += maxChunk) {
    chunks.push({ offset, data: blob.slice(offset, Math.min(offset + maxChunk, blob.length)) });
  }
  return chunks;
}

export interface WithdrawalSignature {
  leafIndex: number;
  /** The 32-byte digest that was signed. */
  message: Uint8Array;
  /** Flat signature blob for the buffer account. */
  signature: Uint8Array;
  /** Pre-split chunks for `stage_signature`. */
  chunks: SignatureChunk[];
}

/**
 * Sign a withdrawal with the next unused one-time key. Reads the signer's next
 * leaf, builds the digest for that leaf, signs (advancing the monotonic
 * counter), and returns the staged signature. Persist `signer.serialize()` after
 * this, before broadcasting, so the one-time key is never reused.
 */
export function signWithdrawal(
  signer: HashSigSigner,
  params: { pqcRoot: Uint8Array; recipient: Uint8Array; amount: bigint },
): WithdrawalSignature {
  const leafIndex = signer.nextLeafIndex;
  const message = withdrawMessage(params.pqcRoot, params.recipient, params.amount, leafIndex);
  const { signature: abiSig } = signer.signNext(toHex(message));
  const blob = serializeSignature(decodeHashSig(abiSig));
  return { leafIndex, message, signature: blob, chunks: chunkSignature(blob) };
}
