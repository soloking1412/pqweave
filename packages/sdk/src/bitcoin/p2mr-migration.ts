import * as btc from '@scure/btc-signer';
import { base64 } from '@scure/base';
import { prepareSweepInputs, type EvacuationInput, type SignabilityReport } from './evacuation.js';
import { BITCOIN, type UtxoNetwork } from './networks.js';
import {
  encodeP2mrAddress,
  P2MR_MIN_LEAVES,
  P2mrUnsafeTreeError,
  p2mrMerkleRoot,
  p2mrScript,
  type P2mrLeaf,
  type P2mrNetwork,
  type P2mrTree,
} from './p2mr.js';

/**
 * Reference migration tooling: move coins from legacy or Taproot outputs into a
 * BIP-360 (P2MR) output.
 *
 * **This exists so it is tested before it is urgent, not so it can be used
 * today.** BIP-360 is `Status: Draft` and no network enforces its rules. Under
 * BIP-141 forward compatibility, witness versions 2–16 are *anyone-can-spend*,
 * which means real coins sent to a `bc1z` address right now can be taken by
 * anybody. So a mainnet migration is **refused outright** rather than warned
 * about: a warning is the wrong control when the loss is unrecoverable.
 *
 * `@scure/btc-signer` independently agrees — it rejects a witness-v2 output
 * unless `allowUnknownOutputs` is set, with "there is a chance that input is
 * unspendable". That flag is only set here after the caller has explicitly
 * acknowledged the hazard.
 *
 * The post-quantum signature layer is deliberately absent. BIP-360 does not
 * define PQ signature schemes — they are deferred to a companion BIP via
 * `OP_SUCCESSx` — so leaf scripts come from the caller. Inventing opcodes that
 * do not exist would produce tooling that looks finished and is fiction.
 */

/** Thrown when a P2MR migration is attempted where it would risk real funds. */
export class P2mrNotActivatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'P2mrNotActivatedError';
  }
}

/**
 * A recipe for one leaf of the P2MR script tree. Once a companion BIP defines
 * post-quantum verification opcodes, implementations of this interface are the
 * only thing that needs to change.
 */
export interface PqLeafTemplate {
  /** Short identifier, e.g. "raw" or a future "ml-dsa-65". */
  name: string;
  /** What this leaf authorizes, for display next to a migration plan. */
  describe(): string;
  /** The leaf script committed into the tree. */
  buildLeafScript(): Uint8Array;
}

/**
 * The only template shipped today: use a script the caller supplies verbatim.
 *
 * There is no `mlDsaLeafTemplate` or `slhDsaLeafTemplate` here on purpose. The
 * opcodes those would need are not specified anywhere yet, so any such template
 * would be a guess presented as a standard.
 */
export function rawLeafTemplate(script: Uint8Array, name = 'raw'): PqLeafTemplate {
  return {
    name,
    describe: () =>
      'Caller-supplied leaf script. BIP-360 defines no post-quantum signature opcodes yet, so the spending condition is whatever this script encodes.',
    buildLeafScript: () => script,
  };
}

export interface P2mrMigrationParams {
  /** UTXOs being migrated, in the same shape the evacuation kit takes. */
  inputs: EvacuationInput[];
  /** Script tree committed into the P2MR output. */
  leaves: (P2mrLeaf | PqLeafTemplate)[];
  /** sat/vB. */
  feeRate: number;
  /** Network of the *inputs*. Defaults to Bitcoin mainnet. */
  network?: UtxoNetwork;
  /** Which network the P2MR output is for. Mainnet is refused. */
  target?: P2mrNetwork;
  /**
   * Explicit acknowledgement that a P2MR output is anyone-can-spend until
   * BIP-360 activates. Required even on test networks, so the risk is never
   * implicit.
   */
  acknowledgeAnyoneCanSpend?: boolean;
}

export interface P2mrMigrationPlan {
  /** The `bc1z…`-style destination this migration pays. */
  destination: string;
  target: P2mrNetwork;
  tree: P2mrTree;
  /** The 34-byte `OP_2 <root>` output script. */
  outputScript: Uint8Array;
  totalInputSats: bigint;
  feeSats: bigint;
  outputSats: bigint;
  vsize: number;
  /** Unsigned PSBT, base64. */
  psbtBase64: string;
  signability: SignabilityReport;
  /** Statements that must be shown to anyone acting on this plan. */
  warnings: string[];
}

const DUST_SATS = 546n;

