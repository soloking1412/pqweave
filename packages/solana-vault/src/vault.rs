//! The PQWeave Solana vault instructions. Funds live on a program-owned PDA and
//! are released only against a valid Lamport+Merkle one-time signature.
//!
//! State account layout (PDA `["vault", pqc_root]`):
//!   [0..32]  pqc_root (Merkle root = the post-quantum public key)
//!   [32..36] leaf_count (u32 LE, power of two)
//!   [36]     height (proof depth = log2(leaf_count))
//!   [37]     bump
//!   [38..]   used_leaves bitmap (ceil(leaf_count / 8) bytes)

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    keccak,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

use crate::{verify, PUBKEY_BYTES, SIG_BYTES};

const HEADER: usize = 38;
const VAULT_SEED: &[u8] = b"vault";
/// Domain separator so a vault signature can never be replayed elsewhere.
const WITHDRAW_DOMAIN: &[u8] = b"PQWEAVE_SOLANA_VAULT_v1";

fn state_size(leaf_count: u32) -> usize {
    HEADER + ((leaf_count as usize) + 7) / 8
}

/// The 32-byte digest the post-quantum key signs to authorize a withdrawal. It
/// binds the signature to this vault, recipient, amount, and one-time leaf, so it
/// cannot be replayed for a different transfer.
pub fn withdraw_message(
    pqc_root: &[u8; 32],
    recipient: &Pubkey,
    amount: u64,
    leaf_index: u32,
) -> [u8; 32] {
    keccak::hashv(&[
        WITHDRAW_DOMAIN,
        pqc_root,
        recipient.as_ref(),
        &amount.to_le_bytes(),
        &leaf_index.to_le_bytes(),
    ])
    .0
}

pub fn is_leaf_used(bitmap: &[u8], leaf_index: u32) -> bool {
    let byte = (leaf_index / 8) as usize;
    byte < bitmap.len() && (bitmap[byte] >> (leaf_index % 8)) & 1 == 1
}

pub fn mark_leaf_used(bitmap: &mut [u8], leaf_index: u32) {
    bitmap[(leaf_index / 8) as usize] |= 1 << (leaf_index % 8);
}

/// `initialize`: create and seed the vault state PDA. data = [root:32][leaf_count:u32 LE].
/// accounts = [payer (signer, writable), vault PDA (writable), system_program].
pub fn initialize(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 36 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut root = [0u8; 32];
    root.copy_from_slice(&data[0..32]);
    let leaf_count = u32::from_le_bytes(data[32..36].try_into().unwrap());
    if !leaf_count.is_power_of_two() {
        return Err(ProgramError::InvalidInstructionData);
    }
    let height = leaf_count.trailing_zeros() as u8;

    let mut it = accounts.iter();
    let payer = next_account_info(&mut it)?;
    let vault = next_account_info(&mut it)?;
    let system_program = next_account_info(&mut it)?;

    let (pda, bump) = Pubkey::find_program_address(&[VAULT_SEED, &root], program_id);
    if &pda != vault.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let size = state_size(leaf_count);
    let lamports = Rent::get()?.minimum_balance(size);
    invoke_signed(
        &system_instruction::create_account(payer.key, vault.key, lamports, size as u64, program_id),
        &[payer.clone(), vault.clone(), system_program.clone()],
        &[&[VAULT_SEED, &root, &[bump]]],
    )?;

    let mut s = vault.try_borrow_mut_data()?;
    s[0..32].copy_from_slice(&root);
    s[32..36].copy_from_slice(&leaf_count.to_le_bytes());
    s[36] = height;
    s[37] = bump;
    Ok(())
}

/// `deposit`: move SOL into the vault PDA (the sweep). data = [amount:u64 LE].
/// accounts = [depositor (signer, writable), vault PDA (writable), system_program].
pub fn deposit(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let mut it = accounts.iter();
    let depositor = next_account_info(&mut it)?;
    let vault = next_account_info(&mut it)?;
    let system_program = next_account_info(&mut it)?;
    invoke(
        &system_instruction::transfer(depositor.key, vault.key, amount),
        &[depositor.clone(), vault.clone(), system_program.clone()],
    )
}

/// `stage_signature`: write a chunk of the ~24 KB signature into the buffer
/// account (the signature is far too large for one transaction). data =
/// [offset:u16 LE][chunk…]. accounts = [buffer (writable, program-owned)].
pub fn stage_signature(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 2 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = u16::from_le_bytes(data[0..2].try_into().unwrap()) as usize;
    let chunk = &data[2..];
    let buffer = next_account_info(&mut accounts.iter())?;
    if buffer.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    let mut buf = buffer.try_borrow_mut_data()?;
    if offset.saturating_add(chunk.len()) > buf.len() {
        return Err(ProgramError::AccountDataTooSmall);
    }
    buf[offset..offset + chunk.len()].copy_from_slice(chunk);
    Ok(())
}

