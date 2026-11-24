import { type Address, getAddress, type Hex, parseTransaction, type Transaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import {
  assessRisk,
  getExposure,
  recoverTransactionPublicKey,
  type ExposureResult,
  type ScannerClient,
} from '../src/scanner/index.js';

function stubClient(overrides: Partial<Record<keyof ScannerClient, unknown>>): ScannerClient {
  return {
    getTransactionCount: async () => 0,
    getCode: async () => '0x' as Hex,
    getBalance: async () => 0n,
    getTransaction: async () => {
      throw new Error('not implemented');
    },
    ...overrides,
  } as unknown as ScannerClient;
}

const ADDRESS = getAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

describe('getExposure', () => {
  it('flags an account that has sent transactions as exposed', async () => {
    const client = stubClient({ getTransactionCount: async () => 12 });
    const result = await getExposure(client, ADDRESS);
    expect(result.exposed).toBe(true);
    expect(result.nonce).toBe(12);
    expect(result.isContract).toBe(false);
    expect(result.delegatedTo).toBeNull();
  });

  it('treats a never-used address as not exposed', async () => {
    const result = await getExposure(stubClient({ getTransactionCount: async () => 0 }), ADDRESS);
    expect(result.exposed).toBe(false);
  });

  it('detects an EIP-7702 delegation and marks known implementations as hardened', async () => {
    const impl = getAddress('0x1111111111111111111111111111111111111111');
    const code = (`0xef0100${impl.slice(2)}` as Hex).toLowerCase() as Hex;
    const client = stubClient({ getTransactionCount: async () => 3, getCode: async () => code });
    const result = await getExposure(client, ADDRESS, { knownImplementations: [impl] });
    expect(result.delegatedTo).toBe(impl);
    expect(result.isContract).toBe(false);
    expect(result.hardened).toBe(true);
  });

  it('does not trust a contract self-reporting a known pqcVerifier()', async () => {
    const verifier = getAddress('0x2222222222222222222222222222222222222222');
    const client = stubClient({
      getCode: async () => '0x363d3d37' as Hex,
      readContract: async () => verifier,
    });
    const result = await getExposure(client, ADDRESS, { knownVerifiers: [verifier] });
    expect(result.isContract).toBe(true);
    expect(result.pqweaveProtected).toBe(false);
  });

  it('does not flag an unrelated contract as PQWeave-protected', async () => {
    const verifier = getAddress('0x2222222222222222222222222222222222222222');
    const client = stubClient({
      getCode: async () => '0x363d3d37' as Hex,
      readContract: async () => {
        throw new Error('execution reverted');
      },
    });
    const result = await getExposure(client, ADDRESS, { knownVerifiers: [verifier] });
    expect(result.isContract).toBe(true);
    expect(result.pqweaveProtected).toBe(false);
  });

  it('recovers the signing public key from an outgoing transaction', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    );
    const serialized = await account.signTransaction({
      chainId: 8453,
      nonce: 7,
      to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      value: 1_000_000n,
      gas: 21_000n,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      type: 'eip1559',
    });
    const parsed = parseTransaction(serialized);
    const tx = {
      ...parsed,
      from: account.address,
      input: parsed.data ?? '0x',
    } as unknown as Transaction;
    const client = stubClient({ getTransaction: async () => tx });

    const recovered = await recoverTransactionPublicKey(client, '0xdead');
    expect(recovered.toLowerCase()).toBe(account.publicKey.toLowerCase());
  });
});

function exposure(partial: Partial<ExposureResult>): ExposureResult {
  return {
    address: ADDRESS,
    exposed: false,
    nonce: 0,
    isContract: false,
    delegatedTo: null,
    hardened: false,
    pqweaveProtected: false,
    publicKey: null,
    ...partial,
  };
}

describe('assessRisk', () => {
  it('rates an exposed, well-funded address as critical', () => {
    const result = assessRisk(
      exposure({ exposed: true, nonce: 40 }),
      5_000_000_000_000_000_000n,
      'ethereum',
    );
    expect(result.level).toBe('critical');
    expect(result.score).toBe(90);
  });

  it('rates an exposed but empty address lower', () => {
    const result = assessRisk(exposure({ exposed: true, nonce: 3 }), 0n, 'base');
    expect(result.level).toBe('medium');
  });

  it('rates a never-used address as safe', () => {
    const result = assessRisk(exposure({ exposed: false }), 0n, 'base');
    expect(result.level).toBe('safe');
  });

  it('rates a revocable 7702 delegation as exposed', () => {
    const impl = getAddress('0x1111111111111111111111111111111111111111');
    const result = assessRisk(
      exposure({ exposed: true, nonce: 9, delegatedTo: impl, hardened: true }),
      5_000_000_000_000_000_000n,
      'base',
    );
    expect(result.level).toBe('critical');
    expect(result.reasons.join(' ')).toContain('ECDSA key can revoke');
  });

  it('does not trust an unauthenticated PQ account claim', () => {
    const result = assessRisk(
      exposure({ isContract: true, pqweaveProtected: true }),
      5_000_000_000_000_000_000n,
      'base',
    );
    expect(result.level).toBe('low');
    expect(result.reasons[0]).toContain('not been verified');
  });
});
