//! Host tests for the Stellar post-quantum vault. Drives `__check_auth` through
//! the real Soroban `Env`, proving the Lamport+Merkle verifier matches the
//! canonical cross-runtime vector (shared with the EVM verifier and the Solana
//! vault), enforces one-time leaves, rejects tampering, and stays inside
//! Soroban's per-transaction CPU budget.

extern crate std;

use soroban_sdk::auth::Context;
use soroban_sdk::{Bytes, BytesN, Env, IntoVal, Val, Vec};
use std::string::String;
use std::vec::Vec as StdVec;

use crate::{Error, PqSignature, PqVault};

use sha3::{Digest, Keccak256};

// ---- off-chain key generation, mirroring packages/sdk/src/pqc/hashsig.ts ----

fn keccak(parts: &[&[u8]]) -> [u8; 32] {
    let mut h = Keccak256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

fn word(i: u32) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[28..].copy_from_slice(&i.to_be_bytes());
    w
}

fn derive_secrets(master: &[u8; 32], leaf: u32) -> StdVec<[u8; 32]> {
    let seed = keccak(&[master, &word(leaf)]);
    (0..512u32).map(|i| keccak(&[&seed, &word(i)])).collect()
}

fn public_from(secrets: &[[u8; 32]]) -> StdVec<[u8; 32]> {
    secrets.iter().map(|s| keccak(&[s])).collect()
}

fn leaf_commit(pubs: &[[u8; 32]]) -> [u8; 32] {
    let refs: StdVec<&[u8]> = pubs.iter().map(|p| p.as_slice()).collect();
    keccak(&refs)
}

fn all_leaves(master: &[u8; 32], n: u32) -> StdVec<[u8; 32]> {
    (0..n)
        .map(|j| leaf_commit(&public_from(&derive_secrets(master, j))))
        .collect()
}

fn next_level(nodes: &[[u8; 32]]) -> StdVec<[u8; 32]> {
    (0..nodes.len() / 2)
        .map(|i| keccak(&[&nodes[2 * i], &nodes[2 * i + 1]]))
        .collect()
}

fn merkle_root(master: &[u8; 32], n: u32) -> [u8; 32] {
    let mut nodes = all_leaves(master, n);
    while nodes.len() > 1 {
        nodes = next_level(&nodes);
    }
    nodes[0]
}

fn merkle_proof(master: &[u8; 32], n: u32, index: u32) -> StdVec<[u8; 32]> {
    let mut proof = StdVec::new();
    let mut nodes = all_leaves(master, n);
    let mut idx = index as usize;
    while nodes.len() > 1 {
        proof.push(nodes[idx ^ 1]);
        nodes = next_level(&nodes);
        idx >>= 1;
    }
    proof
}

fn message_bit(msg: &[u8; 32], i: usize) -> usize {
    ((msg[i >> 3] >> (7 - (i & 7))) & 1) as usize
}

fn sign_one(msg: &[u8; 32], secrets: &[[u8; 32]]) -> StdVec<[u8; 32]> {
    (0..256).map(|i| secrets[2 * i + message_bit(msg, i)]).collect()
}

fn flatten(v: &[[u8; 32]]) -> StdVec<u8> {
    let mut out = StdVec::with_capacity(v.len() * 32);
    for x in v {
        out.extend_from_slice(x);
    }
    out
}

/// (root, public_key(16384), signature(8192), proof(height*32)) for one leaf.
fn keygen_and_sign(
    master: &[u8; 32],
    tree_size: u32,
    message: &[u8; 32],
    leaf: u32,
) -> ([u8; 32], StdVec<u8>, StdVec<u8>, StdVec<u8>) {
    let secrets = derive_secrets(master, leaf);
    (
        merkle_root(master, tree_size),
        flatten(&public_from(&secrets)),
        flatten(&sign_one(message, &secrets)),
        flatten(&merkle_proof(master, tree_size, leaf)),
    )
}

fn to_hex(b: &[u8]) -> String {
    let mut s = String::new();
    for x in b {
        s.push_str(&std::format!("{x:02x}"));
    }
    s
}

fn tree_height(tree_size: u32) -> u32 {
    tree_size.trailing_zeros()
}

fn build_sig(env: &Env, leaf: u32, pk: &[u8], sig: &[u8], proof: &[u8]) -> Val {
    let pqsig = PqSignature {
        leaf_index: leaf,
        public_key: Bytes::from_slice(env, pk),
        signature: Bytes::from_slice(env, sig),
        proof: Bytes::from_slice(env, proof),
    };
    pqsig.into_val(env)
}

fn empty_contexts(env: &Env) -> Vec<Context> {
    Vec::new(env)
}

// ---------------------------------- tests ----------------------------------

