import { describe, expect, it } from 'vitest';
import { hexToBytes, keccak256, toHex } from 'viem';
import {
  chunkSignature,
  depositData,
  findVaultPda,
  initializeData,
  PUBKEY_BYTES,
  serializeSignature,
  SIG_BYTES,
  signWithdrawal,
  stageSignatureData,
  VAULT_INSTRUCTION,
  withdrawData,
  withdrawMessage,
} from '../src/solana-vault/index.js';
import {
  createHashSigKey,
  decodeHashSig,
  HashSigSigner,
  signHashSig,
  verifyHashSig,
} from '../src/pqc/hashsig.js';

const filled = (byte: number) => new Uint8Array(32).fill(byte);
const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

// Fixtures emitted by packages/solana-vault `cargo run --example fixtures`.
describe('solana vault client (cross-runtime parity)', () => {
  it('withdrawMessage matches the on-chain program byte-for-byte', () => {
    const message = withdrawMessage(filled(0x11), filled(0x22), 123_456_789n, 7);
    expect(hex(message)).toBe('d479e3d15f63144f3a32325b26f925875905e0ed0f023bd52fc141784c08a666');
  });

  it('findVaultPda matches Solana find_program_address', () => {
    const { pda, bump } = findVaultPda(filled(0x11), filled(0x33));
    expect(hex(pda)).toBe('a6939b87734eb401b6bceb58905d9062bac668056d9d8d52b1d221a567e30cbb');
    expect(bump).toBe(253);
  });
});

describe('solana vault instruction data', () => {
  it('encodes each instruction with the right tag and layout', () => {
    const init = initializeData(filled(0xaa), 64);
    expect(init[0]).toBe(VAULT_INSTRUCTION.Initialize);
    expect(init.length).toBe(1 + 32 + 4);

    const dep = depositData(1000n);
    expect(dep[0]).toBe(VAULT_INSTRUCTION.Deposit);
    expect(dep.length).toBe(1 + 8);

    const wd = withdrawData(2000n, 5);
    expect(wd[0]).toBe(VAULT_INSTRUCTION.Withdraw);
    expect(wd.length).toBe(1 + 8 + 4);

    const stage = stageSignatureData(900, new Uint8Array(100));
    expect(stage[0]).toBe(VAULT_INSTRUCTION.StageSignature);
    expect(stage.length).toBe(1 + 2 + 100);
  });
});

describe('solana vault signature serialization', () => {
  it('serializes a verifiable signature into the buffer layout and chunks it', () => {
    const key = createHashSigKey(keccak256(toHex('vault-client-test')), 16); // depth 4
    const recipient = filled(0xab);
    const amount = 7_000_000n;
    const leaf = 3;
    const message = withdrawMessage(hexToBytes(key.root), recipient, amount, leaf);
    const abiSig = signHashSig(key, toHex(message), leaf);
    expect(verifyHashSig(key.root, toHex(message), abiSig)).toBe(true);

    const blob = serializeSignature(decodeHashSig(abiSig));
    expect(blob.length).toBe(PUBKEY_BYTES + SIG_BYTES + 4 * 32);

    const chunks = chunkSignature(blob);
    const reassembled = new Uint8Array(blob.length);
    for (const c of chunks) reassembled.set(c.data, c.offset);
    expect(reassembled).toEqual(blob);
  });

  it('signWithdrawal consumes the next one-time leaf and advances the counter', () => {
    const signer = HashSigSigner.create(keccak256(toHex('vault-signer-test')), 16);
    expect(signer.nextLeafIndex).toBe(0);
    const w = signWithdrawal(signer, {
      pqcRoot: hexToBytes(signer.root),
      recipient: filled(0xcd),
      amount: 1_000_000n,
    });
    expect(w.leafIndex).toBe(0);
    expect(signer.nextLeafIndex).toBe(1);
    expect(w.message.length).toBe(32);
    expect(w.signature.length).toBe(PUBKEY_BYTES + SIG_BYTES + 4 * 32);
  });
});