/// `withdraw`: verify the staged post-quantum signature, burn the one-time leaf,
/// and release lamports. data = [amount:u64 LE][leaf_index:u32 LE].
/// accounts = [vault PDA (writable), buffer (writable, program-owned), recipient (writable)].
pub fn withdraw(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 12 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let leaf_index = u32::from_le_bytes(data[8..12].try_into().unwrap());

    let mut it = accounts.iter();
    let vault = next_account_info(&mut it)?;
    let buffer = next_account_info(&mut it)?;
    let recipient = next_account_info(&mut it)?;
    if vault.owner != program_id || buffer.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }

    let (root, leaf_count, height) = {
        let s = vault.try_borrow_data()?;
        if s.len() < HEADER {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut root = [0u8; 32];
        root.copy_from_slice(&s[0..32]);
        (
            root,
            u32::from_le_bytes(s[32..36].try_into().unwrap()),
            s[36] as usize,
        )
    };
    if leaf_index >= leaf_count {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Verify the post-quantum signature staged in the buffer.
    {
        let buf = buffer.try_borrow_data()?;
        let need = PUBKEY_BYTES + SIG_BYTES + height * 32;
        if buf.len() < need {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let public_key = &buf[0..PUBKEY_BYTES];
        let sig = &buf[PUBKEY_BYTES..PUBKEY_BYTES + SIG_BYTES];
        let proof = &buf[PUBKEY_BYTES + SIG_BYTES..need];
        let message = withdraw_message(&root, recipient.key, amount, leaf_index);
        if !verify(&root, &message, leaf_index, public_key, sig, proof) {
            return Err(ProgramError::Custom(1)); // bad signature
        }
    }

    // Enforce one-time use: reject a reused leaf, then burn it.
    {
        let mut s = vault.try_borrow_mut_data()?;
        let bitmap = &mut s[HEADER..];
        if is_leaf_used(bitmap, leaf_index) {
            return Err(ProgramError::Custom(2)); // leaf already spent
        }
        mark_leaf_used(bitmap, leaf_index);
    }

    // Release lamports, keeping the vault rent-exempt.
    let rent_min = Rent::get()?.minimum_balance(vault.data_len());
    let remaining = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(ProgramError::InsufficientFunds)?;
    if remaining < rent_min {
        return Err(ProgramError::InsufficientFunds);
    }
    **vault.try_borrow_mut_lamports()? -= amount;
    **recipient.try_borrow_mut_lamports()? += amount;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testgen;

    #[test]
    fn withdraw_message_binds_all_fields() {
        let root = [7u8; 32];
        let r1 = Pubkey::new_from_array([1u8; 32]);
        let r2 = Pubkey::new_from_array([2u8; 32]);
        let base = withdraw_message(&root, &r1, 100, 3);
        assert_eq!(base, withdraw_message(&root, &r1, 100, 3), "deterministic");
        assert_ne!(base, withdraw_message(&root, &r2, 100, 3), "recipient bound");
        assert_ne!(base, withdraw_message(&root, &r1, 101, 3), "amount bound");
        assert_ne!(base, withdraw_message(&root, &r1, 100, 4), "leaf bound");
    }

    #[test]
    fn leaf_bitmap_guard() {
        let mut bitmap = [0u8; 8]; // 64 leaves
        assert!(!is_leaf_used(&bitmap, 7));
        mark_leaf_used(&mut bitmap, 7);
        assert!(is_leaf_used(&bitmap, 7));
        assert!(!is_leaf_used(&bitmap, 8));
        mark_leaf_used(&mut bitmap, 63);
        assert!(is_leaf_used(&bitmap, 63));
    }

    // A signature the client produces for a withdrawal must verify on-chain.
    #[test]
    fn withdraw_signature_round_trips() {
        let master = keccak::hash(b"vault-withdraw-roundtrip").0;
        let tree = 64u32;
        let leaf = 9u32;
        let recipient = Pubkey::new_from_array([42u8; 32]);
        let amount = 5_000_000u64;

        let root = testgen::merkle_root(&master, tree);
        let message = withdraw_message(&root, &recipient, amount, leaf);
        let (root2, public, sig, proof) = testgen::keygen_and_sign(&master, tree, &message, leaf);

        assert_eq!(root, root2);
        assert!(verify(&root, &message, leaf, &public, &sig, &proof));
        // A different amount must NOT verify against this signature.
        let tampered = withdraw_message(&root, &recipient, amount + 1, leaf);
        assert!(!verify(&root, &tampered, leaf, &public, &sig, &proof));
    }
}
