import { hex } from '@scure/base';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  deriveAddresses,
  formatDerivationPath,
  parseDerivationPath,
  parseExtendedKey,
} from '../src/bitcoin/hd.js';
import { scanWallet, type ScanAccount } from '../src/bitcoin/wallet-scan.js';
import { buildWalletReport, toCsv } from '../src/bitcoin/report.js';

/**
 * Property-based tests for wallet derivation, scanning and reporting.
 *
 * The failure modes here are quiet ones: a derivation error sweeps to an address
 * you do not control, and a gap-limit bug silently under-reports a wallet, which
 * looks exactly like good news.
 */

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const ORIGIN = { masterFingerprint: '73c5da0a', accountPath: "m/84'/0'/0'" };
const HARDENED = 0x80000000;

describe('derivation path parsing round-trips', () => {
  const componentArb = fc.integer({ min: 0, max: 0x7fffffff });

  it('parse ∘ format is the identity for any path', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(componentArb, fc.boolean()), { maxLength: 8 }), (parts) => {
        const components = parts.map(([n, hard]) => (hard ? n + HARDENED : n));
        expect(parseDerivationPath(formatDerivationPath(components))).toEqual(components);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('accepts both apostrophe and h notation for hardened components', () => {
    fc.assert(
      fc.property(fc.array(componentArb, { minLength: 1, maxLength: 5 }), (nums) => {
        const apostrophe = `m/${nums.map((n) => `${n}'`).join('/')}`;
        const hNotation = `m/${nums.map((n) => `${n}h`).join('/')}`;
        expect(parseDerivationPath(apostrophe)).toEqual(parseDerivationPath(hNotation));
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('rejects malformed segments rather than guessing', () => {
    // Generate segments that are genuinely invalid. Filtering random strings is
    // not enough: "1h" is valid hardened notation and anything containing "/"
    // is a valid multi-segment path, so a loose filter makes this test flaky
    // rather than wrong.
    const invalidSegment = fc.oneof(
      fc.constantFrom('', ' ', "'", 'h', 'x', 'abc', '-1', '1.5', '0x1', "1''", "1'h", '١٢٣'),
      fc
        .string({ minLength: 1, maxLength: 6 })
        .filter((s) => !/^\d+['h]?$/i.test(s) && !s.includes('/')),
    );
    fc.assert(
      fc.property(invalidSegment, (junk) => {
        expect(() => parseDerivationPath(`m/${junk}`)).toThrow();
        return true;
      }),
      { numRuns: 400 },
    );
  });

  it('accepts only well-formed paths, and the account prefix survives', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 5 }),
        (indices) => {
          const path = `m/${indices.map((n) => `${n}'`).join('/')}`;
          const parsed = parseDerivationPath(path);
          expect(parsed).toHaveLength(indices.length);
          parsed.forEach((c, i) => expect(c).toBe(indices[i]! + HARDENED));
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('address derivation is deterministic and collision-free', () => {
  const parsed = parseExtendedKey(ZPUB);

  it('the same index always yields the same address and pubkey', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), (index) => {
        const a = deriveAddresses(parsed, {
          startIndex: index,
          maxPerChain: 1,
          chains: ['receive'],
        });
        const b = deriveAddresses(parsed, {
          startIndex: index,
          maxPerChain: 1,
          chains: ['receive'],
        });
        expect(a[0]!.address).toBe(b[0]!.address);
        expect(hex.encode(a[0]!.pubkey)).toBe(hex.encode(b[0]!.pubkey));
        return true;
      }),
      { numRuns: 150 },
    );
  });

  it('distinct indices never collide, and receive never equals change', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 300 }), { minLength: 2, maxLength: 12 }),
        (indices) => {
          const seen = new Set<string>();
          for (const index of indices) {
            const [receive] = deriveAddresses(parsed, {
              startIndex: index,
              maxPerChain: 1,
              chains: ['receive'],
            });
            const [change] = deriveAddresses(parsed, {
              startIndex: index,
              maxPerChain: 1,
              chains: ['change'],
            });
            expect(receive!.address).not.toBe(change!.address);
            expect(seen.has(receive!.address)).toBe(false);
            seen.add(receive!.address);
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the full path is account prefix + chain + index, whenever an origin is given', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), fc.boolean(), (index, isChange) => {
        const [entry] = deriveAddresses(parsed, {
          startIndex: index,
          maxPerChain: 1,
          chains: [isChange ? 'change' : 'receive'],
          origin: ORIGIN,
        });
        expect(entry!.pathComponents).toEqual([
          ...parseDerivationPath(ORIGIN.accountPath),
          isChange ? 1 : 0,
          index,
        ]);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

/** Esplora stub where `used` decides which derived indices look funded. */
function stubFor(addresses: Map<string, number>) {
  return (async (url: string | URL | Request) => {
    const href = typeof url === 'string' ? url : url.toString();
    const address = href.split('/address/')[1]?.split('/')[0] ?? '';
    const txCount = addresses.get(address) ?? 0;
    return new Response(
      JSON.stringify({
        chain_stats: {
          funded_txo_sum: txCount ? 100_000 : 0,
          spent_txo_sum: 0,
          spent_txo_count: 0,
          tx_count: txCount,
        },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

describe('gap-limit scanning never truncates a wallet early', () => {
  const parsed = parseExtendedKey(ZPUB);
  const account: ScanAccount = { label: 'W', extendedKey: ZPUB, origin: ORIGIN };

  it('finds every used address that sits within the gap limit', () => {
    fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 0, max: 25 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 5, max: 20 }),
        async (usedIndices, gapLimit) => {
          const sorted = [...usedIndices].sort((a, b) => a - b);
          // Only indices reachable before a run of `gapLimit` unused ones are
          // discoverable — that is the definition of the gap limit, not a bug.
          const reachable: number[] = [];
          let cursor = 0;
          for (const index of sorted) {
            if (index - cursor >= gapLimit) break;
            reachable.push(index);
            cursor = index + 1;
          }

          const map = new Map<string, number>();
          for (const index of sorted) {
            const [entry] = deriveAddresses(parsed, {
              startIndex: index,
              maxPerChain: 1,
              chains: ['receive'],
            });
            map.set(entry!.address, 3);
          }

          const scan = await scanWallet([account], {
            fetchImpl: stubFor(map),
            gapLimit,
            batchSize: 5,
            concurrency: 2,
          });
          const found = new Set(
            scan.addresses.filter((a) => a.chain === 'receive').map((a) => a.index),
          );
          for (const index of reachable) expect(found.has(index)).toBe(true);
          expect(scan.complete).toBe(true);
          return true;
        },
      ),
      { numRuns: 25 },
    );
  });

  it('a wallet with no history terminates and reports nothing', () => {
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 5, max: 15 }), async (gapLimit) => {
        const scan = await scanWallet([account], {
          fetchImpl: stubFor(new Map()),
          gapLimit,
          batchSize: 5,
        });
        expect(scan.addresses).toHaveLength(0);
        expect(scan.complete).toBe(true);
        return true;
      }),
      { numRuns: 10 },
    );
  });
});

describe('report arithmetic always balances', () => {
  const parsed = parseExtendedKey(ZPUB);
  const account: ScanAccount = { label: 'Treasury', extendedKey: ZPUB, origin: ORIGIN };

  it('exposed + unexposed === total, for any mix of spent and unspent addresses', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            index: fc.integer({ min: 0, max: 12 }),
            funded: fc.integer({ min: 1, max: 5_000_000 }),
            spent: fc.integer({ min: 0, max: 5_000_000 }),
            spentCount: fc.integer({ min: 0, max: 3 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (entries) => {
          const byAddress = new Map<string, (typeof entries)[number]>();
          for (const entry of entries) {
            const [derived] = deriveAddresses(parsed, {
              startIndex: entry.index,
              maxPerChain: 1,
              chains: ['receive'],
            });
            // Never spend more than was funded.
            byAddress.set(derived!.address, {
              ...entry,
              spent: Math.min(entry.spent, entry.funded),
            });
          }

          const impl = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            const address = href.split('/address/')[1]?.split('/')[0] ?? '';
            const e = byAddress.get(address);
            return new Response(
              JSON.stringify({
                chain_stats: {
                  funded_txo_sum: e?.funded ?? 0,
                  spent_txo_sum: e?.spent ?? 0,
                  spent_txo_count: e?.spentCount ?? 0,
                  tx_count: e ? 1 + (e.spentCount ?? 0) : 0,
                },
              }),
              { status: 200 },
            );
          }) as unknown as typeof fetch;

          const scan = await scanWallet([account], {
            fetchImpl: impl,
            gapLimit: 15,
            batchSize: 6,
          });
          const report = buildWalletReport(scan);

          // The headline invariant: no satoshi is double-counted or lost.
          expect(report.totals.exposedSats + report.totals.unexposedSats).toBe(
            report.totals.totalSats,
          );
          expect(report.totals.exposedAddresses).toBeLessThanOrEqual(report.totals.addresses);

          // Per-account rollups must sum to the wallet totals.
          const summed = report.accounts.reduce(
            (acc, a) => ({
              total: acc.total + a.totalSats,
              exposed: acc.exposed + a.exposedSats,
              count: acc.count + a.addressCount,
            }),
            { total: 0n, exposed: 0n, count: 0 },
          );
          expect(summed.total).toBe(report.totals.totalSats);
          expect(summed.exposed).toBe(report.totals.exposedSats);
          expect(summed.count).toBe(report.totals.addresses);

          // Top-exposed must be a descending subset of the exposed set.
          for (const a of report.accounts) {
            for (let i = 1; i < a.topExposed.length; i++) {
              expect(a.topExposed[i - 1]!.sats >= a.topExposed[i]!.sats).toBe(true);
            }
          }
          return true;
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe('CSV export is injection-safe and lossless', () => {
  it('a label containing commas, quotes or newlines cannot break the row structure', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 24 }), (label) => {
        const csv = toCsv({
          network: 'bitcoin',
          complete: true,
          cursor: { positions: {} },
          errors: [],
          addresses: [
            {
              accountLabel: label,
              address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
              path: '0/0',
              chain: 'receive',
              index: 0,
              network: 'bitcoin',
              type: 'p2wpkh',
              exposed: true,
              hasSpent: true,
              txCount: 2,
              balanceSats: 12_345n,
              pubkey: new Uint8Array(33),
            },
          ],
        });
        const [header, ...rest] = csv.split('\n');
        expect(header!.split(',')).toHaveLength(10);
        // A field containing a delimiter must be quoted, so the row cannot be
        // split into extra columns by a hostile label.
        const body = rest.join('\n');
        if (/[",\n]/.test(label)) expect(body.includes(`"`)).toBe(true);
        // Satoshi values are written as plain integers, never in scientific
        // notation, so a spreadsheet cannot silently round them.
        expect(body.trimEnd().endsWith('12345')).toBe(true);
        return true;
      }),
      { numRuns: 300 },
    );
  });
});
