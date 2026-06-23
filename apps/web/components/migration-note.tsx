import { MIGRATION_LABEL, MIGRATION_STYLE, migrationFor } from '@/lib/migration-display';
import type { AnyScanReport } from '@/lib/types';

export function MigrationNote({ report }: { report: AnyScanReport }) {
  const capability = migrationFor(report);
  return (
    <div
      className={`mt-6 rounded-lg border p-3 text-xs leading-relaxed ${MIGRATION_STYLE[capability.level]}`}
    >
      <span className="font-medium">Migration · {MIGRATION_LABEL[capability.level]}.</span>{' '}
      {capability.summary}
    </div>
  );
}
