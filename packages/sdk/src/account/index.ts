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
   * one-time leaf index within this instance. Restored or concurrent instances
   * can reuse leaves; prefer DurablePqcSigner for persistent signing. Persist
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

/** Encode a factory call that creates an experimental post-quantum account for a new user. */
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

export interface HardenInPlaceParams {
  /** Canonical PQWeaveAccount implementation (EIP-7702 authorization target). */
  accountImpl: Address;
  /** The EOA being hardened — keeps its ECDSA key as the routine authority. */
  owner: Address;
  /** 32-byte Merkle root of the post-quantum key. */
  pqcRoot: Hex;
  verifier: Address;
  valueThreshold: bigint;
  /** Require a post-quantum signature for every operation, not just sensitive ones. */
  pqcOnly?: boolean;
}

export interface HardenInPlace {
  /** EIP-7702 authorization target. */
  delegate: Address;
  /** Calldata the EOA sends to itself in the same type-4 transaction. */
  data: Hex;
}

/**
 * Assemble the one-transaction harden-in-place: the EOA delegates to the
 * canonical PQWeaveAccount and initializes itself (optionally flipping pqcOnly)
 * via a self-called executeBatch. The address keeps working as before, with a
 * post-quantum gate on sensitive operations.
 *
 * Honesty note: this is transitional, not quantum-safe — the underlying ECDSA
 * key can always sign a new 7702 authorization and remove the delegated code.
 * A separate PQC-sole account removes that ECDSA fallback; network and token
 * dependencies remain separate risks.
 */
export function buildHardenInPlace(params: HardenInPlaceParams): HardenInPlace {
  const self = params.owner;
  const calls: AccountCall[] = [
    {
      dest: self,
      value: 0n,
      data: encodeFunctionData({
        abi: pqWeaveAccountAbi,
        functionName: 'initialize',
        args: [params.owner, params.pqcRoot, params.verifier, params.valueThreshold],
      }),
    },
  ];
  if (params.pqcOnly) {
    calls.push({
      dest: self,
      value: 0n,
      data: encodeFunctionData({
        abi: pqWeaveAccountAbi,
        functionName: 'setPqcOnly',
        args: [true],
      }),
    });
  }
  return { delegate: params.accountImpl, data: encodeExecuteBatch(calls) };
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
