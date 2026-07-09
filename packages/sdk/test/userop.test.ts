import { decodeFunctionData, getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  encodeHandleOps,
  entryPointAbi,
  packAccountGasLimits,
  packGasFees,
  packUint128Pair,
  type PackedUserOperation,
} from '../src/userop/index.js';

const SENDER = getAddress('0x1111111111111111111111111111111111111111');
const BENEFICIARY = getAddress('0x4444444444444444444444444444444444444444');

describe('uint128 packing', () => {
  it('packs high and low halves into one bytes32', () => {
    expect(packUint128Pair(1n, 2n)).toBe(
      '0x0000000000000000000000000000000100000000000000000000000000000002',
    );
    expect(packAccountGasLimits(1_500_000n, 500_000n)).toBe(
      '0x0000000000000000000000000016e3600000000000000000000000000007a120',
    );
    expect(packGasFees(0n, 20_000_000_000n)).toBe(
      '0x00000000000000000000000000000000000000000000000000000004a817c800',
    );
  });
});

describe('encodeHandleOps', () => {
  it('produces calldata that round-trips through the EntryPoint ABI', () => {
    const op: PackedUserOperation = {
      sender: SENDER,
      nonce: 7n,
      initCode: '0x',
      callData: '0xdeadbeef',
      accountGasLimits: packAccountGasLimits(1_500_000n, 500_000n),
      preVerificationGas: 100_000n,
      gasFees: packGasFees(1_000_000_000n, 20_000_000_000n),
      paymasterAndData: '0x',
      signature: '0x1234',
    };

    const data = encodeHandleOps([op], BENEFICIARY);
    const decoded = decodeFunctionData({ abi: entryPointAbi, data });
    expect(decoded.functionName).toBe('handleOps');
    const [ops, beneficiary] = decoded.args as [PackedUserOperation[], string];
    expect(beneficiary).toBe(BENEFICIARY);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.sender).toBe(SENDER);
    expect(ops[0]!.nonce).toBe(7n);
    expect(ops[0]!.callData).toBe('0xdeadbeef');
    expect(ops[0]!.signature).toBe('0x1234');
  });
});
