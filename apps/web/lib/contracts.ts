import { type Address, isAddress } from 'viem';

export interface PQWeaveContracts {
  verifier: Address;
  factory: Address;
  batchExecutor: Address;
  /** Canonical mailbox forwarder (EIP-7702 target); null until deployed. */
  forwarder: Address | null;
  /** Canonical account implementation for harden-in-place; null until deployed. */
  accountImpl: Address | null;
}

function readAddress(value: string | undefined): Address | null {
  return value && isAddress(value) ? value : null;
}

/**
 * PQWeave contract addresses. Because they are deployed with CREATE2, the
 * same addresses are valid on every EVM chain, so a single set of env vars
 * covers all networks. Returns null until configured.
 */
export function getContracts(): PQWeaveContracts | null {
  const verifier = readAddress(process.env.NEXT_PUBLIC_VERIFIER_ADDRESS);
  const factory = readAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS);
  const batchExecutor = readAddress(process.env.NEXT_PUBLIC_BATCH_EXECUTOR_ADDRESS);
  if (!verifier || !factory || !batchExecutor) return null;
  return {
    verifier,
    factory,
    batchExecutor,
    forwarder: readAddress(process.env.NEXT_PUBLIC_FORWARDER_ADDRESS),
    accountImpl: readAddress(process.env.NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS),
  };
}

export interface KnownPQWeave {
  /** EIP-7702 delegation targets that mean a wallet is hardened. */
  implementations: Address[];
  /** PQC verifier addresses that identify a migrated PQWeave account. */
  verifiers: Address[];
}

/**
 * The deployed PQWeave addresses the scanner uses to recognize wallets we
 * protect — a hardened (7702-delegated) EOA, or a migrated post-quantum
 * account. Empty until contracts are configured.
 */
export function getKnownPQWeave(): KnownPQWeave {
  const contracts = getContracts();
  if (!contracts) return { implementations: [], verifiers: [] };
  const implementations = [contracts.batchExecutor];
  if (contracts.forwarder) implementations.push(contracts.forwarder);
  if (contracts.accountImpl) implementations.push(contracts.accountImpl);
  return { implementations, verifiers: [contracts.verifier] };
}

const EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  8453: 'https://basescan.org',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
  84532: 'https://sepolia.basescan.org',
  11155111: 'https://sepolia.etherscan.io',
};

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const base = EXPLORERS[chainId];
  return base ? `${base}/tx/${hash}` : null;
}
