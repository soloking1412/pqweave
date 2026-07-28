import { describe, expect, it } from 'vitest';
import { scanWallet, type ScanAccount } from '../src/bitcoin/wallet-scan.js';
import { buildWalletReport, toCsv, METHODOLOGY } from '../src/bitcoin/report.js';
import { deriveAddresses, parseExtendedKey } from '../src/bitcoin/hd.js';

// Canonical BIP-84 test vector (mnemonic "abandon abandon … about").
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

const ACCOUNT: ScanAccount = {
  label: 'Cold storage',
  extendedKey: ZPUB,
  origin: { masterFingerprint: '73c5da0a', accountPath: "m/84'/0'/0'" },
};

/** Addresses of the first `n` receive + change entries, in derivation order. */
function addressesFor(chain: 'receive' | 'change', n: number): string[] {
  const parsed = parseExtendedKey(ZPUB);
  return deriveAddresses(parsed, { maxPerChain: n, chains: [chain] }).map((a) => a.address);
}

interface StubAddress {
  txCount: number;
  funded?: number;
  spent?: number;
  spentCount?: number;
}

/** Esplora stub driven by an address → stats map. Records call count. */
function stubFetch(map: Record<string, StubAddress>) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    const href = typeof url === 'string' ? url : url.toString();
    const address = href.split('/address/')[1]?.split('/')[0] ?? '';
    calls.push(address);
    const entry = map[address] ?? { txCount: 0 };
    return new Response(
      JSON.stringify({
        chain_stats: {
          funded_txo_sum: entry.funded ?? 0,
          spent_txo_sum: entry.spent ?? 0,
          spent_txo_count: entry.spentCount ?? 0,
          tx_count: entry.txCount,
        },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('wallet scan gap limit', () => {
  it('stops after the configured run of unused addresses', async () => {
    const receive = addressesFor('receive', 40);
    // Only the first address is used; with gapLimit 5 the scan should stop early.
    const { impl, calls } = stubFetch({ [receive[0]!]: { txCount: 3, funded: 100_000 } });

    const result = await scanWallet([ACCOUNT], {
      fetchImpl: impl,
      gapLimit: 5,
      batchSize: 5,
      concurrency: 2,
    });

    expect(result.complete).toBe(true);
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]!.address).toBe(receive[0]);
    // Far fewer than the 1000-per-chain cap: the gap limit did its job.
    expect(calls.length).toBeLessThan(40);
  });

  it('keeps scanning past a gap when later addresses are used', async () => {
    const receive = addressesFor('receive', 30);
    const { impl } = stubFetch({
      [receive[0]!]: { txCount: 1, funded: 10_000 },
      [receive[7]!]: { txCount: 1, funded: 20_000 },
    });

    const result = await scanWallet([ACCOUNT], {
      fetchImpl: impl,
      gapLimit: 10,
      batchSize: 5,
    });
    const found = result.addresses.map((a) => a.address);
    expect(found).toContain(receive[0]);
    expect(found).toContain(receive[7]);
  });
});

describe('wallet scan resume', () => {
  it('a resumed scan finds the same addresses as an uninterrupted one', async () => {
    const receive = addressesFor('receive', 20);
    const used = {
      [receive[0]!]: { txCount: 1, funded: 50_000 },
      [receive[3]!]: { txCount: 2, funded: 70_000 },
    };

    const full = await scanWallet([ACCOUNT], {
      fetchImpl: stubFetch(used).impl,
      gapLimit: 6,
      batchSize: 4,
    });

    // Interrupt after the first round, then resume from the cursor.
    const controller = new AbortController();
    let rounds = 0;
    const partial = await scanWallet([ACCOUNT], {
      fetchImpl: stubFetch(used).impl,
      gapLimit: 6,
      batchSize: 4,
      signal: controller.signal,
      onProgress: () => {
        if (++rounds === 1) controller.abort();
      },
    });
    expect(partial.complete).toBe(false);

    const resumed = await scanWallet([ACCOUNT], {
      fetchImpl: stubFetch(used).impl,
      gapLimit: 6,
      batchSize: 4,
      cursor: partial.cursor,
    });

    const combined = [...partial.addresses, ...resumed.addresses].map((a) => a.address).sort();
    expect(combined).toEqual(full.addresses.map((a) => a.address).sort());
  });
});

describe('wallet scan resilience', () => {
  it('retries a rate-limited address and still records it', async () => {
    const receive = addressesFor('receive', 10);
    let hits = 0;
    const impl = (async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();
      const address = href.split('/address/')[1]?.split('/')[0] ?? '';
      if (address === receive[0] && hits++ < 2) {
        return new Response('rate limited', { status: 429 });
      }
      const txCount = address === receive[0] ? 5 : 0;
      return new Response(
        JSON.stringify({
          chain_stats: {
            funded_txo_sum: txCount ? 90_000 : 0,
            spent_txo_sum: 0,
            spent_txo_count: 0,
            tx_count: txCount,
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await scanWallet([ACCOUNT], {
      fetchImpl: impl,
      gapLimit: 4,
      batchSize: 4,
      backoffMs: 1,
    });
    expect(hits).toBeGreaterThanOrEqual(2); // it actually retried
    expect(result.addresses.map((a) => a.address)).toContain(receive[0]);
    expect(result.errors).toHaveLength(0);
  });

  it('records a permanently failing address as an error without truncating the scan', async () => {
    const receive = addressesFor('receive', 10);
    const impl = (async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();
      const address = href.split('/address/')[1]?.split('/')[0] ?? '';
      if (address === receive[1]) return new Response('nope', { status: 500 });
      const txCount = address === receive[2] ? 1 : 0;
      return new Response(
        JSON.stringify({
          chain_stats: {
            funded_txo_sum: txCount ? 12_345 : 0,
            spent_txo_sum: 0,
            spent_txo_count: 0,
            tx_count: txCount,
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await scanWallet([ACCOUNT], {
      fetchImpl: impl,
      gapLimit: 4,
      batchSize: 4,
      retries: 1,
      backoffMs: 1,
    });
    expect(result.errors.some((e) => e.address === receive[1])).toBe(true);
    // The address after the failure is still found.
    expect(result.addresses.map((a) => a.address)).toContain(receive[2]);
  });
});

describe('institutional report', () => {
  async function scanFixture() {
    const receive = addressesFor('receive', 10);
    return scanWallet([ACCOUNT], {
      fetchImpl: stubFetch({
        // spent from → exposed
        [receive[0]!]: { txCount: 4, funded: 300_000, spent: 100_000, spentCount: 1 },
        // received only → not yet exposed
        [receive[1]!]: { txCount: 1, funded: 50_000 },
        [receive[2]!]: { txCount: 2, funded: 900_000, spent: 400_000, spentCount: 2 },
      }).impl,
      gapLimit: 4,
      batchSize: 4,
    });
  }

  it('rolls up exposed vs unexposed balances correctly', async () => {
    const report = buildWalletReport(await scanFixture(), { generatedAt: '2026-07-29T00:00:00Z' });

    expect(report.totals.accounts).toBe(1);
    expect(report.totals.addresses).toBe(3);
    expect(report.totals.exposedAddresses).toBe(2);
    // exposed: (300k-100k) + (900k-400k) = 700k ; unexposed: 50k
    expect(report.totals.exposedSats).toBe(700_000n);
    expect(report.totals.unexposedSats).toBe(50_000n);
    expect(report.totals.totalSats).toBe(750_000n);
    expect(report.complete).toBe(true);
  });

  it('ranks the largest exposed balances first', async () => {
    const report = buildWalletReport(await scanFixture());
    const top = report.accounts[0]!.topExposed;
    expect(top[0]!.sats).toBe(500_000n);
    expect(top[1]!.sats).toBe(200_000n);
  });

  it('exports CSV with integer satoshis and a header', async () => {
    const scan = await scanFixture();
    const csv = toCsv(scan);
    const [header, ...rows] = csv.split('\n');
    expect(header).toBe(
      'account,address,path,chain,index,type,exposed,has_spent,tx_count,balance_sats',
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => /,\d+$/.test(r))).toBe(true);
    expect(csv).toContain('Cold storage');
  });

  it('publishes the methodology with the numbers', async () => {
    const report = buildWalletReport(await scanFixture());
    expect(report.methodology).toBe(METHODOLOGY);
    expect(report.methodology).toMatch(/gap limit/i);
    expect(report.methodology).toMatch(/Taproot/);
  });
});
