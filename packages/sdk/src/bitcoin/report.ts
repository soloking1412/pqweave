import type { UtxoAddressType } from './types.js';
import type { ScanAddressRecord, WalletScanResult } from './wallet-scan.js';

/**
 * Institutional exposure reporting.
 *
 * A custodian needs a number it can act on and defend, not a colour-coded
 * score. This rolls a wallet scan up per account, splits the balance into
 * exposed and not-yet-exposed, and exports as JSON or CSV.
 *
 * {@link METHODOLOGY} is published alongside the figures on purpose: an
 * exposure number that cannot be independently checked is worth very little,
 * so the rules that produced it travel with it.
 */

export const METHODOLOGY = `PQWeave Bitcoin exposure methodology

A public key is "exposed" when it can be read from the chain today. A quantum
computer running Shor's algorithm could derive the private key from it, so
exposed coins are the ones at risk first.

An address is counted as EXPOSED when either:
  1. it has been spent from at least once (spending publishes the public key in
     the input's signature script or witness), or
  2. it is a Taproot (P2TR) output, which commits the key in the output itself
     and is therefore exposed from the moment it is funded.

An address is counted as NOT YET EXPOSED when it has received funds but has
never been spent from. The public key stays behind a hash until the first
spend. This is a delay, not protection: spending reveals the key, and the
transaction sits in the mempool before it confirms.

Balance is computed as funded_txo_sum - spent_txo_sum from an Esplora-compatible
indexer, in satoshis, with no price conversion.

Wallet coverage is determined by a BIP-44 gap limit: each account chain is
walked until N consecutive unused addresses are seen (default 20). Addresses
beyond the gap are assumed unused. An address whose lookup failed is reported
under "errors" and does not end a gap run, so a transient indexer failure
cannot silently truncate a wallet.

Limitations: this reads confirmed chain state from a third-party indexer and
inherits its view. It does not detect keys exposed off-chain (reused elsewhere,
leaked, or published), and it cannot see coins in accounts whose extended public
key was not supplied.`;

export interface ExposureBucket {
  count: number;
  sats: bigint;
}

export interface AccountRollup {
  label: string;
  addressCount: number;
  /** Addresses whose public key is already readable on-chain. */
  exposedCount: number;
  totalSats: bigint;
  /** Balance sitting on exposed addresses — the value actually at risk. */
  exposedSats: bigint;
  /** Balance on addresses not yet spent from. */
  unexposedSats: bigint;
  byType: Partial<Record<UtxoAddressType, ExposureBucket>>;
  /** Largest exposed balances first — where to evacuate from first. */
  topExposed: { address: string; path: string; sats: bigint; type: UtxoAddressType }[];
}

export interface WalletReport {
  generatedAt: string;
  network: string;
  totals: {
    accounts: number;
    addresses: number;
    exposedAddresses: number;
    totalSats: bigint;
    exposedSats: bigint;
    unexposedSats: bigint;
  };
  accounts: AccountRollup[];
  /** Addresses that could not be checked; their balances are not counted. */
  errors: { address: string; message: string }[];
  /** True when the scan finished rather than hitting a cap or cancellation. */
  complete: boolean;
  methodology: string;
}

export interface BuildReportOptions {
  /** How many top exposed addresses to list per account. Default 5. */
  topN?: number;
  /** Override the timestamp (tests, reproducible exports). */
  generatedAt?: string;
}

function emptyRollup(label: string): AccountRollup {
  return {
    label,
    addressCount: 0,
    exposedCount: 0,
    totalSats: 0n,
    exposedSats: 0n,
    unexposedSats: 0n,
    byType: {},
    topExposed: [],
  };
}

/** Roll a wallet scan up into per-account figures plus a wallet total. */
export function buildWalletReport(
  scan: WalletScanResult,
  options: BuildReportOptions = {},
): WalletReport {
  const topN = options.topN ?? 5;
  const byLabel = new Map<string, AccountRollup>();
  const exposedByLabel = new Map<string, ScanAddressRecord[]>();

  for (const record of scan.addresses) {
    const rollup = byLabel.get(record.accountLabel) ?? emptyRollup(record.accountLabel);
    rollup.addressCount++;
    rollup.totalSats += record.balanceSats;

    const bucket = rollup.byType[record.type] ?? { count: 0, sats: 0n };
    bucket.count++;
    bucket.sats += record.balanceSats;
    rollup.byType[record.type] = bucket;

    if (record.exposed) {
      rollup.exposedCount++;
      rollup.exposedSats += record.balanceSats;
      const list = exposedByLabel.get(record.accountLabel) ?? [];
      list.push(record);
      exposedByLabel.set(record.accountLabel, list);
    } else {
      rollup.unexposedSats += record.balanceSats;
    }
    byLabel.set(record.accountLabel, rollup);
  }

  const accounts = [...byLabel.values()].map((rollup) => ({
    ...rollup,
    topExposed: (exposedByLabel.get(rollup.label) ?? [])
      .filter((r) => r.balanceSats > 0n)
      .sort((a, b) => (b.balanceSats > a.balanceSats ? 1 : b.balanceSats < a.balanceSats ? -1 : 0))
      .slice(0, topN)
      .map((r) => ({ address: r.address, path: r.path, sats: r.balanceSats, type: r.type })),
  }));

  const totals = accounts.reduce(
    (acc, a) => ({
      accounts: acc.accounts + 1,
      addresses: acc.addresses + a.addressCount,
      exposedAddresses: acc.exposedAddresses + a.exposedCount,
      totalSats: acc.totalSats + a.totalSats,
      exposedSats: acc.exposedSats + a.exposedSats,
      unexposedSats: acc.unexposedSats + a.unexposedSats,
    }),
    {
      accounts: 0,
      addresses: 0,
      exposedAddresses: 0,
      totalSats: 0n,
      exposedSats: 0n,
      unexposedSats: 0n,
    },
  );

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    network: scan.network,
    totals,
    accounts,
    errors: scan.errors,
    complete: scan.complete,
    methodology: METHODOLOGY,
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Per-address CSV of the scan, for a spreadsheet or an internal risk system.
 * Satoshis are written as integers so no precision is lost.
 */
export function toCsv(scan: WalletScanResult): string {
  const header = [
    'account',
    'address',
    'path',
    'chain',
    'index',
    'type',
    'exposed',
    'has_spent',
    'tx_count',
    'balance_sats',
  ];
  const rows = scan.addresses.map((r) =>
    [
      csvCell(r.accountLabel),
      r.address,
      r.path,
      r.chain,
      String(r.index),
      r.type,
      r.exposed ? 'yes' : 'no',
      r.hasSpent ? 'yes' : 'no',
      String(r.txCount),
      r.balanceSats.toString(),
    ].join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

/** JSON export with bigint satoshi values rendered as strings. */
export function toJson(report: WalletReport): string {
  return JSON.stringify(
    report,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );
}
