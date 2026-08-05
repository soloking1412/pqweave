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
export {
  broadcastTx,
  EsploraError,
  feeTiers,
  fetchWithRetry,
  getAddressStats,
  getFeeEstimates,
  getTxHex,
  listUtxos,
} from './esplora.js';
export type { EsploraOptions, EsploraUtxo, FeeEstimates, FeeTiers } from './esplora.js';
export {
  buildEvacuationPsbts,
  estimateSweepVsize,
  finalizeSweep,
  UnsignableInputError,
} from './evacuation.js';
export type {
  BuildEvacuationParams,
  EvacuationInput,
  EvacuationPlan,
  EvacuationTier,
  InputSignability,
  SignabilityReport,
} from './evacuation.js';
export {
  deriveAddresses,
  formatDerivationPath,
  isExtendedKey,
  parseDerivationPath,
  parseExtendedKey,
  parseMasterFingerprint,
} from './hd.js';
export type { DerivedAddress, DeriveAddressOptions, KeyOrigin, ParsedXpub } from './hd.js';
export { assertSafeDestination, checkDestination, UnsafeDestinationError } from './safety.js';
export type { CheckDestinationOptions, DestinationCheck, DestinationVerdict } from './safety.js';
export { scanWallet } from './wallet-scan.js';
export type {
  ChainPosition,
  ScanAccount,
  ScanAddressRecord,
  ScanCursor,
  ScanProgress,
  WalletScanOptions,
  WalletScanResult,
} from './wallet-scan.js';
export {
  BIP361,
  bip361Outlook,
  bip361Timeline,
  PHASE_B_SCOPE_IS_AMBIGUOUS,
  summarizeBip361,
} from './bip361.js';
export type { Bip361Outlook, Bip361Phase, Bip361Summary, Bip361Timeline } from './bip361.js';
export { buildWalletReport, METHODOLOGY, toCsv, toJson } from './report.js';
export type { AccountRollup, BuildReportOptions, ExposureBucket, WalletReport } from './report.js';
export {
  buildControlBlock,
  decodeP2mrAddress,
  encodeP2mrAddress,
  isDepthZeroControlBlock,
  isP2mrAddress,
  P2MR_LEAF_VERSION,
  P2MR_MIN_LEAVES,
  P2MR_WITNESS_VERSION,
  P2mrUnsafeTreeError,
  p2mrMerkleRoot,
  p2mrScript,
  tapBranchHash,
  tapLeafHash,
} from './p2mr.js';
export type { DecodedP2mr, P2mrLeaf, P2mrLeafPosition, P2mrNetwork, P2mrTree } from './p2mr.js';
export {
  assertP2mrSpendable,
  P2mrNotActivatedError,
  planP2mrMigration,
  rawLeafTemplate,
} from './p2mr-migration.js';
export type { P2mrMigrationParams, P2mrMigrationPlan, PqLeafTemplate } from './p2mr-migration.js';
export { prepareSweepInputs } from './evacuation.js';
export type { PreparedSweepInputs } from './evacuation.js';
export { describePsbt, verifySweepMatchesPlan } from './verify.js';
export type {
  PlanMatch,
  PsbtDescription,
  PsbtDescriptionInput,
  PsbtDescriptionOutput,
} from './verify.js';
