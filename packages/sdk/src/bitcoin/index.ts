export {
  classifyBitcoinAddress,
  classifyUtxoAddress,
  isBitcoinAddress,
  isUtxoAddress,
} from './address.js';
export { BITCOIN, LITECOIN, UTXO_NETWORKS } from './networks.js';
export type { UtxoNetwork, UtxoNetworkId } from './networks.js';
export {
  assessUtxoExposure,
  assessUtxoRisk,
  scanBitcoinAddress,
  scanUtxoAddress,
} from './scanner.js';
export type { UtxoScanOptions } from './scanner.js';
export type {
  EsploraAddressStats,
  UtxoAddressType,
  UtxoExposureResult,
  UtxoRiskAssessment,
} from './types.js';
