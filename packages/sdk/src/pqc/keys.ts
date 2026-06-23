import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '@noble/hashes/utils';
import { bytesToHex, type Hex, hexToBytes, keccak256 } from 'viem';
import { DEFAULT_PQC_SCHEME, type PqcSchemeId, schemeInfo } from './schemes.js';

const HKDF_SALT = new TextEncoder().encode('pqweave/pqc/v1');

export interface PqcKeypair {
  scheme: PqcSchemeId;
  publicKey: Hex;
  secretKey: Hex;
}

export interface DeriveOptions {
  scheme?: PqcSchemeId;
  /** Key index, allowing multiple PQC keys from one master seed. */
  index?: number;
}

function toBytes(seed: Hex | Uint8Array): Uint8Array {
  return typeof seed === 'string' ? hexToBytes(seed) : seed;
}

/** Generate a fresh keypair from system randomness. */
export function generatePqcKeypair(scheme: PqcSchemeId = DEFAULT_PQC_SCHEME): PqcKeypair {
  const info = schemeInfo(scheme);
  const { publicKey, secretKey } = info.signer.keygen(randomBytes(info.seedLength));
  return { scheme, publicKey: bytesToHex(publicKey), secretKey: bytesToHex(secretKey) };
}

/**
 * Deterministically derive a keypair from a master seed. The same master seed
 * (e.g. derived from a wallet signature) always reproduces the same keys, so a
 * post-quantum key never needs to be backed up separately.
 */
export function derivePqcKeypair(
  masterSeed: Hex | Uint8Array,
  options: DeriveOptions = {},
): PqcKeypair {
  const scheme = options.scheme ?? DEFAULT_PQC_SCHEME;
  const index = options.index ?? 0;
  const info = schemeInfo(scheme);
  const ikm = toBytes(masterSeed);
  if (ikm.length < 16) throw new Error('master seed must be at least 16 bytes');
  const info_ = new TextEncoder().encode(`${scheme}/${index}`);
  const seed = hkdf(sha256, ikm, HKDF_SALT, info_, info.seedLength);
  const { publicKey, secretKey } = info.signer.keygen(seed);
  return { scheme, publicKey: bytesToHex(publicKey), secretKey: bytesToHex(secretKey) };
}

export interface SignParams {
  scheme: PqcSchemeId;
  secretKey: Hex;
  /** Message digest to sign, typically a 32-byte operation hash. */
  message: Hex;
}

export function pqcSign({ scheme, secretKey, message }: SignParams): Hex {
  const info = schemeInfo(scheme);
  const sig = info.signer.sign(hexToBytes(secretKey), hexToBytes(message));
  return bytesToHex(sig);
}

export interface VerifyParams {
  scheme: PqcSchemeId;
  publicKey: Hex;
  message: Hex;
  signature: Hex;
}

export function pqcVerify({ scheme, publicKey, message, signature }: VerifyParams): boolean {
  const info = schemeInfo(scheme);
  return info.signer.verify(hexToBytes(publicKey), hexToBytes(message), hexToBytes(signature));
}

/** keccak256 commitment to a post-quantum public key, as stored on-chain. */
export function pqcPublicKeyHash(publicKey: Hex): Hex {
  return keccak256(publicKey);
}
