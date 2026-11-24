import { BITCOIN, type UtxoNetwork } from '@pqweave/sdk/bitcoin';

/** Server-owned endpoints only. Requests cannot supply arbitrary upstream URLs. */
export function bitcoinIndexerNetwork(value: string | null): {
  key: 'bitcoin' | 'testnet';
  network: UtxoNetwork;
} {
  if (value !== null && value !== 'bitcoin' && value !== 'testnet')
    throw new Error('Unsupported Bitcoin network');
  const key = value === 'testnet' ? 'testnet' : 'bitcoin';
  const apiUrl =
    key === 'bitcoin'
      ? (process.env.BITCOIN_ESPLORA_URL ?? BITCOIN.apiUrl)
      : (process.env.BITCOIN_TESTNET_ESPLORA_URL ?? 'https://blockstream.info/testnet/api');
  const url = new URL(apiUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash)
    throw new Error('Invalid configured Bitcoin indexer');
  return {
    key,
    network: {
      ...BITCOIN,
      name: key === 'bitcoin' ? 'Bitcoin' : 'Bitcoin testnet',
      apiUrl: apiUrl.replace(/\/$/, ''),
    },
  };
}
export const BITCOIN_FETCH = {
  retries: 1,
  timeoutMs: 7_000,
  backoffMs: 300,
  fetchImpl: ((url, init) => fetch(url, { ...init, cache: 'no-store' })) as typeof fetch,
};
export const bitcoinJson = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
