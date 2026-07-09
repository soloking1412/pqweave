import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseAbi,
  type PublicClient,
  stringToBytes,
  toHex,
} from 'viem';
import type { HashSigSigner } from '../pqc/hashsig.js';

export const pqWeaveForwarderAbi = parseAbi([
  'function initialize(address destination, bytes32 pqcRoot, address verifier)',
  'function initializeAndFlush(address destination, bytes32 pqcRoot, address verifier, address[] erc20s)',
  'function flush()',
  'function flushERC20(address token)',
  'function forwardERC721(address token, uint256 tokenId)',
  'function forwardERC1155(address token, uint256 id)',
  'function setDestination(address newDestination, bytes pqcSignature)',
  'function setDestinationDigest(address newDestination) view returns (bytes32)',
  'function destination() view returns (address)',
  'function pqcRoot() view returns (bytes32)',
  'function pqcVerifier() view returns (address)',
  'function destinationNonce() view returns (uint64)',
  'function initialized() view returns (bool)',
  'function pqcLeafUsed(uint256 leafIndex) view returns (bool)',
]);

const SET_DESTINATION_TYPEHASH = keccak256(stringToBytes('pqweave.forwarder.setDestination'));

export interface ForwarderInstallPlan {
  /** Canonical PQWeaveForwarder implementation (EIP-7702 authorization target). */
  forwarder: Address;
  /** The quantum-safe account that everything forwards to. */
  destination: Address;
  /** 32-byte Merkle root of the post-quantum key. */
  pqcRoot: Hex;
  verifier: Address;
  /** ERC-20s to sweep in the install transaction. */
  erc20s?: Address[];
}

export interface ForwarderInstall {
  /** EIP-7702 authorization target. */
  delegate: Address;
  /** Calldata the EOA sends to itself in the same type-4 transaction. */
  data: Hex;
}

/**
 * Assemble the one-transaction mailbox install: the wallet signs a 7702
 * authorization to the canonical forwarder and sends a single transaction to
 * itself calling `initializeAndFlush`. After it lands, the address keeps
 * receiving but value moves on to `destination`.
 */
export function buildForwarderInstall(plan: ForwarderInstallPlan): ForwarderInstall {
  return {
    delegate: plan.forwarder,
    data: encodeFunctionData({
      abi: pqWeaveForwarderAbi,
      functionName: 'initializeAndFlush',
      args: [plan.destination, plan.pqcRoot, plan.verifier, plan.erc20s ?? []],
    }),
  };
}

export function encodeFlush(): Hex {
  return encodeFunctionData({ abi: pqWeaveForwarderAbi, functionName: 'flush', args: [] });
}

export function encodeFlushErc20(token: Address): Hex {
  return encodeFunctionData({
    abi: pqWeaveForwarderAbi,
    functionName: 'flushERC20',
    args: [token],
  });
}

export function encodeForwardErc721(token: Address, tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: pqWeaveForwarderAbi,
    functionName: 'forwardERC721',
    args: [token, tokenId],
  });
}

export function encodeForwardErc1155(token: Address, id: bigint): Hex {
  return encodeFunctionData({
    abi: pqWeaveForwarderAbi,
    functionName: 'forwardERC1155',
    args: [token, id],
  });
}

export interface SetDestinationDigestParams {
  chainId: number;
  /** The mailbox address (the delegated EOA), not the implementation. */
  account: Address;
  /** Current `destinationNonce()` of the mailbox. */
  nonce: bigint;
  newDestination: Address;
}

/**
 * The digest the post-quantum key signs to retarget the mailbox. Matches the
 * contract's `setDestinationDigest` byte-for-byte: bound to chain, account,
 * and nonce so a signature can never be replayed.
 */
export function setDestinationDigest(params: SetDestinationDigestParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint64' },
        { type: 'address' },
      ],
      [
        SET_DESTINATION_TYPEHASH,
        BigInt(params.chainId),
        params.account,
        params.nonce,
        params.newDestination,
      ],
    ),
  );
}

export interface SetDestinationCall {
  digest: Hex;
  leafIndex: number;
  /** Calldata for `setDestination` — submit from any funded wallet. */
  data: Hex;
}

/**
 * Sign a destination change with the next one-time leaf and return the ready
 * calldata. Persist `signer.serialize()` before broadcasting, so the consumed
 * leaf is never reused.
 */
export function buildSetDestination(
  signer: HashSigSigner,
  params: SetDestinationDigestParams,
): SetDestinationCall {
  const digest = setDestinationDigest(params);
  const { signature, leafIndex } = signer.signNext(digest);
  return {
    digest,
    leafIndex,
    data: encodeFunctionData({
      abi: pqWeaveForwarderAbi,
      functionName: 'setDestination',
      args: [params.newDestination, signature],
    }),
  };
}

export interface ForwarderState {
  initialized: boolean;
  destination: Address;
  pqcRoot: Hex;
  verifier: Address;
  destinationNonce: bigint;
}

/** Read the mailbox configuration from a delegated EOA. */
export async function readForwarderState(
  client: PublicClient,
  account: Address,
): Promise<ForwarderState> {
  const [initialized, destination, pqcRoot, verifier, destinationNonce] = await Promise.all([
    client.readContract({
      address: account,
      abi: pqWeaveForwarderAbi,
      functionName: 'initialized',
    }),
    client.readContract({
      address: account,
      abi: pqWeaveForwarderAbi,
      functionName: 'destination',
    }),
    client.readContract({ address: account, abi: pqWeaveForwarderAbi, functionName: 'pqcRoot' }),
    client.readContract({
      address: account,
      abi: pqWeaveForwarderAbi,
      functionName: 'pqcVerifier',
    }),
    client.readContract({
      address: account,
      abi: pqWeaveForwarderAbi,
      functionName: 'destinationNonce',
    }),
  ]);
  return {
    initialized,
    destination,
    pqcRoot: toHex(pqcRoot),
    verifier,
    destinationNonce: BigInt(destinationNonce),
  };
}