/**
 * Refuse a P2MR migration wherever it would put real funds at risk.
 *
 * Mainnet is rejected unconditionally until BIP-360 activates. Test networks
 * still require an explicit acknowledgement, because the same anyone-can-spend
 * property holds there and silently accepting it would teach the wrong habit.
 */
export function assertP2mrSpendable(
  target: P2mrNetwork,
  options: { acknowledgeAnyoneCanSpend?: boolean } = {},
): void {
  if (target === 'bitcoin') {
    throw new P2mrNotActivatedError(
      'Refusing to build a mainnet P2MR migration. BIP-360 is a draft and is not active on Bitcoin, so a witness v2 output is anyone-can-spend: any coins sent there could be taken by anyone, permanently. Use regtest or signet to exercise this tooling.',
    );
  }
  if (!options.acknowledgeAnyoneCanSpend) {
    throw new P2mrNotActivatedError(
      `P2MR outputs on ${target} are anyone-can-spend until BIP-360 activates. Pass acknowledgeAnyoneCanSpend: true to confirm you understand the funds are not protected.`,
    );
  }
}

function toLeaf(entry: P2mrLeaf | PqLeafTemplate): P2mrLeaf {
  return 'buildLeafScript' in entry ? { script: entry.buildLeafScript() } : entry;
}

/**
 * Build an unsigned migration transaction sweeping `inputs` into a single P2MR
 * output. Input construction is delegated to {@link prepareSweepInputs}, so the
 * signing-correctness rules (nonWitnessUtxo, bip32Derivation, redeemScript,
 * tapInternalKey, and the fail-loud behaviour) are inherited rather than
 * duplicated here.
 */
export function planP2mrMigration(params: P2mrMigrationParams): P2mrMigrationPlan {
  const network = params.network ?? BITCOIN;
  const target = params.target ?? 'bitcoin';

  // Safety gate first: never do work that produces a dangerous artifact.
  assertP2mrSpendable(target, {
    ...(params.acknowledgeAnyoneCanSpend !== undefined
      ? { acknowledgeAnyoneCanSpend: params.acknowledgeAnyoneCanSpend }
      : {}),
  });

  // p2mrMerkleRoot enforces this too, but failing here keeps the error attached
  // to the migration the caller asked for rather than to tree internals.
  if (params.leaves.length < P2MR_MIN_LEAVES) {
    throw new P2mrUnsafeTreeError(
      `a P2MR migration needs at least ${P2MR_MIN_LEAVES} leaf scripts, got ${params.leaves.length}. A single-leaf tree is anyone-can-spend under BIP-360, so migrating into one would hand the coins to whoever sees the spend.`,
    );
  }
  if (!Number.isFinite(params.feeRate) || params.feeRate <= 0) {
    throw new Error('feeRate must be a positive number of sat/vB');
  }

  const tree = p2mrMerkleRoot(params.leaves.map(toLeaf));
  const outputScript = p2mrScript(tree.root);
  const destination = encodeP2mrAddress(tree.root, target);

  const isTestnet = target !== 'bitcoin';
  const { fields, totalInputSats, vsize, signability } = prepareSweepInputs(
    params.inputs,
    network,
    isTestnet,
  );

  const feeSats = BigInt(Math.ceil(vsize * params.feeRate));
  const outputSats = totalInputSats - feeSats;
  if (outputSats < DUST_SATS) {
    throw new Error(
      outputSats <= 0n
        ? 'fee exceeds the balance being migrated'
        : 'the migrated output would be dust after the fee',
    );
  }

  // allowUnknownOutputs is required because btc-signer treats witness v2 as an
  // unrecognized output type — the same warning that motivates the gate above.
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  for (const input of fields) {
    tx.addInput(input as Parameters<btc.Transaction['addInput']>[0]);
  }
  tx.addOutput({ script: outputScript, amount: outputSats });

  return {
    destination,
    target,
    tree,
    outputScript,
    totalInputSats,
    feeSats,
    outputSats,
    vsize,
    psbtBase64: base64.encode(tx.toPSBT()),
    signability,
    warnings: [
      'BIP-360 is a draft and is not active on any network. This output is anyone-can-spend under current consensus rules.',
      'Do not broadcast this on mainnet. It exists to test the migration path before activation, not to protect funds today.',
      'BIP-360 defines no post-quantum signature opcodes yet, so the leaf scripts here carry whatever spending condition you supplied.',
      `This tree has ${tree.leaves.length} leaves. BIP-360 treats a single-leaf tree as anyone-can-spend, so one of these should be a fallback spending path, not padding.`,
    ],
  };
}
