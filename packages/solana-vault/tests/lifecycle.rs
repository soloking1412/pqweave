//! Full on-chain lifecycle for the PQWeave Solana vault:
//! initialize → deposit → withdraw (post-quantum signature) → replay is rejected.
//!
//! Requires a working `cargo build-sbf` (platform-tools ≥ Agave 2.3 — see
//! README "Toolchain note"). Run with:  cargo build-sbf && cargo test -- --nocapture
//! The buffer is pre-staged here via `add_account`; on a real client the 24 KB
//! signature is uploaded with the `stage_signature` instruction in ~900 B chunks.

use solana_program::keccak;
use solana_program_test::ProgramTest;
use solana_sdk::{
    account::Account,
    compute_budget::ComputeBudgetInstruction,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};

const PUBKEY_BYTES: usize = 512 * 32;
const SIG_BYTES: usize = 256 * 32;

// --- client-side keygen/sign, matching hashsig.ts (host only) ---
fn word(i: u32) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[28..].copy_from_slice(&i.to_be_bytes());
    w
}
fn secrets(master: &[u8; 32], leaf: u32) -> Vec<[u8; 32]> {
    let seed = keccak::hashv(&[master, &word(leaf)]).0;
    (0..512u32).map(|i| keccak::hashv(&[&seed, &word(i)]).0).collect()
}
fn public_from(s: &[[u8; 32]]) -> Vec<[u8; 32]> {
    s.iter().map(|x| keccak::hash(x).0).collect()
}
fn leaf_commit(p: &[[u8; 32]]) -> [u8; 32] {
    let refs: Vec<&[u8]> = p.iter().map(|x| x.as_slice()).collect();
    keccak::hashv(&refs).0
}
fn leaves(master: &[u8; 32], n: u32) -> Vec<[u8; 32]> {
    (0..n).map(|j| leaf_commit(&public_from(&secrets(master, j)))).collect()
}
fn level(nodes: &[[u8; 32]]) -> Vec<[u8; 32]> {
    (0..nodes.len() / 2).map(|i| keccak::hashv(&[&nodes[2 * i], &nodes[2 * i + 1]]).0).collect()
}
fn root_of(master: &[u8; 32], n: u32) -> [u8; 32] {
    let mut x = leaves(master, n);
    while x.len() > 1 {
        x = level(&x);
    }
    x[0]
}
fn proof_of(master: &[u8; 32], n: u32, index: u32) -> Vec<[u8; 32]> {
    let (mut p, mut x, mut idx) = (vec![], leaves(master, n), index as usize);
    while x.len() > 1 {
        p.push(x[idx ^ 1]);
        x = level(&x);
        idx >>= 1;
    }
    p
}
fn bit(m: &[u8], i: usize) -> usize {
    ((m[i >> 3] >> (7 - (i & 7))) & 1) as usize
}
fn withdraw_message(root: &[u8; 32], recipient: &Pubkey, amount: u64, leaf: u32) -> [u8; 32] {
    keccak::hashv(&[
        b"PQWEAVE_SOLANA_VAULT_v1",
        root,
        recipient.as_ref(),
        &amount.to_le_bytes(),
        &leaf.to_le_bytes(),
    ])
    .0
}

#[tokio::test]
async fn vault_lifecycle() {
    let program_id = Pubkey::new_unique();
    let mut pt = ProgramTest::new("pqweave_vault", program_id, None);

    let master = keccak::hash(b"pqweave-vault-lifecycle").0;
    let tree = 64u32;
    let leaf = 5u32;
    let recipient = Pubkey::new_unique();
    let withdraw_amount = 2_000_000u64;

    let root = root_of(&master, tree);
    let msg = withdraw_message(&root, &recipient, withdraw_amount, leaf);
    let sec = secrets(&master, leaf);
    let public: Vec<u8> = public_from(&sec).iter().flat_map(|x| x.to_vec()).collect();
    let sig: Vec<u8> = (0..256)
        .flat_map(|i| sec[2 * i + bit(&msg, i)].to_vec())
        .collect();
    let proof: Vec<u8> = proof_of(&master, tree, leaf).iter().flat_map(|x| x.to_vec()).collect();

    // Pre-stage the signature buffer (a real client uploads it via stage_signature).
    let mut blob = Vec::new();
    blob.extend_from_slice(&public);
    blob.extend_from_slice(&sig);
    blob.extend_from_slice(&proof);
    let buffer = Pubkey::new_unique();
    pt.add_account(
        buffer,
        Account { lamports: 1_000_000_000, data: blob, owner: program_id, executable: false, rent_epoch: 0 },
    );

    let (banks, payer, recent) = pt.start().await;
    let (vault, _bump) = Pubkey::find_program_address(&[b"vault", &root], &program_id);

    // 1. initialize
    let mut init = vec![0u8];
    init.extend_from_slice(&root);
    init.extend_from_slice(&tree.to_le_bytes());
    let init_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: init,
    };

    // 2. deposit 1 SOL into the vault
    let mut dep = vec![1u8];
    dep.extend_from_slice(&1_000_000_000u64.to_le_bytes());
    let dep_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: dep,
    };

    let tx = Transaction::new_signed_with_payer(
        &[init_ix, dep_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent,
    );
    banks.process_transaction(tx).await.unwrap();

    // 3. withdraw against the post-quantum signature
    let mut wd = vec![3u8];
    wd.extend_from_slice(&withdraw_amount.to_le_bytes());
    wd.extend_from_slice(&leaf.to_le_bytes());
    let withdraw_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(vault, false),
            AccountMeta::new(buffer, false),
            AccountMeta::new(recipient, false),
        ],
        data: wd,
    };
    let recent2 = banks.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[ComputeBudgetInstruction::set_compute_unit_limit(1_400_000), withdraw_ix.clone()],
        Some(&payer.pubkey()),
        &[&payer],
        recent2,
    );
    let meta = banks.process_transaction_with_metadata(tx).await.unwrap();
    assert!(meta.result.is_ok(), "withdraw failed: {:?}", meta.result);
    println!("withdraw compute units: {}", meta.metadata.unwrap().compute_units_consumed);

    let bal = banks.get_balance(recipient).await.unwrap();
    assert_eq!(bal, withdraw_amount, "recipient must receive the withdrawal");

    // 4. replay with the same one-time leaf must be rejected
    let recent3 = banks.get_latest_blockhash().await.unwrap();
    let replay = Transaction::new_signed_with_payer(
        &[ComputeBudgetInstruction::set_compute_unit_limit(1_400_000), withdraw_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent3,
    );
    assert!(
        banks.process_transaction(replay).await.is_err(),
        "reusing a one-time leaf must fail"
    );
    let _ = Keypair::new();
}
