import { type Address, encodeFunctionData, type Hex, parseAbi, type PublicClient } from 'viem';

/**
 * Cross-chain attestation: bind a Bitcoin address to a PQWeave post-quantum
 * (Lamport+Merkle) key and anchor the binding as an immutable on-chain event.
 * The user signs the binding message with their Bitcoin wallet (BIP-322 or
 * legacy), and the signature is stored on an EVM chain for public, timestamped
 * verification. This is an open registry — anyone can read and check it — as
 * opposed to a proprietary off-chain key registry. It records intent and
 * ownership; it does not by itself make the Bitcoin address quantum-safe.
 */

export const pqWeaveAttestationAbi = parseAbi([
  'function attest(bytes32 pqcRoot, string btcAddress, bytes btcSignature)',
  'function attestedAt(bytes32 pqcRoot) view returns (uint64)',
  'event Attested(address indexed signer, bytes32 indexed pqcRoot, string btcAddress, bytes btcSignature, uint64 timestamp)',
]);

/**
 * The canonical human-readable message the Bitcoin wallet signs. Both the
 * signing UI and any verifier must build it identically, byte-for-byte.
 */
export function attestationMessage(btcAddress: string, pqcRoot: Hex): string {
  return [
    'PQWeave post-quantum attestation',
    '',
    `Bitcoin address: ${btcAddress}`,
    `Post-quantum key (Lamport+Merkle root): ${pqcRoot}`,
    '',
    'I control both, and I bind them together so this post-quantum key can',
    'vouch for this Bitcoin address if a migration path becomes available.',
  ].join('\n');
}

/** Encode the EVM `attest` call. `btcSignature` is the wallet signature as hex bytes. */
export function encodeAttest(pqcRoot: Hex, btcAddress: string, btcSignature: Hex): Hex {
  return encodeFunctionData({
    abi: pqWeaveAttestationAbi,
    functionName: 'attest',
    args: [pqcRoot, btcAddress, btcSignature],
  });
}

/** Read when a PQC root was last anchored (0 if never). */
export async function readAttestation(
  client: PublicClient,
  attestation: Address,
  pqcRoot: Hex,
): Promise<bigint> {
  const at = await client.readContract({
    address: attestation,
    abi: pqWeaveAttestationAbi,
    functionName: 'attestedAt',
    args: [pqcRoot],
  });
  return BigInt(at);
}
