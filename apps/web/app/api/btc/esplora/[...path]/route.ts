import { BITCOIN } from '@pqweave/sdk/bitcoin';

export const dynamic = 'force-dynamic';

/**
 * Narrow Esplora passthrough, so a whole-wallet scan can run in the browser
 * without tripping CORS. The SDK's scanner builds standard Esplora paths, so
 * pointing it at this route lets it work unchanged.
 *
 * It is deliberately not a general proxy: only the read-only paths the scanner
 * needs are allowed, everything else is refused. No key material can pass
 * through here — these endpoints take an address or a txid and return public
 * chain data.
 */

const TESTNET_API = 'https://blockstream.info/testnet/api';

/** Read-only paths the wallet scan and evacuation kit actually use. */
const ALLOWED: RegExp[] = [
  /^address\/[a-zA-Z0-9]{20,100}$/, // address stats
  /^address\/[a-zA-Z0-9]{20,100}\/utxo$/, // unspent outputs
  /^tx\/[0-9a-fA-F]{64}\/hex$/, // previous transaction, for nonWitnessUtxo
  /^fee-estimates$/,
];

function withTimeout<T>(promise: Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const joined = path.join('/');

  if (!ALLOWED.some((re) => re.test(joined))) {
    return Response.json({ error: 'path not allowed' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const base = searchParams.get('network') === 'testnet' ? TESTNET_API : BITCOIN.apiUrl;

  try {
    const upstream = await withTimeout(fetch(`${base}/${joined}`));
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'text/plain',
        // The scan walks many addresses; let the browser reuse responses briefly.
        'cache-control': 'private, max-age=30',
      },
    });
  } catch {
    return Response.json({ error: 'Bitcoin indexer unavailable' }, { status: 502 });
  }
}
