#![no_std]
//! PQWeave Stellar (Soroban) post-quantum vault.
//!
//! **Status: in development, not audited, not deployed to mainnet.** This does
//! NOT make a Stellar wallet quantum-safe — a Stellar account id (`G...`) *is*
//! its Ed25519 public key and cannot be hardened in place. This contract is a
//! Soroban custom account (`CustomAccountInterface`) that authorizes operations
//! only against a valid hash-based (Lamport + Merkle) one-time signature, which
//! a quantum computer cannot forge. It protects funds swept into it, not the
//! everyday wallet.
//!
//! The verifier mirrors `packages/sdk/src/pqc/hashsig.ts`,
//! `LamportMerkleVerifier.sol`, and `packages/solana-vault` byte-for-byte
//! (keccak256), so one `@pqweave/sdk` key works across EVM, Solana, and Stellar.
//!
//! Soroban binds the signature to the operation for us: `__check_auth` receives
//! `signature_payload` — the 32-byte hash of the authorized call (recipient,
//! amount, token) — and we verify the Lamport signature over exactly that. There
//! is no hand-rolled withdrawal digest, and the ~24 KB signature fits in a single
//! transaction (no chunked staging like Solana).

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    Bytes, BytesN, Env, Vec,
};

/// Two hash commitments per message bit (256 bits) => 512 public-key elements.
const LEAVES_PER_KEY: u32 = 512;
/// One revealed secret per message bit.
const SIG_ELEMENTS: u32 = 256;
const PUBKEY_BYTES: u32 = LEAVES_PER_KEY * 32; // 16384
const SIG_BYTES: u32 = SIG_ELEMENTS * 32; // 8192

// Instance-storage TTL bumps (~17280 ledgers/day on Stellar).
const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = DAY_IN_LEDGERS;
const TTL_EXTEND: u32 = 30 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    /// `public_key`, `signature`, or `proof` has the wrong length.
    BadSignatureShape = 2,
    /// leaf_index is outside the tree.
    InvalidLeaf = 3,
    /// The one-time leaf has already authorized an operation.
    LeafAlreadyUsed = 4,
    /// The hash-based signature does not verify against the stored root.
    SignatureInvalid = 5,
}

/// The signature payload the post-quantum key produces for `__check_auth`. It is
/// the flat Lamport+Merkle proof: `public_key` (512x32), `signature` (256x32),
/// and the Merkle authentication `proof` (height x32).
#[contracttype]
#[derive(Clone)]
pub struct PqSignature {
    pub leaf_index: u32,
    pub public_key: Bytes,
    pub signature: Bytes,
    pub proof: Bytes,
}

#[contracttype]
pub enum DataKey {
    /// Merkle root committing to the one-time keys — the post-quantum public key.
    Root,
    /// Tree height (proof depth = log2(leaf_count)).
    Height,
    /// One-time leaf spent flag; the replay guard.
    Used(u32),
}

#[contract]
pub struct PqVault;

#[contractimpl]
impl PqVault {
    /// Bind this vault to a post-quantum key at deploy time. `pqc_root` is the
    /// Merkle root; `tree_height` is log2 of the number of one-time keys.
    pub fn __constructor(env: Env, pqc_root: BytesN<32>, tree_height: u32) {
        let storage = env.storage().instance();
        storage.set(&DataKey::Root, &pqc_root);
        storage.set(&DataKey::Height, &tree_height);
        storage.extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    }

    /// The stored post-quantum public key (Merkle root).
    pub fn pqc_root(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::Root)
            .expect("not initialized")
    }

    /// The Merkle tree height (proof depth).
    pub fn tree_height(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Height)
            .expect("not initialized")
    }

    /// Whether a one-time leaf has already been spent.
    pub fn leaf_used(env: Env, leaf_index: u32) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Used(leaf_index))
            .unwrap_or(false)
    }
}

#[contractimpl]
impl CustomAccountInterface for PqVault {
    type Signature = PqSignature;
    type Error = Error;

    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signatures: PqSignature,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        let storage = env.storage().instance();
        let root: BytesN<32> = storage.get(&DataKey::Root).ok_or(Error::NotInitialized)?;
        let height: u32 = storage.get(&DataKey::Height).ok_or(Error::NotInitialized)?;

        let leaf = signatures.leaf_index;
        if leaf >= (1u32 << height) {
            return Err(Error::InvalidLeaf);
        }
        let used_key = DataKey::Used(leaf);
        if storage.get(&used_key).unwrap_or(false) {
            return Err(Error::LeafAlreadyUsed);
        }

        let message: [u8; 32] = signature_payload.to_array();
        verify(&env, &root, &message, leaf, height, &signatures)?;

        // Burn the one-time leaf so this signature can never be replayed.
        storage.set(&used_key, &true);
        storage.extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(())
    }
}

#[inline]
fn message_bit(message: &[u8; 32], i: usize) -> usize {
    ((message[i >> 3] >> (7 - (i & 7))) & 1) as usize
}

/// Verify a Lamport + Merkle signature against `root`. Mirrors
/// `packages/solana-vault/src/lib.rs::verify` and `hashsig.ts` byte-for-byte.
/// All hashing goes through the keccak256 host function; the only native buffers
/// are 32/64-byte scratch, so the contract stays well inside Soroban's budget.
fn verify(
    env: &Env,
    root: &BytesN<32>,
    message: &[u8; 32],
    leaf_index: u32,
    height: u32,
    sig: &PqSignature,
) -> Result<(), Error> {
    if sig.public_key.len() != PUBKEY_BYTES
        || sig.signature.len() != SIG_BYTES
        || sig.proof.len() != height * 32
    {
        return Err(Error::BadSignatureShape);
    }

    let crypto = env.crypto();

    // 1) Each revealed secret must hash to the committed public-key element.
    let mut committed = [0u8; 32];
    for i in 0..SIG_ELEMENTS {
        let secret = sig.signature.slice(i * 32..i * 32 + 32);
        let h: [u8; 32] = crypto.keccak256(&secret).to_array();
        let bit = message_bit(message, i as usize) as u32;
        let off = (2 * i + bit) * 32;
        sig.public_key.slice(off..off + 32).copy_into_slice(&mut committed);
        if h != committed {
            return Err(Error::SignatureInvalid);
        }
    }

    // 2) Leaf commit = keccak(all 512 public-key elements concatenated).
    let mut node: [u8; 32] = crypto.keccak256(&sig.public_key).to_array();

    // 3) Walk the Merkle authentication path up to the root.
    let mut sibling = [0u8; 32];
    let mut combined = [0u8; 64];
    let mut idx = leaf_index;
    for d in 0..height {
        sig.proof.slice(d * 32..d * 32 + 32).copy_into_slice(&mut sibling);
        if idx & 1 == 0 {
            combined[..32].copy_from_slice(&node);
            combined[32..].copy_from_slice(&sibling);
        } else {
            combined[..32].copy_from_slice(&sibling);
            combined[32..].copy_from_slice(&node);
        }
        node = crypto
            .keccak256(&Bytes::from_slice(env, &combined))
            .to_array();
        idx >>= 1;
    }

    if node != root.to_array() {
        return Err(Error::SignatureInvalid);
    }
    Ok(())
}

#[cfg(test)]
mod test;
