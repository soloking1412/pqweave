import { getContracts, type PQWeaveContracts } from './contracts';

/**
 * Where the migration contracts currently run. `preview` means they are not
 * deployed anywhere the UI can reach, so the on-chain step is disabled while the
 * rest of the flow (scan, post-quantum keygen) still works. `testnet` and
 * `mainnet` mean destination deployment and migration can be broadcast.
 */
export type DeploymentStage = 'preview' | 'testnet' | 'mainnet';

export interface SupportedChain {
  id: number;
  name: string;
  testnet: boolean;
}

/** EVM chains the migrate flow recognises. Migration works on any EVM chain
 * with EIP-7702 enabled; these are the ones we label and switch between. */
export const SUPPORTED_CHAINS: SupportedChain[] = [
  { id: 1, name: 'Ethereum', testnet: false },
  { id: 8453, name: 'Base', testnet: false },
  { id: 42161, name: 'Arbitrum', testnet: false },
  { id: 10, name: 'Optimism', testnet: false },
  { id: 137, name: 'Polygon', testnet: false },
  { id: 84532, name: 'Base Sepolia', testnet: true },
  { id: 11155111, name: 'Sepolia', testnet: true },
];

export function chainName(id: number | undefined): string | null {
  if (id === undefined) return null;
  return SUPPORTED_CHAINS.find((chain) => chain.id === id)?.name ?? null;
}

/** A configured testnet deployment must never execute on a mainnet wallet. */
export function isExecutionNetwork(stage: DeploymentStage, chainId: number): boolean {
  return (
    stage === 'testnet' &&
    chainId === 11155111 &&
    process.env.NEXT_PUBLIC_DEPLOYMENT_CHAIN_ID === String(chainId)
  );
}

export interface DeploymentStatus {
  stage: DeploymentStage;
  contracts: PQWeaveContracts | null;
  /** True when a real migration transaction can be broadcast. */
  live: boolean;
}

export function getDeploymentStatus(): DeploymentStatus {
  const contracts = getContracts();
  if (!contracts) {
    return { stage: 'preview', contracts: null, live: false };
  }
  // Browser signing-state recovery is not production qualified. An environment
  // flag is not audit evidence and must not enable mainnet fund movement.
  if (
    process.env.NEXT_PUBLIC_DEPLOYMENT_STAGE !== 'testnet' ||
    process.env.NEXT_PUBLIC_DEPLOYMENT_CHAIN_ID !== '11155111'
  ) {
    return { stage: 'preview', contracts: null, live: false };
  }
  const stage: DeploymentStage = 'testnet';
  return { stage, contracts, live: true };
}
