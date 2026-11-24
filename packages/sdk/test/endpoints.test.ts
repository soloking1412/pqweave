import { describe, expect, it } from 'vitest';
import { CHAINS } from '../src/chains/index.js';
import { withEndpointFailover } from '../src/endpoints.js';
import { scanSolanaAddress } from '../src/solana/index.js';
import { scanSuiAddress } from '../src/sui/index.js';

const SOLANA = 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg';
const SUI = `0x${'ab'.repeat(32)}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('endpoint failover', () => {
  it('moves to the next endpoint when one fails', async () => {
    const seen: string[] = [];
    const scan = withEndpointFailover(
      async (_address: string, options: { url?: string }) => {
        seen.push(options.url!);
        if (options.url === 'a') throw new Error('down');
        return options.url;
      },
      'url',
      ['a', 'b', 'c'],
    );
    expect(await scan('x')).toBe('b');
    expect(seen).toEqual(['a', 'b']);
  });

  it('uses a named endpoint alone and lets its failure surface', async () => {
    const seen: string[] = [];
    const scan = withEndpointFailover(
      async (_address: string, options: { url?: string }) => {
        seen.push(options.url!);
        throw new Error('dedicated endpoint down');
      },
      'url',
      ['a', 'b'],
    );
    await expect(scan('x', { url: 'mine' })).rejects.toThrow('dedicated endpoint down');
    expect(seen).toEqual(['mine']);
  });

  it('reports the last error when every endpoint fails', async () => {
    const scan = withEndpointFailover(
      async (_address: string, options: { url?: string }) => {
        throw new Error(`${options.url} down`);
      },
      'url',
      ['a', 'b'],
    );
    await expect(scan('x')).rejects.toThrow('b down');
  });

  it('a Solana scan survives a dead first RPC', async () => {
    const hosts: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      hosts.push(new URL(String(url)).host);
      if (hosts.length === 1) return json({}, 503);
      return json({ jsonrpc: '2.0', id: 1, result: { value: 5_000_000_000 } });
    }) as typeof fetch;
    const result = await scanSolanaAddress(SOLANA, { fetchImpl });
    expect(result.exposed).toBe(true);
    expect(result.lamports).toBe(5_000_000_000n);
    expect(new Set(hosts).size).toBe(2);
  });

  it('every EVM chain lists at least three distinct https endpoints', () => {
    for (const config of Object.values(CHAINS)) {
      expect(config.rpcUrls.length).toBeGreaterThanOrEqual(3);
      expect(new Set(config.rpcUrls).size).toBe(config.rpcUrls.length);
      for (const url of config.rpcUrls) expect(new URL(url).protocol).toBe('https:');
    }
  });
});

describe('Sui scan over GraphQL', () => {
  const reply = (totalBalance: string, sent: number) =>
    (async () =>
      json({
        data: {
          address: {
            balance: { totalBalance },
            transactions: { nodes: Array.from({ length: sent }, () => ({ digest: 'd' })) },
          },
        },
      })) as typeof fetch;

  it('an address that has sent a transaction is exposed', async () => {
    const result = await scanSuiAddress(SUI, { fetchImpl: reply('2500000000', 1) });
    expect(result.exposed).toBe(true);
    expect(result.balance).toBe('2.5');
  });

  it('a funded address that never sent is not exposed', async () => {
    const result = await scanSuiAddress(SUI, { fetchImpl: reply('1000000000', 0) });
    expect(result.exposed).toBe(false);
  });

  it('an unknown address reads as empty and unexposed', async () => {
    const fetchImpl = (async () => json({ data: { address: null } })) as typeof fetch;
    const result = await scanSuiAddress(SUI, { fetchImpl });
    expect(result.exposed).toBe(false);
    expect(result.balance).toBe('0');
  });

  it('a GraphQL error is an error, not a clean reading', async () => {
    const fetchImpl = (async () =>
      json({ data: null, errors: [{ message: 'bad query' }] })) as typeof fetch;
    await expect(scanSuiAddress(SUI, { fetchImpl })).rejects.toThrow('bad query');
  });
});
