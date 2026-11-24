import { type Address, type Hex, isAddress } from 'viem';

export interface PQWeaveContracts {
  verifier: Address;
  codeHashes: {
    factory: Hex;
    verifier: Hex;
    batchExecutor: Hex;
    account: Hex;
    entryPoint: Hex;
    forwarder: Hex | null;
    accountImpl: Hex | null;
  };
  factory: Address;
  batchExecutor: Address;
  /** Canonical mailbox forwarder (EIP-7702 target); null until deployed. */
  forwarder: Address | null;
  /** Canonical account implementation for harden-in-place; null until deployed. */
  accountImpl: Address | null;
  /** Cross-chain BTC↔PQC attestation registry; null until deployed. */
  attestation: Address | null;
}

function readHash(value: string | undefined): Hex | null {
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : null;
}

function readAddress(value: string | undefined): Address | null {
  return value && isAddress(value) ? value : null;
}

/**
 * PQWeave contract addresses. Because they are deployed with CREATE2, the
 * addresses must be verified on the configured chain. Expected runtime hashes
 * come from the reviewed deployment manifest. Returns null until configured.
 */
export function getContracts(): PQWeaveContracts | null {
  const verifier = readAddress(process.env.NEXT_PUBLIC_VERIFIER_ADDRESS);
  const factory = readAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS);
  const batchExecutor = readAddress(process.env.NEXT_PUBLIC_BATCH_EXECUTOR_ADDRESS);
  const factoryHash = readHash(process.env.NEXT_PUBLIC_FACTORY_CODE_HASH);
  const verifierHash = readHash(process.env.NEXT_PUBLIC_VERIFIER_CODE_HASH);
  const executorHash = readHash(process.env.NEXT_PUBLIC_BATCH_EXECUTOR_CODE_HASH);
  const accountHash = readHash(process.env.NEXT_PUBLIC_ACCOUNT_CODE_HASH);
  const entryPointHash = readHash(process.env.NEXT_PUBLIC_ENTRYPOINT_CODE_HASH);
  if (
    !verifier ||
    !factory ||
    !batchExecutor ||
    !factoryHash ||
    !verifierHash ||
    !executorHash ||
    !accountHash ||
    !entryPointHash
  )
    return null;
  return {
    verifier,
    codeHashes: {
      factory: factoryHash,
      verifier: verifierHash,
      batchExecutor: executorHash,
      account: accountHash,
      entryPoint: entryPointHash,
      forwarder: readHash(process.env.NEXT_PUBLIC_FORWARDER_CODE_HASH),
      accountImpl: readHash(process.env.NEXT_PUBLIC_ACCOUNT_IMPL_CODE_HASH),
    },
    factory,
    batchExecutor,
    forwarder: readAddress(process.env.NEXT_PUBLIC_FORWARDER_ADDRESS),
    accountImpl: readAddress(process.env.NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS),
    attestation: readAddress(process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS),
  };
}

export interface KnownPQWeave {
  /** Known EIP-7702 delegation targets. The original ECDSA key remains authoritative. */
  implementations: Address[];
  /** Known verifier addresses; these alone do not authenticate an account. */
  verifiers: Address[];
}

/**
 * Configured addresses for scanner hints. A known 7702 target is revocable,
 * and a contract's self-reported verifier does not prove its owner policy.
 */
export function getKnownPQWeave(): KnownPQWeave {
  const contracts = getContracts();
  if (!contracts) return { implementations: [], verifiers: [] };
  const implementations = [contracts.batchExecutor];
  if (contracts.forwarder) implementations.push(contracts.forwarder);
  if (contracts.accountImpl) implementations.push(contracts.accountImpl);
  return { implementations, verifiers: [contracts.verifier] };
}

export interface StellarVaultConfig {
  /** Uploaded vault wasm hash; per-user instances deploy from this. */
  wasmHash: string;
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
}

/**
 * The Stellar (Soroban) post-quantum vault deployment. Non-EVM, so it is kept
 * separate from getContracts. Returns null until the wasm is uploaded and wired
 * (see packages/stellar-vault/deploy.sh) — the /protect/stellar page then
 * degrades to an explainer only.
 */
export function getStellarVault(): StellarVaultConfig | null {
  const wasmHash = process.env.NEXT_PUBLIC_STELLAR_VAULT_WASM_HASH;
  if (!wasmHash) return null;
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  const isMainnet = network === 'mainnet' || network === 'public';
  return {
    wasmHash,
    network,
    networkPassphrase:
      process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
      (isMainnet
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015'),
    rpcUrl:
      process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
      (isMainnet ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org'),
  };
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
