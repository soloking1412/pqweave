//! Emits cross-runtime fixtures (to fixtures.json) so the `@pqweave/sdk`
//! TypeScript client can be tested to match this program byte-for-byte.
//! Run: `cargo run --example fixtures`

use pqweave_vault::vault::withdraw_message;
use solana_program::pubkey::Pubkey;

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn main() {
    let root = [0x11u8; 32];
    let recipient = Pubkey::new_from_array([0x22u8; 32]);
    let amount = 123_456_789u64;
    let leaf = 7u32;
    let program_id = Pubkey::new_from_array([0x33u8; 32]);

    let message = withdraw_message(&root, &recipient, amount, leaf);
    let (pda, bump) = Pubkey::find_program_address(&[b"vault", &root], &program_id);

    let json = format!(
        "{{\n  \"root\": \"{}\",\n  \"recipient\": \"{}\",\n  \"amount\": {},\n  \"leaf\": {},\n  \"message\": \"{}\",\n  \"programId\": \"{}\",\n  \"pda\": \"{}\",\n  \"bump\": {}\n}}\n",
        hex(&root),
        hex(recipient.as_ref()),
        amount,
        leaf,
        hex(&message),
        hex(program_id.as_ref()),
        hex(pda.as_ref()),
        bump
    );
    std::fs::write("fixtures.json", &json).unwrap();
    println!("{json}");
}
