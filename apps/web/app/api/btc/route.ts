import {
  checkDestination,
  feeTiers,
  getFeeEstimates,
  getTxHex,
  listUtxos,
  isBitcoinAddressOnNetwork,
} from '@pqweave/sdk/bitcoin';
import { bitcoinIndexerNetwork, bitcoinJson, BITCOIN_FETCH } from '@/lib/bitcoin-indexer';
export const dynamic = 'force-dynamic';
/** Public read-only API. Keys and spend authorizations stay with the wallet. */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  let selected;
  try {
    selected = bitcoinIndexerNetwork(searchParams.get('network'));
  } catch {
    return bitcoinJson({ error: 'Unsupported or unavailable Bitcoin network' }, 400);
  }
  const { key, network } = selected;
  const op = searchParams.get('op');
  const address = (searchParams.get('address') ?? '').trim();
  if (['utxos', 'destcheck'].includes(op ?? '') && !isBitcoinAddressOnNetwork(address, key)) {
    return bitcoinJson({ error: 'Valid address for the selected network required' }, 400);
  }
  const options = { ...BITCOIN_FETCH, signal: request.signal };
  try {
    if (op === 'utxos') return bitcoinJson({ utxos: await listUtxos(address, network, options) });
    if (op === 'fees')
      return bitcoinJson({ tiers: feeTiers(await getFeeEstimates(network, options)) });
    if (op === 'txhex') {
      const txid = searchParams.get('txid') ?? '';
      if (!/^[0-9a-fA-F]{64}$/.test(txid))
        return bitcoinJson({ error: 'Valid transaction id required' }, 400);
      return bitcoinJson({ hex: await getTxHex(txid, network, options) });
    }
    if (op === 'destcheck') {
      const sources = (searchParams.get('sources') ?? '').split(',').filter(Boolean);
      if (sources.length > 100 || sources.some((a) => !isBitcoinAddressOnNetwork(a, key)))
        return bitcoinJson({ error: 'Invalid source addresses' }, 400);
      return bitcoinJson({
        check: await checkDestination(address, network, {
          ...options,
          sourceAddresses: sources,
          bitcoinNetwork: key,
        }),
      });
    }
    return bitcoinJson({ error: 'Unknown operation' }, 400);
  } catch {
    return bitcoinJson(
      {
        error:
          'Bitcoin indexer unavailable or returned invalid data. Retry with current wallet data.',
      },
      502,
    );
  }
}
export async function POST(): Promise<Response> {
  return Response.json(
    {
      error:
        'This service is read-only. Validate and broadcast the reviewed PSBT in your own wallet or Bitcoin Core.',
    },
    {
      status: 405,
      headers: { Allow: 'GET', 'cache-control': 'no-store' },
    },
  );
}
