import { type Address, encodeFunctionData, type Hex, type PublicClient } from 'viem';
import {
  type AccountCall,
  batchExecutorAbi,
  erc20Abi,
  erc721Abi,
  migrationSweeperAbi,
} from '../account/index.js';

export interface Erc20Holding {
  token: Address;
  amount: bigint;
}

export interface Erc721Holding {
  token: Address;
  tokenId: bigint;
}

export interface Erc1155Holding {
  token: Address;
  id: bigint;
  amount: bigint;
}

export interface SelfSweepPlan {
  /** Destination quantum-safe account. */
  to: Address;
  /** The account currently holding the assets (this account, post EIP-7702). */
  from: Address;
  native?: bigint;
  erc20s?: Erc20Holding[];
  erc721s?: Erc721Holding[];
}

/**
 * Build the batched calls that move assets out of an account that already holds
 * them — the EIP-7702 self-sweep path, executed via `executeBatch`.
 */
export function buildSelfSweepCalls(plan: SelfSweepPlan): AccountCall[] {
  const calls: AccountCall[] = [];

  for (const { token, amount } of plan.erc20s ?? []) {
    calls.push({
      dest: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [plan.to, amount],
      }),
    });
  }

  for (const { token, tokenId } of plan.erc721s ?? []) {
    calls.push({
      dest: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc721Abi,
        functionName: 'transferFrom',
        args: [plan.from, plan.to, tokenId],
      }),
    });
  }

  if (plan.native && plan.native > 0n) {
    calls.push({ dest: plan.to, value: plan.native, data: '0x' });
  }

  return calls;
}

export interface BatchCall {
  target: Address;
  value: bigint;
  data: Hex;
}

/**
 * Build the calls that move every asset out of an EOA in a single EIP-7702
 * transaction. The EOA delegates to BatchExecutor and runs these as itself, so
 * ERC-20s and NFTs move by direct transfer — no prior approvals needed.
 */
export function buildOneClickSweep(plan: SelfSweepPlan): BatchCall[] {
  const calls: BatchCall[] = [];

  for (const { token, amount } of plan.erc20s ?? []) {
    calls.push({
      target: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [plan.to, amount],
      }),
    });
  }

  for (const { token, tokenId } of plan.erc721s ?? []) {
    calls.push({
      target: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc721Abi,
        functionName: 'transferFrom',
        args: [plan.from, plan.to, tokenId],
      }),
    });
  }

  if (plan.native && plan.native > 0n) {
    calls.push({ target: plan.to, value: plan.native, data: '0x' });
  }

  return calls;
}

export function encodeBatchExecute(calls: BatchCall[]): Hex {
  return encodeFunctionData({ abi: batchExecutorAbi, functionName: 'executeBatch', args: [calls] });
}

export interface OneClickMigration {
  /** BatchExecutor address the EOA delegates to (EIP-7702 authorization target). */
  delegate: Address;
  /** Calldata the EOA calls on itself within the same transaction. */
  data: Hex;
}

/**
 * Assemble a one-click EIP-7702 migration: the wallet signs an authorization to
 * `executor`, then sends a single transaction to itself with `data` to sweep
 * everything into the quantum-safe account.
 */
export function buildOneClickMigration(executor: Address, plan: SelfSweepPlan): OneClickMigration {
  return { delegate: executor, data: encodeBatchExecute(buildOneClickSweep(plan)) };
}

export interface SweeperPlan {
  to: Address;
  /** ERC-20s to move; `amount` 0 sweeps the full balance. */
  erc20s?: Erc20Holding[];
  erc721s?: Erc721Holding[];
  erc1155s?: Erc1155Holding[];
}

/**
 * Encode a call to MigrationSweeper.sweep — the approval-based path for moving
 * assets from a still-exposed EOA into a new account in one transaction.
 */
export function encodeSweeperCall(plan: SweeperPlan): Hex {
  return encodeFunctionData({
    abi: migrationSweeperAbi,
    functionName: 'sweep',
    args: [
      plan.to,
      (plan.erc20s ?? []).map((h) => ({ token: h.token, amount: h.amount })),
      (plan.erc721s ?? []).map((h) => ({ token: h.token, tokenId: h.tokenId })),
      (plan.erc1155s ?? []).map((h) => ({ token: h.token, id: h.id, amount: h.amount })),
    ],
  });
}

/**
 * Read ERC-20 balances for a set of candidate tokens and return the non-zero
 * holdings. Token discovery itself is indexer-agnostic: pass a candidate list
 * from any source (a token list, an indexer, the user's history).
 */
export async function discoverErc20Balances(
  client: PublicClient,
  owner: Address,
  tokens: Address[],
): Promise<Erc20Holding[]> {
  const results = await client.multicall({
    allowFailure: true,
    contracts: tokens.map((token) => ({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner] as const,
    })),
  });

  const holdings: Erc20Holding[] = [];
  results.forEach((result, index) => {
    if (result.status === 'success' && (result.result as bigint) > 0n) {
      holdings.push({ token: tokens[index]!, amount: result.result as bigint });
    }
  });
  return holdings;
}

/** What kind of migration a chain's exposure model permits. */
export type MigrationLevel = 'quantum-safe' | 'transitional' | 'none';

/** How public keys become exposed on a chain, which determines the fix. */
export type ExposureModel = 'evm' | 'utxo' | 'account-first-spend' | 'address-is-key';

export interface MigrationCapability {
  level: MigrationLevel;
  summary: string;
}

/**
 * The canonical, honest migration capability per exposure model. Only EVM
 * supports a true quantum-safe migration today, because only EVM has the
 * smart-contract layer required to enforce a post-quantum signature.
 */
export function migrationCapability(model: ExposureModel): MigrationCapability {
  switch (model) {
    case 'evm':
      return {
        level: 'quantum-safe',
        summary: 'One-click EIP-7702 sweep into a post-quantum account.',
      };
    case 'utxo':
    case 'account-first-spend':
      return {
        level: 'transitional',
        summary:
          'Move funds to a fresh, never-used address. This defers exposure but is not quantum-safe; a permanent fix needs a protocol-level upgrade.',
      };
    case 'address-is-key':
      return {
        level: 'none',
        summary:
          'No application-layer fix: the address is the public key. Protection requires a protocol-level post-quantum upgrade.',
      };
  }
}
