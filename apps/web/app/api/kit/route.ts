import { planMigration, type MigrationKitInput } from '@pqweave/sdk/kit';

export const dynamic = 'force-dynamic';

const MAX_ACCOUNTS = 50;
const MAX_BYTES = 32_768;
const EXPOSURES = new Set(['exposed', 'hidden', 'unknown']);
const AUTHORITIES = new Set(['classical', 'post-quantum', 'rekeyed-unknown', 'unknown']);

function isInput(value: unknown): value is MigrationKitInput {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.chain === 'string' &&
    item.chain.length > 0 &&
    item.chain.length <= 40 &&
    typeof item.address === 'string' &&
    item.address.length > 0 &&
    item.address.length <= 160 &&
    EXPOSURES.has(item.exposure as string) &&
    (item.currentAuthority === undefined || AUTHORITIES.has(item.currentAuthority as string)) &&
    (item.isContract === undefined || typeof item.isContract === 'boolean') &&
    (item.knownAssets === undefined ||
      (Number.isSafeInteger(item.knownAssets) && (item.knownAssets as number) >= 0))
  );
}

/** Stateless planning for partner systems. No chain calls, signing, or key material. */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > MAX_BYTES) {
      return Response.json({ error: 'Request too large.' }, { status: 413 });
    }
    const parsed: unknown = JSON.parse(body);
    const records = Array.isArray(parsed) ? parsed : [parsed];
    if (records.length === 0 || records.length > MAX_ACCOUNTS || !records.every(isInput)) {
      return Response.json(
        { error: 'Provide 1–50 records with chain, public address, and exposure.' },
        { status: 400 },
      );
    }
    return Response.json({
      version: 1,
      generatedAt: new Date().toISOString(),
      plans: records.map((record: MigrationKitInput) => planMigration(record)),
      note: 'Planning only. Inputs are not verified against chain state by this endpoint.',
    });
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
}
