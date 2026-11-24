import {
  type Address,
  concatHex,
  decodeEventLog,
  encodeFunctionData,
  type Hex,
  numberToHex,
  parseAbi,
  type PublicClient,
} from 'viem';

/** Canonical ERC-4337 v0.7 EntryPoint, the same address on every chain. */
export const ENTRYPOINT_V07: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

export const entryPointAbi = parseAbi([
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
  'struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }',
  'function handleOps(PackedUserOperation[] ops, address beneficiary)',
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  'function getUserOpHash(PackedUserOperation userOp) view returns (bytes32)',
]);

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

/** Pack two uint128 values into the bytes32 layout EntryPoint v0.7 expects. */
export function packUint128Pair(high: bigint, low: bigint): Hex {
  return concatHex([numberToHex(high, { size: 16 }), numberToHex(low, { size: 16 })]);
}

export function packAccountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): Hex {
  return packUint128Pair(verificationGasLimit, callGasLimit);
}

export function packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): Hex {
  if (maxPriorityFeePerGas > maxFeePerGas) throw new Error('Priority fee exceeds maximum fee');
  return packUint128Pair(maxPriorityFeePerGas, maxFeePerGas);
}

/** A successful handleOps transaction can contain failed account executions. */
export function readUserOperationOutcome(
  logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
  userOpHash: Hex,
  entryPoint: Address = ENTRYPOINT_V07,
): { success: boolean; actualGasCost: bigint; actualGasUsed: bigint } {
  for (const log of logs) {
    if (log.address.toLowerCase() !== entryPoint.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: entryPointAbi,
        eventName: 'UserOperationEvent',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (event.args.userOpHash.toLowerCase() === userOpHash.toLowerCase()) {
        return {
          success: event.args.success,
          actualGasCost: event.args.actualGasCost,
          actualGasUsed: event.args.actualGasUsed,
        };
      }
    } catch {
      /* unrelated or malformed log */
    }
  }
  throw new Error('Matching EntryPoint operation receipt is missing');
}

export interface UserOpGas {
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  preVerificationGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
}

export interface BuildUserOpParams {
  sender: Address;
  callData: Hex;
  entryPoint?: Address;
  gas?: UserOpGas;
}

/**
 * Build a PackedUserOperation for an already-deployed account, reading the
 * nonce from the EntryPoint. Gas defaults are generous, self-bundled values —
 * the v1 path submits via `handleOps` from any funded wallet, so overpaying
 * the estimate only costs the submitter margin, not a bundler rejection.
 */
export async function buildAccountUserOp(
  client: PublicClient,
  params: BuildUserOpParams,
): Promise<PackedUserOperation> {
  const entryPoint = params.entryPoint ?? ENTRYPOINT_V07;
  const nonce = await client.readContract({
    address: entryPoint,
    abi: entryPointAbi,
    functionName: 'getNonce',
    args: [params.sender, 0n],
  });
  const fees = await client.estimateFeesPerGas().catch(() => null);
  const gas = params.gas ?? {};
  return {
    sender: params.sender,
    nonce,
    initCode: '0x',
    callData: params.callData,
    accountGasLimits: packAccountGasLimits(
      gas.verificationGasLimit ?? 1_500_000n,
      gas.callGasLimit ?? 500_000n,
    ),
    preVerificationGas: gas.preVerificationGas ?? 100_000n,
    gasFees: packGasFees(
      gas.maxPriorityFeePerGas ?? fees?.maxPriorityFeePerGas ?? 1_000_000_000n,
      gas.maxFeePerGas ?? fees?.maxFeePerGas ?? 20_000_000_000n,
    ),
    paymasterAndData: '0x',
    signature: '0x',
  };
}

/**
 * Read the canonical userOp hash from the EntryPoint itself rather than
 * re-implementing its hashing — one source of truth, no drift risk.
 */
export function getUserOpHash(
  client: PublicClient,
  userOp: PackedUserOperation,
  entryPoint: Address = ENTRYPOINT_V07,
): Promise<Hex> {
  return client.readContract({
    address: entryPoint,
    abi: entryPointAbi,
    functionName: 'getUserOpHash',
    args: [userOp],
  }) as Promise<Hex>;
}

/**
 * Calldata for a self-bundled `handleOps` — any funded EOA can submit the
 * signed userOp directly to the EntryPoint, no bundler required.
 */
export function encodeHandleOps(userOps: PackedUserOperation[], beneficiary: Address): Hex {
  return encodeFunctionData({
    abi: entryPointAbi,
    functionName: 'handleOps',
    args: [userOps, beneficiary],
  });
}
