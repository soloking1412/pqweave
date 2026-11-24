import { type Address, decodeFunctionData, type PublicClient } from 'viem';
import { describe, expect, it } from 'vitest';
import { batchExecutorAbi, erc20Abi, migrationSweeperAbi } from '../src/account/index.js';
import {
  buildOneClickMigration,
  buildOneClickSweep,
  buildSelfSweepCalls,
  discoverErc20Balances,
  encodeBatchExecute,
  encodeSweeperCall,
} from '../src/migration/index.js';

const TO: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const FROM: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TOKEN_A: Address = '0x1111111111111111111111111111111111111111';
const TOKEN_B: Address = '0x2222222222222222222222222222222222222222';

describe('buildSelfSweepCalls', () => {
  it('builds transfer calls for tokens and a native transfer', () => {
    const calls = buildSelfSweepCalls({
      to: TO,
      from: FROM,
      native: 5n,
      erc20s: [{ token: TOKEN_A, amount: 100n }],
    });

    expect(calls).toHaveLength(2);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: calls[0]!.data });
    expect(decoded.functionName).toBe('transfer');
    expect(decoded.args).toEqual([TO, 100n]);
    expect(calls[1]).toEqual({ dest: TO, value: 5n, data: '0x' });
  });

  it('omits a zero native transfer', () => {
    const calls = buildSelfSweepCalls({
      to: TO,
      from: FROM,
      erc20s: [{ token: TOKEN_A, amount: 1n }],
    });
    expect(calls).toHaveLength(1);
  });
});

describe('one-click EIP-7702 migration', () => {
  it('builds a batch that sweeps tokens, NFTs, and native value', () => {
    const calls = buildOneClickSweep({
      to: TO,
      from: FROM,
      native: 9n,
      erc20s: [{ token: TOKEN_A, amount: 1000n }],
      erc721s: [{ token: TOKEN_B, tokenId: 7n }],
    });

    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual({ target: TO, value: 9n, data: '0x' });

    const erc20Call = decodeFunctionData({ abi: erc20Abi, data: calls[0]!.data });
    expect(erc20Call.functionName).toBe('transfer');
    expect(erc20Call.args).toEqual([TO, 1000n]);
  });

  it('encodes an executeBatch call that decodes back', () => {
    const migration = buildOneClickMigration(FROM, {
      to: TO,
      from: FROM,
      erc20s: [{ token: TOKEN_A, amount: 5n }],
    });
    expect(migration.delegate).toBe(FROM);

    const decoded = decodeFunctionData({ abi: batchExecutorAbi, data: migration.data });
    expect(decoded.functionName).toBe('executeBatch');
    expect(decoded.args[0]).toHaveLength(1);
    expect(decoded.args[0]![0]!.target).toBe(TOKEN_A);
  });

  it('encodeBatchExecute round-trips an empty batch', () => {
    const data = encodeBatchExecute([]);
    const decoded = decodeFunctionData({ abi: batchExecutorAbi, data });
    expect(decoded.args[0]).toEqual([]);
  });
});

describe('encodeSweeperCall', () => {
  it('encodes a sweep that decodes back to its plan', () => {
    const data = encodeSweeperCall({ to: TO, erc20s: [{ token: TOKEN_A, amount: 0n }] });
    const decoded = decodeFunctionData({ abi: migrationSweeperAbi, data });
    expect(decoded.functionName).toBe('sweep');
    expect(decoded.args[0]).toBe(TO);
    expect(decoded.args[1]).toEqual([{ token: TOKEN_A, amount: 0n }]);
  });
});

describe('discoverErc20Balances', () => {
  it('returns only non-zero balances', async () => {
    const client = {
      multicall: async () => [
        { status: 'success', result: 500n },
        { status: 'success', result: 0n },
      ],
    } as unknown as PublicClient;

    const holdings = await discoverErc20Balances(client, FROM, [TOKEN_A, TOKEN_B]);
    expect(holdings).toEqual([{ token: TOKEN_A, amount: 500n }]);
  });

  it('fails closed when a listed token balance cannot be read in strict mode', async () => {
    const client = {
      multicall: async () => [{ status: 'failure', error: new Error('RPC failed') }],
    } as unknown as PublicClient;
    await expect(discoverErc20Balances(client, FROM, [TOKEN_A], true)).rejects.toThrow(TOKEN_A);
  });
});

describe('strict token response completeness', () => {
  it('rejects truncated and malformed balance responses', async () => {
    for (const results of [
      [],
      [{ status: 'success', result: -1n }],
      [{ status: 'success', result: 12 }],
    ]) {
      const client = { multicall: async () => results } as unknown as PublicClient;
      await expect(discoverErc20Balances(client, FROM, [TOKEN_A], true)).rejects.toThrow();
    }
  });
});