#[test]
fn cross_runtime_vector_and_valid_auth() {
    let env = Env::default();

    // Same inputs as packages/solana-vault/src/lib.rs and the canonical EVM/TS
    // vector: master = keccak("cross-runtime-master"), message =
    // keccak("authorize-1.5-eth-transfer"), tree 4, leaf 2.
    let master = keccak(&[b"cross-runtime-master"]);
    let message = keccak(&[b"authorize-1.5-eth-transfer"]);
    let tree_size = 4u32;
    let leaf = 2u32;

    let (root, pk, sig, proof) = keygen_and_sign(&master, tree_size, &message, leaf);
    assert_eq!(
        to_hex(&root),
        "5d0efe09af54753206193066c17b92a1c2b066846cc37b86f85d1c2e6623c0fe",
        "Stellar root must match the canonical EVM/Solana/TS vector root"
    );

    let root_bn = BytesN::from_array(&env, &root);
    let vault = env.register(PqVault, (root_bn, tree_height(tree_size)));

    let payload = BytesN::from_array(&env, &message);
    let sig_val = build_sig(&env, leaf, &pk, &sig, &proof);
    let res = env.try_invoke_contract_check_auth::<Error>(
        &vault,
        &payload,
        sig_val,
        &empty_contexts(&env),
    );
    assert!(res.is_ok(), "valid post-quantum signature must authorize: {res:?}");

    // The one-time leaf is now burned.
    let used = env.as_contract(&vault, || PqVault::leaf_used(env.clone(), leaf));
    assert!(used, "leaf must be marked used after a successful auth");
}

#[test]
fn replay_is_rejected() {
    let env = Env::default();
    let master = keccak(&[b"replay-master"]);
    let message = keccak(&[b"authorize-payment"]);
    let tree_size = 4u32;
    let leaf = 1u32;

    let (root, pk, sig, proof) = keygen_and_sign(&master, tree_size, &message, leaf);
    let root_bn = BytesN::from_array(&env, &root);
    let vault = env.register(PqVault, (root_bn, tree_height(tree_size)));
    let payload = BytesN::from_array(&env, &message);

    let first = env.try_invoke_contract_check_auth::<Error>(
        &vault,
        &payload,
        build_sig(&env, leaf, &pk, &sig, &proof),
        &empty_contexts(&env),
    );
    assert!(first.is_ok(), "first use should authorize: {first:?}");

    let second = env.try_invoke_contract_check_auth::<Error>(
        &vault,
        &payload,
        build_sig(&env, leaf, &pk, &sig, &proof),
        &empty_contexts(&env),
    );
    match second {
        Err(Ok(Error::LeafAlreadyUsed)) => {}
        other => panic!("replay must be rejected as LeafAlreadyUsed, got {other:?}"),
    }
}

#[test]
fn tampered_payload_is_rejected() {
    let env = Env::default();
    let master = keccak(&[b"tamper-master"]);
    let signed_message = keccak(&[b"authorize-100-usdc"]);
    let attacker_message = keccak(&[b"authorize-1000000-usdc"]);
    let tree_size = 4u32;
    let leaf = 3u32;

    // Signature is produced over `signed_message`...
    let (root, pk, sig, proof) = keygen_and_sign(&master, tree_size, &signed_message, leaf);
    let root_bn = BytesN::from_array(&env, &root);
    let vault = env.register(PqVault, (root_bn, tree_height(tree_size)));

    // ...but presented against a different payload. Must not verify.
    let payload = BytesN::from_array(&env, &attacker_message);
    let res = env.try_invoke_contract_check_auth::<Error>(
        &vault,
        &payload,
        build_sig(&env, leaf, &pk, &sig, &proof),
        &empty_contexts(&env),
    );
    match res {
        Err(Ok(Error::SignatureInvalid)) => {}
        other => panic!("tampered payload must be SignatureInvalid, got {other:?}"),
    }
}

#[test]
fn verify_stays_within_cpu_budget() {
    let env = Env::default();
    let master = keccak(&[b"budget-master"]);
    let message = keccak(&[b"authorize-budget-check"]);
    let tree_size = 16u32; // deeper tree than the vector, still cheap
    let leaf = 9u32;

    let (root, pk, sig, proof) = keygen_and_sign(&master, tree_size, &message, leaf);
    let root_bn = BytesN::from_array(&env, &root);
    let vault = env.register(PqVault, (root_bn, tree_height(tree_size)));
    let payload = BytesN::from_array(&env, &message);

    let res = env.try_invoke_contract_check_auth::<Error>(
        &vault,
        &payload,
        build_sig(&env, leaf, &pk, &sig, &proof),
        &empty_contexts(&env),
    );
    assert!(res.is_ok(), "budget-test auth must succeed: {res:?}");

    let budget = env.cost_estimate().budget();
    let cpu = budget.cpu_instruction_cost();
    let mem = budget.memory_bytes_cost();
    std::println!("check_auth cumulative cost — CPU: {cpu} instructions, MEM: {mem} bytes");
    // Stellar's per-transaction ceiling is 100,000,000 CPU instructions. The full
    // verify (256 keccak reveals + leaf commit + Merkle path) must fit with room
    // to spare, since the SAC transfer runs in the same transaction.
    assert!(
        cpu < 100_000_000,
        "verify must fit the per-tx CPU budget, used {cpu}"
    );
}
