/**
 * UTXO chains share Bitcoin's exposure model (the public key is hidden behind a
 * hash until the first spend; Taproot reveals it in the output). They differ
 * only in address prefixes and which Esplora-compatible indexer serves them, so
 * one scanner covers them all from this config.
 */
export interface UtxoNetwork {
  id: UtxoNetworkId;
  name: string;
  symbol: string;
  /** Esplora-compatible API base URL. */
  apiUrl: string;
  /** Bech32/Bech32m human-readable prefixes (empty if the chain has no segwit). */
  bech32Hrps: string[];
  /** Leading base58 characters for P2PKH addresses. */
  base58P2pkh: string[];
  /** Leading base58 characters for P2SH addresses. */
  base58P2sh: string[];
  /** Whether the chain supports Taproot (witness v1). */
  taproot: boolean;
}

export type UtxoNetworkId = 'bitcoin' | 'litecoin';

export const BITCOIN: UtxoNetwork = {
  id: 'bitcoin',
  name: 'Bitcoin',
  symbol: 'BTC',
  apiUrl: 'https://blockstream.info/api',
  bech32Hrps: ['bc1', 'tb1', 'bcrt1'],
  base58P2pkh: ['1', 'm', 'n'],
  base58P2sh: ['3', '2'],
  taproot: true,
};

export const LITECOIN: UtxoNetwork = {
  id: 'litecoin',
  name: 'Litecoin',
  symbol: 'LTC',
  apiUrl: 'https://litecoinspace.org/api',
  bech32Hrps: ['ltc1', 'tltc1'],
  base58P2pkh: ['L', 'm', 'n'],
  base58P2sh: ['M', '3', 'Q'],
  taproot: true,
};

export const UTXO_NETWORKS: Record<UtxoNetworkId, UtxoNetwork> = {
  bitcoin: BITCOIN,
  litecoin: LITECOIN,
};
