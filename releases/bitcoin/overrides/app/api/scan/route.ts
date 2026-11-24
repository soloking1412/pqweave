import { bitcoinAddressNetwork, scanBitcoinAddress } from '@pqweave/sdk/bitcoin';
import { bitcoinIndexerNetwork, bitcoinJson, BITCOIN_FETCH } from '@/lib/bitcoin-indexer';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (query.has('chain') && query.get('chain') !== 'bitcoin') {
    return bitcoinJson({ error: 'This release supports Bitcoin only.' }, 400);
  }
  const address = (query.get('address') ?? '').trim();
  const key = bitcoinAddressNetwork(address);
  if (key !== 'bitcoin' && key !== 'testnet')
    return bitcoinJson({ error: 'Enter a valid Bitcoin address.' }, 400);
  try {
    const { network } = bitcoinIndexerNetwork(key);
    const result = await scanBitcoinAddress(address, {
      ...BITCOIN_FETCH,
      apiUrl: network.apiUrl,
      signal: request.signal,
    });
    return bitcoinJson({ kind: 'utxo', ...result, balanceSats: result.balanceSats.toString() });
  } catch {
    return bitcoinJson({ error: 'Bitcoin scan unavailable. Retry with current wallet data.' }, 502);
  }
}
