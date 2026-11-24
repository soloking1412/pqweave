import { classifyUtxoAddress, isBitcoinAddressOnNetwork } from './address.js';
import { getAddressStats, type EsploraOptions } from './esplora.js';
import { BITCOIN, type UtxoNetwork } from './networks.js';

/**
 * Destination safety rails for a sweep.
 *
 * The whole point of an evacuation is to land funds somewhere the public key is
 * *not* yet revealed. A destination that has already been spent from is exposed
 * before the money arrives, which quietly defeats the exercise — so this is
 * checked on-chain rather than trusted to the caller.
 *
 * Taproot is a special case: a P2TR output carries the key in the output
 * itself, so a "fresh" Taproot address is exposed the moment it is funded. It
 * is allowed but always flagged, matching the rule the scanner already applies.
 */

export type DestinationVerdict = 'safe' | 'warn' | 'unsafe';

export interface DestinationCheck {
  address: string;
  verdict: DestinationVerdict;
  /** Reasons the destination is unsafe. Non-empty means do not sweep here. */
  problems: string[];
  /** Non-fatal notes the user should still read. */
  warnings: string[];
  /** On-chain transaction count, when it could be fetched. */
  txCount: number | undefined;
}

export interface CheckDestinationOptions extends EsploraOptions {
  /** Addresses being swept from — sweeping to one of them is pointless. */
  sourceAddresses?: string[];
  /** Skip the on-chain freshness lookup (offline/air-gapped planning). */
  skipChainCheck?: boolean;
  /** Require a matching Bitcoin address network when used by a mainnet/testnet flow. */
  bitcoinNetwork?: 'bitcoin' | 'testnet';
}

/**
 * Check a sweep destination. Never throws on a network failure: an indexer
 * being down must not block an emergency evacuation, so the freshness check
 * degrades to a warning that the user can weigh themselves.
 */
export async function checkDestination(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: CheckDestinationOptions = {},
): Promise<DestinationCheck> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const clean = address.trim();

  const type = classifyUtxoAddress(clean, network);
  if (
    type === 'unknown' ||
    (network.id === 'bitcoin' &&
      options.bitcoinNetwork &&
      !isBitcoinAddressOnNetwork(clean, options.bitcoinNetwork))
  ) {
    return {
      address: clean,
      verdict: 'unsafe',
      problems: [`Not a recognized ${network.name} address.`],
      warnings,
      txCount: undefined,
    };
  }

  const normalize = (a: string) =>
    /^(bc1|tb1|bcrt1)/i.test(a.trim()) ? a.trim().toLowerCase() : a.trim();
  const sources = (options.sourceAddresses ?? []).map(normalize);
  if (sources.includes(normalize(clean))) {
    problems.push(
      'The destination is one of the addresses you are sweeping from. Sweeping to itself protects nothing.',
    );
  }

  if (type === 'p2tr') {
    warnings.push(
      'Taproot addresses publish the public key in the output itself, so this destination is exposed as soon as it is funded. A native SegWit (bc1q…) destination keeps the key hidden until you spend.',
    );
  }

  if (type === 'p2mr') {
    // Stronger than the Taproot warning: this is not "less private", it is
    // "anyone can take it". BIP-360 is a draft and the supported public networks do not enforce it, so a
    // witness v2 output is unencumbered under BIP-141 forward compatibility.
    problems.push(
      'This BIP-360 (P2MR) address is not an activated destination on the supported public Bitcoin networks. A witness v2 output is currently anyone-can-spend there. Do not send funds to it.',
    );
  }

  let txCount: number | undefined;
  if (options.skipChainCheck)
    warnings.push(
      'Offline plan: destination history has not been checked. Recheck before signing.',
    );
  if (!options.skipChainCheck) {
    try {
      const stats = await getAddressStats(clean, network, options);
      if (!stats.mempool_stats) throw new Error('Missing mempool history');
      txCount = stats.chain_stats.tx_count + stats.mempool_stats.tx_count;
      if (txCount > 0) {
        problems.push(
          `This destination has already been used (${txCount} transaction${txCount === 1 ? '' : 's'}). Sweep to an address that has never received or sent anything.`,
        );
      }
    } catch {
      warnings.push(
        'Could not confirm the destination is unused — the indexer did not respond. Verify in your own wallet before broadcasting.',
      );
    }
  }

  const verdict: DestinationVerdict =
    problems.length > 0 ? 'unsafe' : warnings.length > 0 ? 'warn' : 'safe';
  return { address: clean, verdict, problems, warnings, txCount };
}

/** Thrown when a destination fails the safety rails. */
export class UnsafeDestinationError extends Error {
  constructor(
    message: string,
    readonly check: DestinationCheck,
  ) {
    super(message);
    this.name = 'UnsafeDestinationError';
  }
}

/** {@link checkDestination}, throwing when the destination is unsafe. */
export async function assertSafeDestination(
  address: string,
  network: UtxoNetwork = BITCOIN,
  options: CheckDestinationOptions = {},
): Promise<DestinationCheck> {
  const check = await checkDestination(address, network, options);
  if (check.verdict === 'unsafe') {
    throw new UnsafeDestinationError(check.problems.join(' '), check);
  }
  return check;
}
