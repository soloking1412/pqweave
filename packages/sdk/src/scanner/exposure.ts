import {
  type Address,
  getAddress,
  type Hex,
  isAddressEqual,
  keccak256,
  recoverPublicKey,
  serializeTransaction,
  type Transaction,
  type TransactionSerializable,
} from 'viem';
import { publicKeyToAddress } from 'viem/accounts';
import type { ExposureOptions, ExposureResult, ScannerClient } from './types.js';

/** EIP-7702 delegation designator prefix (0xef0100 || address). */
const DELEGATION_PREFIX = '0xef0100';
const DELEGATION_CODE_LENGTH = 2 + 6 + 40; // "0x" + prefix + 20-byte address

function parseDelegation(code: Hex): Address | null {
  if (code.length !== DELEGATION_CODE_LENGTH) return null;
  if (!code.toLowerCase().startsWith(DELEGATION_PREFIX)) return null;
  return getAddress(`0x${code.slice(8)}`);
}

function isKnownImplementation(target: Address, known: Address[] | undefined): boolean {
  return Boolean(known?.some((impl) => isAddressEqual(impl, target)));
}

const PQWEAVE_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'pqcVerifier',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

/**
 * A PQWeave account exposes `pqcVerifier()`. If it returns one of the known
 * verifier addresses, the contract is a genuine PQWeave post-quantum account.
 * Any non-PQWeave contract reverts or returns something else, so this is a
 * precise, non-spoofable signal. Best-effort: failure means "not recognized".
 */
async function isPqweaveAccount(
  client: ScannerClient,
  address: Address,
  knownVerifiers: Address[],
): Promise<boolean> {
  const verifier = (await client.readContract({
    address,
    abi: PQWEAVE_ACCOUNT_ABI,
    functionName: 'pqcVerifier',
  })) as Address;
  return knownVerifiers.some((known) => isAddressEqual(known, verifier));
}

/**
 * Inspect an address for quantum exposure. The authoritative signal is the
 * transaction count: any account that has sent a transaction has revealed the
 * public key behind its address, making it harvestable by a future quantum
 * attacker. Recovery of the actual public key is best-effort and requires the
 * hash of an outgoing transaction.
 */
export async function getExposure(
  client: ScannerClient,
  address: Address,
  options: ExposureOptions = {},
): Promise<ExposureResult> {
  const [nonce, code] = await Promise.all([
    client.getTransactionCount({ address }),
    client.getCode({ address }),
  ]);

  const codeHex: Hex = code ?? '0x';
  const delegatedTo = parseDelegation(codeHex);
  const isContract = codeHex !== '0x' && delegatedTo === null;
  const hardened =
    delegatedTo !== null && isKnownImplementation(delegatedTo, options.knownImplementations);
  const exposed = nonce > 0;

  const pqweaveProtected =
    isContract && Boolean(options.knownVerifiers?.length)
      ? await isPqweaveAccount(client, address, options.knownVerifiers!).catch(() => false)
      : false;

  let publicKey: Hex | null = null;
  if (exposed && options.recoverFromTx) {
    publicKey = await recoverTransactionPublicKey(client, options.recoverFromTx).catch(() => null);
  }

  return {
    address,
    exposed,
    nonce,
    isContract,
    delegatedTo,
    hardened,
    pqweaveProtected,
    publicKey,
  };
}

function toSerializable(tx: Transaction): TransactionSerializable {
  const base: Record<string, unknown> = {
    chainId: tx.chainId,
    nonce: tx.nonce,
    to: tx.to ?? undefined,
    value: tx.value,
    gas: tx.gas,
    data: tx.input,
  };
  switch (tx.type) {
    case 'legacy':
      return { ...base, type: 'legacy', gasPrice: tx.gasPrice } as TransactionSerializable;
    case 'eip2930':
      return {
        ...base,
        type: 'eip2930',
        gasPrice: tx.gasPrice,
        accessList: tx.accessList,
      } as TransactionSerializable;
    case 'eip1559':
      return {
        ...base,
        type: 'eip1559',
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        accessList: tx.accessList,
      } as TransactionSerializable;
    case 'eip7702':
      return {
        ...base,
        type: 'eip7702',
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        accessList: tx.accessList,
        authorizationList: tx.authorizationList,
      } as TransactionSerializable;
    default:
      throw new Error(`unsupported transaction type for recovery: ${String(tx.type)}`);
  }
}

function transactionYParity(tx: Transaction): number {
  if (tx.yParity !== undefined) return tx.yParity;
  if (tx.v === undefined) throw new Error('transaction is missing both yParity and v');
  if (tx.v === 27n || tx.v === 28n) return Number(tx.v - 27n);
  return Number((tx.v - 35n) % 2n);
}

/**
 * Recover the uncompressed secp256k1 public key that signed a transaction. The
 * recovered key is validated against the transaction sender before being returned.
 */
export async function recoverTransactionPublicKey(
  client: ScannerClient,
  txHash: Hex,
): Promise<Hex> {
  const tx = await client.getTransaction({ hash: txHash });
  const signingHash = keccak256(serializeTransaction(toSerializable(tx)));
  const publicKey = await recoverPublicKey({
    hash: signingHash,
    signature: { r: tx.r, s: tx.s, yParity: transactionYParity(tx) },
  });
  if (!isAddressEqual(publicKeyToAddress(publicKey), tx.from)) {
    throw new Error('recovered public key does not match transaction sender');
  }
  return publicKey;
}
