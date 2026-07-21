import { Buffer } from 'buffer';
import { Address, hash, nativeToScVal, StrKey, xdr } from '@stellar/stellar-sdk';
import type { PqSignatureComponents } from '@pqweave/sdk/stellar-vault';

/**
 * Pure Stellar helpers for the post-quantum vault flow: deterministic contract
 * address derivation and the `PqSignature` ScVal the vault's __check_auth reads.
 * Kept free of Freighter/RPC so they can be unit-tested and cross-checked
 * against the `stellar` CLI. The Freighter/RPC orchestration lives in the client
 * component.
 */

/** Merkle tree height for a given number of one-time keys (a power of two). */
export function treeHeight(treeSize: number): number {
  return Math.round(Math.log2(treeSize));
}

/**
 * The deterministic contract id (`C...`) a vault instance will have when
 * deployed by `deployer` with `salt`. Mirrors Soroban's
 * `ENVELOPE_TYPE_CONTRACT_ID` derivation, so we can show the user a stable
 * fundable address before the instance is deployed. Salt is the 32-byte
 * post-quantum root, so one key ⇒ one vault address.
 */
export function deriveVaultContractId(
  deployer: string,
  salt: Uint8Array,
  networkPassphrase: string,
): string {
  if (salt.length !== 32) throw new Error('salt must be 32 bytes');
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(networkPassphrase)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(deployer).toScAddress(),
          salt: Buffer.from(salt),
        }),
      ),
    }),
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

/**
 * Encode a hash-based signature as the vault's `PqSignature` contracttype. A
 * Soroban struct is an ScVal map with keys sorted lexicographically —
 * leaf_index < proof < public_key < signature — so the order below is
 * load-bearing and must not be reshuffled.
 */
export function pqSignatureScVal(components: PqSignatureComponents): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('leaf_index'),
      val: xdr.ScVal.scvU32(components.leafIndex),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('proof'),
      val: xdr.ScVal.scvBytes(Buffer.from(components.proof)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('public_key'),
      val: xdr.ScVal.scvBytes(Buffer.from(components.publicKey)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signature'),
      val: xdr.ScVal.scvBytes(Buffer.from(components.signature)),
    }),
  ]);
}

/** Constructor args for a vault instance: `__constructor(pqc_root, tree_height)`. */
export function vaultConstructorArgs(root: Uint8Array, treeSize: number): xdr.ScVal[] {
  return [
    nativeToScVal(Buffer.from(root), { type: 'bytes' }),
    nativeToScVal(treeHeight(treeSize), { type: 'u32' }),
  ];
}

/** Stellar amount (7 decimals) → i128 stroops ScVal. e.g. "1.5" XLM. */
export function xlmToStroopsScVal(amount: string): xdr.ScVal {
  const [whole = '0', frac = ''] = amount.trim().split('.');
  const stroops = BigInt(whole) * 10_000_000n + BigInt((frac + '0000000').slice(0, 7));
  return nativeToScVal(stroops, { type: 'i128' });
}
