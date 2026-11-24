import {
  getAddress,
  isAddress,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { erc20Abi, pqWeaveAccountAbi } from '../account/abi.js';
import { buildOneClickSweep, type BatchCall } from './index.js';

export interface EthereumDestination {
  chainId: number;
  account: Address;
  root: Hex;
  verifier: Address;
  entryPoint: Address;
  /** Expected hashes must come from a reviewed deployment manifest, never the RPC being checked. */
  accountCodeHash: Hex;
  verifierCodeHash: Hex;
  entryPointCodeHash: Hex;
}

export interface EthereumTransferRequest {
  source: Address;
  destination: EthereumDestination;
  /** Explicit inventory only. This is not discovery of all tokens or positions. */
  tokens: Address[];
  nativeWei: bigint;
  /** Upper bound supplied by the caller for gas across all transactions. */
  gasReserveWei: bigint;
}

export interface EthereumTransferPlan {
  request: EthereumTransferRequest;
  blockNumber: bigint;
  blockHash: Hex;
  sourceBalanceWei: bigint;
  createdAt: number;
  expiresAt: number;
  transfers: BatchCall[];
  limitations: string[];
}

function address(value: Address): Address {
  if (!isAddress(value) || value.toLowerCase() === zeroAddress)
    throw new Error('Invalid or zero address');
  return getAddress(value);
}
function uint(value: bigint): void {
  if (typeof value !== 'bigint' || value < 0n || value >= 1n << 256n)
    throw new Error('Invalid amount');
}

/** Pins all reads to one block; authenticates code AND sole-PQ account configuration. */
export async function verifyEthereumDestination(
  client: PublicClient,
  destination: EthereumDestination,
  blockNumber: bigint,
): Promise<void> {
  if (
    !Number.isSafeInteger(destination.chainId) ||
    destination.chainId <= 0 ||
    (await client.getChainId()) !== destination.chainId
  )
    throw new Error('Destination network mismatch');
  for (const value of [
    destination.root,
    destination.accountCodeHash,
    destination.verifierCodeHash,
    destination.entryPointCodeHash,
  ]) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid deployment hash or root');
  }
  const targets = [destination.account, destination.verifier, destination.entryPoint].map(address);
  if (new Set(targets).size !== 3) throw new Error('Deployment roles must be distinct');
  const codes = await Promise.all(
    targets.map((target) => client.getCode({ address: target, blockNumber })),
  );
  const expected = [
    destination.accountCodeHash,
    destination.verifierCodeHash,
    destination.entryPointCodeHash,
  ];
  codes.forEach((code, index) => {
    if (
      !code ||
      code === '0x' ||
      code.startsWith('0xef0100') ||
      keccak256(code).toLowerCase() !== expected[index]!.toLowerCase()
    ) {
      throw new Error('Missing, delegated or unverified destination code');
    }
  });
  const read = (functionName: 'owner' | 'pqcPublicKey' | 'pqcVerifier' | 'entryPoint') =>
    client.readContract({
      address: destination.account,
      abi: pqWeaveAccountAbi,
      functionName,
      blockNumber,
    });
  const [owner, root, verifier, entryPoint] = await Promise.all([
    read('owner'),
    read('pqcPublicKey'),
    read('pqcVerifier'),
    read('entryPoint'),
  ]);
  if (
    owner.toLowerCase() !== zeroAddress ||
    root.toLowerCase() !== destination.root.toLowerCase() ||
    verifier.toLowerCase() !== destination.verifier.toLowerCase() ||
    entryPoint.toLowerCase() !== destination.entryPoint.toLowerCase()
  ) {
    throw new Error('Destination sole-PQ authority does not match the manifest');
  }
}

/**
 * Produces ordinary wallet transfers, with no approvals or 7702 authorization.
 * Each transfer is a separate transaction; reconciliation is required after
 * partial completion. A 7702 adapter may batch them after verifying its executor.
 */
export async function buildEthereumTransferPlan(
  client: PublicClient,
  request: EthereumTransferRequest,
  now = Date.now(),
): Promise<EthereumTransferPlan> {
  const source = address(request.source);
  const destination = { ...request.destination, account: address(request.destination.account) };
  if (source === destination.account) throw new Error('Source and destination must differ');
  uint(request.nativeWei);
  uint(request.gasReserveWei);
  if (request.gasReserveWei === 0n) throw new Error('A gas reserve is required');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid time');
  if (request.tokens.length > 100) throw new Error('At most 100 listed tokens');
  const tokens = request.tokens.map(address);
  if (new Set(tokens).size !== tokens.length) throw new Error('Duplicate token');
  const block = await client.getBlock();
  if (block.number === null || !block.hash) throw new Error('A mined block is required');
  await verifyEthereumDestination(client, destination, block.number);
  const sourceBalanceWei = await client.getBalance({ address: source, blockNumber: block.number });
  if (sourceBalanceWei < request.nativeWei + request.gasReserveWei)
    throw new Error('Insufficient balance including gas reserve');
  // Bounded batches avoid overwhelming a user's private RPC.
  const erc20s: { token: Address; amount: bigint }[] = [];
  for (let offset = 0; offset < tokens.length; offset += 5) {
    const batch = await Promise.all(
      tokens.slice(offset, offset + 5).map(async (token) => {
        const code = await client.getCode({ address: token, blockNumber: block.number });
        if (!code || code === '0x') throw new Error('Listed token has no code');
        const amount = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [source],
          blockNumber: block.number,
        });
        uint(amount);
        return { token, amount };
      }),
    );
    erc20s.push(...batch.filter(({ amount }) => amount > 0n));
  }
  const transfers = buildOneClickSweep({
    from: source,
    to: destination.account,
    native: request.nativeWei,
    erc20s,
  });
  if (!transfers.length) throw new Error('No assets selected');
  return {
    request: { ...request, source, destination, tokens },
    blockNumber: block.number,
    blockHash: block.hash,
    sourceBalanceWei,
    createdAt: now,
    expiresAt: now + 10 * 60_000,
    transfers,
    limitations: [
      'Only the listed native value and ERC-20 balances are included. NFTs, DeFi positions, allowances and unlisted assets need a separate inventory.',
      'Token fees, rebasing, pauses and administrator keys may affect transfers. Verify destination receipts.',
      'Account authorization does not make Ethereum consensus, token administrators or bridges post-quantum.',
      'Gas reserve is a caller estimate, not a guaranteed transaction cost. Rebuild after each ordinary transfer.',
    ],
  };
}

/** Rebuild and compare before signing; do not deserialize untrusted plans into this function. */
export async function revalidateEthereumTransferPlan(
  client: PublicClient,
  plan: EthereumTransferPlan,
  now = Date.now(),
): Promise<EthereumTransferPlan> {
  if (now < plan.createdAt || now >= plan.expiresAt)
    throw new Error('Plan expired or clock moved backwards');
  const originalBlock = await client.getBlock({ blockNumber: plan.blockNumber });
  if (originalBlock.hash !== plan.blockHash) throw new Error('Plan block was reorganized');
  const fresh = await buildEthereumTransferPlan(client, plan.request, now);
  const serialize = (value: unknown) =>
    JSON.stringify(value, (_, field) => (typeof field === 'bigint' ? field.toString() : field));
  if (serialize(fresh.transfers) !== serialize(plan.transfers))
    throw new Error('Asset inventory changed; rebuild and review');
  return fresh;
}
