//! PQWeave Solana post-quantum vault (see `../../SOLANA_VAULT.md`).
//!
//! **Status: in development, not audited, not deployed.** This does NOT make a
//! Solana wallet quantum-safe — Solana's address *is* its Ed25519 public key and
//! cannot be hardened in place. This program holds funds in a program-owned PDA
//! that only releases them on a valid hash-based (Lamport + Merkle) one-time
//! signature, which a quantum computer cannot forge. It protects funds moved
//! into the vault, not the everyday wallet.
//!
//! The verifier mirrors `packages/sdk/src/pqc/hashsig.ts` and
//! `LamportMerkleVerifier.sol` byte-for-byte (keccak256), so one `@pqweave/sdk`
//! key works for both the EVM account and this vault.

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult,
    program_error::ProgramError, pubkey::Pubkey,
};

pub mod vault;

use solana_program::keccak;

/// Two hash commitments per message bit (256 bits) → 512 public-key elements.
pub const LEAVES_PER_KEY: usize = 512;
/// One revealed secret per message bit.
pub const SIG_ELEMENTS: usize = 256;
pub const PUBKEY_BYTES: usize = LEAVES_PER_KEY * 32; // 16384
pub const SIG_BYTES: usize = SIG_ELEMENTS * 32; // 8192

#[inline]
pub fn message_bit(message: &[u8], i: usize) -> usize {
    ((message[i >> 3] >> (7 - (i & 7))) & 1) as usize
}

/// Verify a Lamport + Merkle signature against `root`. `public_key` is 512×32,
/// `sig` is 256×32, `proof` is depth×32. Mirrors hashsig.ts / the EVM verifier.
pub fn verify(
    root: &[u8; 32],
    message: &[u8; 32],
    leaf_index: u32,
    public_key: &[u8],
    sig: &[u8],
    proof: &[u8],
) -> bool {
    if public_key.len() != PUBKEY_BYTES || sig.len() != SIG_BYTES || proof.len() % 32 != 0 {
        return false;
    }
    for i in 0..SIG_ELEMENTS {
        let secret = &sig[i * 32..i * 32 + 32];
        let bit = message_bit(message, i);
        let committed = &public_key[(2 * i + bit) * 32..(2 * i + bit) * 32 + 32];
        if keccak::hash(secret).0 != committed {
            return false;
        }
    }
    let refs: Vec<&[u8]> = (0..LEAVES_PER_KEY)
        .map(|i| &public_key[i * 32..i * 32 + 32])
        .collect();
    let mut node = keccak::hashv(&refs).0;
    let mut idx = leaf_index;
    for d in 0..proof.len() / 32 {
        let sibling = &proof[d * 32..d * 32 + 32];
        node = if idx & 1 == 0 {
            keccak::hashv(&[&node, sibling]).0
        } else {
            keccak::hashv(&[sibling, &node]).0
        };
        idx >>= 1;
    }
    &node == root
}

entrypoint!(process_instruction);

/// Instruction dispatch. The first byte of `data` selects the handler:
/// 0 initialize · 1 deposit · 2 stage_signature · 3 withdraw.
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        0 => vault::initialize(program_id, accounts, rest),
        1 => vault::deposit(program_id, accounts, rest),
        2 => vault::stage_signature(program_id, accounts, rest),
        3 => vault::withdraw(program_id, accounts, rest),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// Host-only key generation/signing, matching hashsig.ts. Used by unit tests in
/// this crate and the integration harness. Never compiled into the program.
#[cfg(test)]
pub(crate) mod testgen {
    use solana_program::keccak;

    fn word(i: u32) -> [u8; 32] {
        let mut w = [0u8; 32];
        w[28..].copy_from_slice(&i.to_be_bytes());
        w
    }
    fn derive_secrets(master: &[u8; 32], leaf: u32) -> Vec<[u8; 32]> {
        let seed = keccak::hashv(&[master, &word(leaf)]).0;
        (0..512u32).map(|i| keccak::hashv(&[&seed, &word(i)]).0).collect()
    }
    fn public_from(secrets: &[[u8; 32]]) -> Vec<[u8; 32]> {
        secrets.iter().map(|s| keccak::hash(s).0).collect()
    }
    fn leaf_commit(pubs: &[[u8; 32]]) -> [u8; 32] {
        let refs: Vec<&[u8]> = pubs.iter().map(|p| p.as_slice()).collect();
        keccak::hashv(&refs).0
    }
    fn all_leaves(master: &[u8; 32], n: u32) -> Vec<[u8; 32]> {
        (0..n).map(|j| leaf_commit(&public_from(&derive_secrets(master, j)))).collect()
    }
    fn next_level(nodes: &[[u8; 32]]) -> Vec<[u8; 32]> {
        (0..nodes.len() / 2)
            .map(|i| keccak::hashv(&[&nodes[2 * i], &nodes[2 * i + 1]]).0)
            .collect()
    }
    pub fn merkle_root(master: &[u8; 32], n: u32) -> [u8; 32] {
        let mut nodes = all_leaves(master, n);
        while nodes.len() > 1 {
            nodes = next_level(&nodes);
        }
        nodes[0]
    }
    fn merkle_proof(master: &[u8; 32], n: u32, index: u32) -> Vec<[u8; 32]> {
        let mut proof = vec![];
        let mut nodes = all_leaves(master, n);
        let mut idx = index as usize;
        while nodes.len() > 1 {
            proof.push(nodes[idx ^ 1]);
            nodes = next_level(&nodes);
            idx >>= 1;
        }
        proof
    }
    fn sign_one(msg: &[u8; 32], secrets: &[[u8; 32]]) -> Vec<[u8; 32]> {
        (0..256)
            .map(|i| secrets[2 * i + super::message_bit(msg, i)])
            .collect()
    }
    fn flat(v: &[[u8; 32]]) -> Vec<u8> {
        v.iter().flat_map(|x| x.to_vec()).collect()
    }

    /// (root, public_key_bytes, sig_bytes, proof_bytes) for a one-time signature.
    pub fn keygen_and_sign(
        master: &[u8; 32],
        tree_size: u32,
        message: &[u8; 32],
        leaf: u32,
    ) -> ([u8; 32], Vec<u8>, Vec<u8>, Vec<u8>) {
        let secrets = derive_secrets(master, leaf);
        (
            merkle_root(master, tree_size),
            flat(&public_from(&secrets)),
            flat(&sign_one(message, &secrets)),
            flat(&merkle_proof(master, tree_size, leaf)),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_cross_runtime_vector_and_reports_size() {
        // Same inputs as packages/sdk/scripts/gen-hashsig-vector.mjs.
        let master = keccak::hash(b"cross-runtime-master").0;
        let message = keccak::hash(b"authorize-1.5-eth-transfer").0;
        let (root, public, sig, proof) = testgen::keygen_and_sign(&master, 4, &message, 2);

        let hexed: String = root.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(
            hexed, "5d0efe09af54753206193066c17b92a1c2b066846cc37b86f85d1c2e6623c0fe",
            "Rust root must match the canonical EVM/TS vector root"
        );
        assert!(verify(&root, &message, 2, &public, &sig, &proof));

        let size = public.len() + sig.len() + proof.len();
        assert!(size > 1232, "signature must exceed the Solana tx cap (buffer staging)");
    }
}
