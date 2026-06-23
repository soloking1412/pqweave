export interface DirectoryChain {
  name: string;
  ticker: string;
  status: 'live' | 'soon';
  family: string;
  accent: string;
}

/** Every chain shown on the landing — live coverage plus what's coming next. */
export const DIRECTORY_CHAINS: DirectoryChain[] = [
  {
    name: 'Ethereum & EVM',
    ticker: 'EVM',
    status: 'live',
    family: 'Scan + migrate',
    accent: '#8a93ff',
  },
  { name: 'Bitcoin', ticker: 'BTC', status: 'live', family: 'UTXO', accent: '#f7931a' },
  { name: 'Litecoin', ticker: 'LTC', status: 'live', family: 'UTXO', accent: '#a3b1c2' },
  { name: 'Solana', ticker: 'SOL', status: 'live', family: 'Ed25519', accent: '#19fb9b' },
  { name: 'Cardano', ticker: 'ADA', status: 'live', family: 'Ed25519', accent: '#4a78e0' },
  { name: 'Cosmos', ticker: 'ATOM', status: 'live', family: 'Account', accent: '#7c87f8' },
  { name: 'XRP Ledger', ticker: 'XRP', status: 'live', family: 'Account', accent: '#c9cdd3' },
  { name: 'Algorand', ticker: 'ALGO', status: 'live', family: 'Ed25519', accent: '#d7dde3' },
  { name: 'Stellar', ticker: 'XLM', status: 'live', family: 'Ed25519', accent: '#dce2ea' },
  { name: 'NEAR', ticker: 'NEAR', status: 'live', family: 'Ed25519', accent: '#36f097' },
  { name: 'Aptos', ticker: 'APT', status: 'live', family: 'Move', accent: '#3ad6b0' },
  { name: 'Sui', ticker: 'SUI', status: 'soon', family: 'Move', accent: '#4da2ff' },
  { name: 'Tron', ticker: 'TRX', status: 'soon', family: 'Account', accent: '#ff5b5b' },
  { name: 'Polkadot', ticker: 'DOT', status: 'soon', family: 'sr25519', accent: '#e6007a' },
  { name: 'Dogecoin', ticker: 'DOGE', status: 'soon', family: 'UTXO', accent: '#c2a633' },
  { name: 'Bitcoin Cash', ticker: 'BCH', status: 'soon', family: 'UTXO', accent: '#0ac18e' },
  { name: 'TON', ticker: 'TON', status: 'soon', family: 'Account', accent: '#4aa8ef' },
];

export const LIVE_CHAIN_COUNT = DIRECTORY_CHAINS.filter((c) => c.status === 'live').length;
