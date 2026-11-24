import { hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { classifyBitcoinAddress } from './address.js';
import {
  buildEvacuationPsbts,
  type BuildEvacuationParams,
  type EvacuationInput,
} from './evacuation.js';
import { listUtxos, type EsploraOptions } from './esplora.js';
import { BITCOIN } from './networks.js';

/** Conservative release policy; large fleets should prepare separately reviewed batches. */
export const BITCOIN_KIT_POLICY = {
  maxInputs: 100,
  maxFileBytes: 8_000_000,
  maxFeeSats: 100_000n,
  maxFeeBasisPoints: 500n,
  maxAgeMs: 24 * 60 * 60 * 1000,
} as const;

type EncodedInput = Omit<EvacuationInput, 'pubkey'> & { pubkey?: string | undefined };
export interface BitcoinPlanBundle {
  format: 'pqweave-bitcoin-plan';
  version: 1;
  createdAt: string;
  /** Detects accidental edits. This checksum does not authenticate a file's author. */
  planId: string;
  request: {
    inputs: EncodedInput[];
    destination: string;
    testnet: boolean;
    feeRates: BuildEvacuationParams['feeRates'];
  };
}

/** Strict public kit route. Low-level experimental builders are never called here. */
export function buildBitcoinReadinessPlan(params: BuildEvacuationParams) {
  if (params.network && params.network.id !== 'bitcoin') throw new Error('Bitcoin only');
  if (params.inputs.length > BITCOIN_KIT_POLICY.maxInputs)
    throw new Error('At most 100 inputs per reviewed plan');
  if (classifyBitcoinAddress(params.destination) !== 'p2wpkh') {
    throw new Error(
      'This kit requires a fresh native SegWit P2WPKH destination from your own wallet',
    );
  }
  if (params.inputs.reduce((n, i) => n + (i.prevTxHex?.length ?? 0), 0) > 7_000_000)
    throw new Error('Funding data exceeds the kit size limit');
  const normalized = (a: string) => (/^(bc1|tb1)/i.test(a) ? a.toLowerCase() : a);
  for (const input of params.inputs) {
    if (!input.prevTxHex)
      throw new Error(
        'Every input needs its full funding transaction for independent amount and script checks',
      );
    if (input.status?.confirmed !== true)
      throw new Error('Unconfirmed inputs are excluded; wait for confirmation and rebuild');
    if (normalized(input.address) === normalized(params.destination))
      throw new Error('Destination must differ from every source');
  }
  const plan = buildEvacuationPsbts(params);
  for (const tier of plan.tiers) {
    if (
      tier.feeSats > BITCOIN_KIT_POLICY.maxFeeSats ||
      tier.feeSats * 10_000n > plan.totalInputSats * BITCOIN_KIT_POLICY.maxFeeBasisPoints
    ) {
      throw new Error(
        'Fee exceeds the kit limit of 100,000 sats or 5% of the selected balance; review fees in your wallet',
      );
    }
  }
  return plan;
}

function planId(plan: ReturnType<typeof buildBitcoinReadinessPlan>): string {
  return hex.encode(
    sha256(
      new TextEncoder().encode(
        JSON.stringify({
          network: plan.network,
          destination: plan.destination,
          tiers: plan.tiers.map((t) => [t.label, t.feeRate, t.psbtBase64]),
        }),
      ),
    ),
  );
}

export function createBitcoinPlanBundle(
  params: BuildEvacuationParams,
  now = new Date(),
): BitcoinPlanBundle {
  const plan = buildBitcoinReadinessPlan(params);
  return {
    format: 'pqweave-bitcoin-plan',
    version: 1,
    createdAt: now.toISOString(),
    planId: planId(plan),
    request: {
      destination: params.destination,
      testnet: params.testnet ?? false,
      feeRates: { ...params.feeRates },
      inputs: params.inputs.map((input) => ({
        ...input,
        status: { ...input.status },
        ...(input.pathComponents ? { pathComponents: [...input.pathComponents] } : {}),
        pubkey: input.pubkey ? hex.encode(input.pubkey) : undefined,
      })),
    },
  };
}

/** Restore only public plan data; re-run every construction check before returning it. */
export function restoreBitcoinPlanBundle(text: string) {
  if (new TextEncoder().encode(text).length > BITCOIN_KIT_POLICY.maxFileBytes)
    throw new Error('Plan file is too large');
  const bundle = JSON.parse(text) as BitcoinPlanBundle;
  if (
    !bundle ||
    bundle.format !== 'pqweave-bitcoin-plan' ||
    bundle.version !== 1 ||
    typeof bundle.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(bundle.createdAt)) ||
    !bundle.request ||
    !Array.isArray(bundle.request.inputs) ||
    bundle.request.inputs.length > BITCOIN_KIT_POLICY.maxInputs ||
    typeof bundle.request.destination !== 'string' ||
    typeof bundle.request.testnet !== 'boolean' ||
    typeof bundle.planId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(bundle.planId)
  )
    throw new Error('Unsupported or malformed Bitcoin plan');
  const inputs = bundle.request.inputs.map((input): EvacuationInput => {
    if (
      !input ||
      typeof input.address !== 'string' ||
      typeof input.txid !== 'string' ||
      typeof input.prevTxHex !== 'string' ||
      !/^(?:[0-9a-fA-F]{2})+$/.test(input.prevTxHex) ||
      (input.pubkey !== undefined &&
        (typeof input.pubkey !== 'string' || !/^(02|03)[a-fA-F0-9]{64}$/.test(input.pubkey)))
    ) {
      throw new Error('Malformed input in Bitcoin plan');
    }
    const { pubkey, ...rest } = input;
    return { ...rest, ...(pubkey ? { pubkey: hex.decode(pubkey) } : {}) };
  });
  const params = { ...bundle.request, inputs };
  const plan = buildBitcoinReadinessPlan(params);
  if (planId(plan) !== bundle.planId)
    throw new Error('Plan checksum mismatch; rebuild from trusted wallet data');
  return { bundle, plan, inputs };
}

/** A full-address sweep is stale if coins were spent, added, or changed since planning. */
export async function revalidateBitcoinPlan(
  bundle: BitcoinPlanBundle,
  options: EsploraOptions = {},
  now = new Date(),
) {
  const restored = restoreBitcoinPlanBundle(JSON.stringify(bundle));
  const age = now.getTime() - Date.parse(bundle.createdAt);
  if (!Number.isFinite(age) || age < -60_000 || age > BITCOIN_KIT_POLICY.maxAgeMs)
    throw new Error('Plan is expired or dated in the future; rebuild before signing');
  const sources = [...new Set(restored.inputs.map((i) => i.address))];
  for (const source of sources) {
    const current = await listUtxos(source, BITCOIN, {
      ...options,
      apiUrl:
        options.apiUrl ??
        (bundle.request.testnet ? 'https://blockstream.info/testnet/api' : BITCOIN.apiUrl),
    });
    const expected = restored.inputs.filter((i) => i.address === source);
    if (
      current.length !== expected.length ||
      expected.some(
        (i) =>
          !current.some(
            (u) =>
              u.txid.toLowerCase() === i.txid.toLowerCase() &&
              u.vout === i.vout &&
              u.value === i.value &&
              u.status.confirmed,
          ),
      )
    ) {
      throw new Error('Source UTXOs changed or are unconfirmed; rebuild the plan');
    }
  }
  return restored;
}
