import { describe, expect, it } from 'vitest';
import { keccak256, zeroAddress, type Address, type Hex, type PublicClient } from 'viem';
import {
  buildEthereumTransferPlan,
  revalidateEthereumTransferPlan,
  type EthereumTransferRequest,
} from '../src/migration/ethereum.js';

const a = (digit: string) => `0x${digit.repeat(40)}` as Address;
const hash = keccak256('0x1234');
const request: EthereumTransferRequest = {
  source: a('1'),
  destination: {
    chainId: 1,
    account: a('2'),
    verifier: a('3'),
    entryPoint: a('4'),
    root: hash,
    accountCodeHash: hash,
    verifierCodeHash: hash,
    entryPointCodeHash: hash,
  },
  tokens: [a('5')],
  nativeWei: 10n,
  gasReserveWei: 1n,
};
function rpc(
  options: {
    chain?: number;
    owner?: Address;
    code?: Hex;
    balance?: bigint;
    token?: bigint;
    root?: Hex;
    failToken?: boolean;
    blockHash?: Hex;
  } = {},
) {
  const reads: unknown[] = [];
  return {
    reads,
    client: {
      getChainId: async () => options.chain ?? 1,
      getBlock: async () => ({ number: 5n, hash: options.blockHash ?? hash }),
      getCode: async (args: unknown) => {
        reads.push(args);
        return options.code ?? '0x1234';
      },
      getBalance: async (args: unknown) => {
        reads.push(args);
        return options.balance ?? 100n;
      },
      readContract: async (args: { functionName: string }) => {
        reads.push(args);
        switch (args.functionName) {
          case 'owner':
            return options.owner ?? zeroAddress;
          case 'pqcPublicKey':
            return options.root ?? hash;
          case 'pqcVerifier':
            return request.destination.verifier;
          case 'entryPoint':
            return request.destination.entryPoint;
          case 'balanceOf':
            if (options.failToken) throw new Error('token unreadable');
            return options.token ?? 500n;
        }
      },
    } as unknown as PublicClient,
  };
}

describe('Ethereum migration preparation', () => {
  it('pins code, authority, balance and inventory to one mined block', async () => {
    const { client, reads } = rpc();
    const plan = await buildEthereumTransferPlan(client, request, 1000);
    expect(plan.transfers).toHaveLength(2);
    expect(plan.transfers[1]).toEqual({ target: a('2'), value: 10n, data: '0x' });
    expect(plan.expiresAt).toBe(601000);
    expect(reads.every((r) => (r as { blockNumber: bigint }).blockNumber === 5n)).toBe(true);
    expect((await revalidateEthereumTransferPlan(client, plan, 2000)).transfers).toEqual(
      plan.transfers,
    );
  });
  it.each([
    { chain: 11155111 },
    { owner: a('6') },
    { code: '0x' as Hex },
    { code: '0xabcd' as Hex },
    { code: `0xef0100${'33'.repeat(20)}` as Hex },
    { root: keccak256('0xabcd') },
    { balance: 10n },
    { failToken: true },
  ])('fails closed on destination or inventory mismatch %#', async (options) => {
    await expect(buildEthereumTransferPlan(rpc(options).client, request)).rejects.toThrow();
  });
  it('refuses duplicates, self-transfer, empty inventory and invalid amounts', async () => {
    for (const change of [
      { tokens: [a('5'), a('5')] },
      { source: a('2') },
      { source: zeroAddress },
      { nativeWei: -1n },
      { gasReserveWei: 0n },
      { tokens: [], nativeWei: 0n },
    ])
      await expect(
        buildEthereumTransferPlan(rpc().client, { ...request, ...change }),
      ).rejects.toThrow();
  });
  it('requires fresh review after expiry, reorg or changed token inventory', async () => {
    const plan = await buildEthereumTransferPlan(rpc().client, request, 1000);
    await expect(revalidateEthereumTransferPlan(rpc().client, plan, 601000)).rejects.toThrow(
      'expired',
    );
    await expect(revalidateEthereumTransferPlan(rpc().client, plan, 999)).rejects.toThrow('clock');
    await expect(
      revalidateEthereumTransferPlan(rpc({ blockHash: keccak256('0xaa') }).client, plan, 2000),
    ).rejects.toThrow('reorganized');
    await expect(
      revalidateEthereumTransferPlan(rpc({ token: 499n }).client, plan, 2000),
    ).rejects.toThrow('inventory');
  });
});
