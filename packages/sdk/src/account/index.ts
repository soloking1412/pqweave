import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  type PublicClient,
} from 'viem';
import type { HashSigKey, HashSigSigner } from '../pqc/hashsig.js';
import { signHashSig } from '../pqc/hashsig.js';
import { pqWeaveAccountAbi, pqWeaveFactoryAbi } from './abi.js';

export {
  batchExecutorAbi,
  erc20Abi,
  erc721Abi,
  migrationSweeperAbi,
  pqWeaveAccountAbi,
  pqWeaveFactoryAbi,
} from './abi.js';

/** Empty post-quantum signature, used for routine operations. */
export const EMPTY_PQC_SIGNATURE: Hex = '0x';

export interface AccountCall {
  dest: Address;
  value: bigint;
  data: Hex;
}

export function encodeExecute(dest: Address, value: bigint, data: Hex): Hex {
  return encodeFunctionData({
    abi: pqWeaveAccountAbi,
    functionName: 'execute',
    args: [dest, value, data],
  });
}

export function encodeExecuteBatch(calls: AccountCall[]): Hex {
  return encodeFunctionData({
    abi: pqWeaveAccountAbi,
    functionName: 'executeBatch',
    args: [calls],
  });
}

/** ABI-encode the hybrid (ECDSA, post-quantum) signature stored in a UserOperation. */
export function encodeHybridSignature(ecdsaSignature: Hex, pqcSignature: Hex): Hex {
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes' }],
    [ecdsaSignature, pqcSignature],
  );
}

/** Minimal structural type for any viem account able to sign a message. */
export interface MessageSigner {
  signMessage(args: { message: { raw: Hex } }): Promise<Hex>;
}

export interface HybridSignatureParams {
  signer: MessageSigner;
  userOpHash: Hex;
  /**
   * Preferred way to attach a post-quantum signature: the signer advances its
   * one-time leaf index automatically, so a leaf can never be reused. Persist
   * `hashSigner.serialize()` after calling.
   */
  hashSigner?: HashSigSigner;
  /** Low-level alternative; the caller is responsible for never reusing a leaf. */
  hashSigKey?: HashSigKey;
  leafIndex?: number;
}

/**
 * Produce the hybrid signature for a UserOperation. The wallet's EIP-191
 * personal-sign over the raw userOpHash matches the account's ECDSA check; when
 * a hash-based signer (or key + leaf index) is supplied, a post-quantum
 * signature is attached for operations the policy gates.
 */
export async function buildHybridSignature({
  signer,
  userOpHash,
  hashSigner,
  hashSigKey,
  leafIndex,
}: HybridSignatureParams): Promise<Hex> {
  const ecdsaSignature = await signer.signMessage({ message: { raw: userOpHash } });
  let pqcSignature: Hex = EMPTY_PQC_SIGNATURE;
  if (hashSigner) {
    pqcSignature = hashSigner.signNext(userOpHash).signature;
  } else if (hashSigKey && leafIndex !== undefined) {
    pqcSignature = signHashSig(hashSigKey, userOpHash, leafIndex);
  }
  return encodeHybridSignature(ecdsaSignature, pqcSignature);
}

export interface AccountParams {
  owner: Address;
  pqcPublicKey: Hex;
  verifier: Address;
  valueThreshold: bigint;
  salt: Hex;
}

/** Encode a factory call that creates a fresh quantum-safe account for a new user. */
export function encodeCreateAccount(params: AccountParams): Hex {
  return encodeFunctionData({
    abi: pqWeaveFactoryAbi,
    functionName: 'createAccount',
    args: [params.owner, params.pqcPublicKey, params.verifier, params.valueThreshold, params.salt],
  });
}

/** Read the counterfactual account address from the factory. */
export function predictAccountAddress(
  client: PublicClient,
  factory: Address,
  params: AccountParams,
): Promise<Address> {
  return client.readContract({
    address: factory,
    abi: pqWeaveFactoryAbi,
    functionName: 'getAddress',
    args: [params.owner, params.pqcPublicKey, params.verifier, params.valueThreshold, params.salt],
  });
}

export interface DelegationAuthorization {
  contractAddress: Address;
  chainId: number;
  nonce: number;
}

/**
 * Build the EIP-7702 authorization that delegates an existing EOA to a
 * PQWeave account implementation, to be signed with the wallet's
 * `signAuthorization`.
 */
export function buildDelegation(
  contractAddress: Address,
  chainId: number,
  nonce: number,
): DelegationAuthorization {
  return { contractAddress, chainId, nonce };
}
