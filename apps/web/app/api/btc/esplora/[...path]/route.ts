import {
  getAddressStats,
  getFeeEstimates,
  getTxHex,
  isBitcoinAddressOnNetwork,
  listUtxos,
} from '@pqweave/sdk/bitcoin';
import { bitcoinIndexerNetwork, bitcoinJson, BITCOIN_FETCH } from '@/lib/bitcoin-indexer';
export const dynamic = 'force-dynamic';
/** Validated, uncached reads for public scans and plan freshness checks. */
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  let selected;
  try {
    selected = bitcoinIndexerNetwork(new URL(request.url).searchParams.get('network'));
  } catch {
    return bitcoinJson({ error: 'Unsupported Bitcoin network' }, 400);
  }
  const { key, network } = selected;
  const options = { ...BITCOIN_FETCH, signal: request.signal };
  try {
    if (path[0] === 'address' && path[1] && isBitcoinAddressOnNetwork(path[1], key)) {
      if (path.length === 2) return bitcoinJson(await getAddressStats(path[1], network, options));
      if (path.length === 3 && path[2] === 'utxo')
        return bitcoinJson(await listUtxos(path[1], network, options));
    }
    if (
      path.length === 3 &&
      path[0] === 'tx' &&
      /^[0-9a-fA-F]{64}$/.test(path[1] ?? '') &&
      path[2] === 'hex'
    ) {
      return new Response(await getTxHex(path[1]!, network, options), {
        headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
      });
    }
    if (path.length === 1 && path[0] === 'fee-estimates')
      return bitcoinJson(await getFeeEstimates(network, options));
    return bitcoinJson({ error: 'Path or address not allowed' }, 400);
  } catch {
    return bitcoinJson({ error: 'Bitcoin indexer unavailable or invalid response' }, 502);
  }
}
