import {
  broadcastTx,
  checkDestination,
  feeTiers,
  getFeeEstimates,
  getTxHex,
  listUtxos,
} from '@pqweave/sdk/bitcoin';
import { BITCOIN } from '@pqweave/sdk/bitcoin';
import type { UtxoNetwork } from '@pqweave/sdk/bitcoin';

export const dynamic = 'force-dynamic';

/**
 * Thin server proxy to an Esplora indexer for the evacuation kit — UTXO
 * listing, fee estimates, and broadcast. It only ever forwards addresses and
 * already-formed transactions; no key material passes through here. The proxy
 * exists to sidestep browser CORS/rate-limit flakiness, not to add trust.
 */

const TESTNET: UtxoNetwork = {
  ...BITCOIN,
  id: 'bitcoin',
  name: 'Bitcoin testnet',
  apiUrl: 'https://blockstream.info/testnet/api',
  bech32Hrps: ['tb1', 'bcrt1'],
};

function pickNetwork(param: string | null): UtxoNetwork {
  return param === 'testnet' ? TESTNET : BITCOIN;
}

function withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
}

/**
 * Retry budget for a user-facing request. Kept deliberately small and bounded
 * per attempt so the retries fit inside the route's own deadline — otherwise a
 * slow indexer turns into a hard failure instead of a slow success.
 */
const PROXY_FETCH: { retries: number; timeoutMs: number; backoffMs: number } = {
  retries: 1,
  timeoutMs: 7_000,
  backoffMs: 300,
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const op = searchParams.get('op');
  const network = pickNetwork(searchParams.get('network'));

  try {
    if (op === 'utxos') {
      const address = (searchParams.get('address') ?? '').trim();
      if (!address) return Response.json({ error: 'address required' }, { status: 400 });
      const utxos = await withTimeout(listUtxos(address, network, PROXY_FETCH));
      return Response.json({ utxos });
    }
    if (op === 'fees') {
      const estimates = await withTimeout(getFeeEstimates(network, PROXY_FETCH));
      return Response.json({ tiers: feeTiers(estimates) });
    }
    if (op === 'txhex') {
      // Legacy and wrapped-SegWit inputs cannot be signed without the full
      // previous transaction (PSBT nonWitnessUtxo).
      const txid = (searchParams.get('txid') ?? '').trim();
      if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
        return Response.json({ error: 'valid txid required' }, { status: 400 });
      }
      const hex = await withTimeout(getTxHex(txid, network, PROXY_FETCH));
      return Response.json({ hex });
    }
    if (op === 'destcheck') {
      const address = (searchParams.get('address') ?? '').trim();
      if (!address) return Response.json({ error: 'address required' }, { status: 400 });
      const sources = (searchParams.get('sources') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const check = await withTimeout(
        checkDestination(address, network, { ...PROXY_FETCH, sourceAddresses: sources }),
      );
      return Response.json({ check });
    }
    return Response.json({ error: 'unknown op' }, { status: 400 });
  } catch {
    return Response.json({ error: 'Bitcoin indexer unavailable. Try again.' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const network = pickNetwork(searchParams.get('network'));
  if (searchParams.get('op') !== 'broadcast') {
    return Response.json({ error: 'unknown op' }, { status: 400 });
  }
  const rawHex = (await request.text()).trim();
  if (!/^[0-9a-fA-F]+$/.test(rawHex)) {
    return Response.json({ error: 'body must be a raw transaction hex' }, { status: 400 });
  }
  try {
    const txid = await withTimeout(broadcastTx(rawHex, network, PROXY_FETCH));
    return Response.json({ txid });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'broadcast failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
