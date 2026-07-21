import { hexToBytes, toHex, type Hex } from 'viem';
import { decodeHashSig, type HashSigParts, type HashSigSigner } from '../pqc/hashsig.js';

/**
 * Client for the PQWeave Stellar (Soroban) vault (`packages/stellar-vault`). It
 * turns a `@pqweave/sdk` hash-based key into the `PqSignature` components the
 * vault's `__check_auth` verifies — byte-for-byte matching the on-chain
 * contract. Like the Solana client, it deliberately does NOT depend on a heavy
 * chain SDK: it returns raw bytes, and the web layer maps them to `xdr.ScVal`
 * and assembles the Soroban authorization entry with `@stellar/stellar-sdk`.
 *
 * The same Lamport+Merkle key protects the EVM account, the Solana vault, and
 * this Stellar vault: the verifier is identical (keccak256), so one key works
 * across all three.
 */

export const PUBKEY_BYTES = 512 * 32; // 16384
export const SIG_BYTES = 256 * 32; // 8192

/**
 * The four fields of the vault's `PqSignature` contracttype. The web layer maps
 * these to an `xdr.ScVal` map: `leaf_index` (u32) and `public_key`/`signature`/
 * `proof` (Bytes). Soroban passes the 32-byte call hash as `signature_payload`,
 * so the signature is bound to the operation — there is no separate digest.
 */
export interface PqSignatureComponents {
  leafIndex: number;
  /** 512 one-time public-key elements, flat (16384 bytes). */
  publicKey: Uint8Array;
  /** 256 revealed secrets, flat (8192 bytes). */
  signature: Uint8Array;
  /** Merkle authentication path, flat (height × 32 bytes). */
  proof: Uint8Array;
}

function flatten(elements: Hex[]): Uint8Array {
  const out = new Uint8Array(elements.length * 32);
  elements.forEach((h, i) => out.set(hexToBytes(h), i * 32));
  return out;
}

/** Convert a decoded hash signature into the vault's `PqSignature` components. */
export function encodePqSignature(parts: HashSigParts): PqSignatureComponents {
  return {
    leafIndex: parts.leafIndex,
    publicKey: flatten(parts.publicKey),
    signature: flatten(parts.signature),
    proof: flatten(parts.proof),
  };
}

/**
 * Sign a Soroban authorization payload with the next unused one-time key.
 * `payloadHash` is Soroban's `signature_payload` — the 32-byte hash of the
 * authorized call (recipient, amount, token) — which the vault's `__check_auth`
 * verifies the Lamport signature against.
 *
 * Advances the monotonic leaf counter; persist `signer.serialize()` after this,
 * before submitting, so the one-time key can never be reused.
 */
export function signStellarAuth(
  signer: HashSigSigner,
  payloadHash: Uint8Array,
): PqSignatureComponents {
  if (payloadHash.length !== 32) throw new Error('payloadHash must be 32 bytes');
  const { signature } = signer.signNext(toHex(payloadHash));
  return encodePqSignature(decodeHashSig(signature));
}
