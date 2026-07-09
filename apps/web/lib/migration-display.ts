import {
  type ExposureModel,
  type MigrationCapability,
  migrationCapability,
} from '@pqweave/sdk/migration';
import type { AnyScanReport } from './types';

export function migrationFor(report: AnyScanReport): MigrationCapability {
  let model: ExposureModel;
  if (report.kind === 'evm' || report.kind === 'evm-multi') model = 'evm';
  else if (report.kind === 'utxo') model = 'utxo';
  else model = report.addressIsKey ? 'address-is-key' : 'account-first-spend';
  return migrationCapability(model);
}

export const MIGRATION_LABEL: Record<MigrationCapability['level'], string> = {
  'quantum-safe': 'Quantum-safe migration available',
  transitional: 'Transitional defense only',
  none: 'No app-layer fix',
};

export const MIGRATION_STYLE: Record<MigrationCapability['level'], string> = {
  'quantum-safe': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  transitional: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  none: 'border-white/5 bg-black/20 text-zinc-400',
};
