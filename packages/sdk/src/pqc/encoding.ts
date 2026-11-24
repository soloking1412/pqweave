/** Limits must match HashSigEncoding.sol; canonical encodings have one dynamic tail. */
export const MAX_HASH_SIG_TREE_SIZE = 4096;

export function isDigest(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function validTreeSize(size: number): boolean {
  return (
    Number.isInteger(size) &&
    size > 0 &&
    size <= MAX_HASH_SIG_TREE_SIZE &&
    (size & (size - 1)) === 0
  );
}

export function canonicalHashSignature(signature: unknown, headWords: number): boolean {
  if (typeof signature !== 'string') return false;
  const min = (headWords + 1) * 64 + 2;
  if (
    signature.length < min ||
    signature.length > min + 12 * 64 ||
    !/^0x[0-9a-fA-F]+$/.test(signature)
  )
    return false;
  const word = (index: number) =>
    BigInt(`0x${signature.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
  const depth = word(headWords);
  return (
    word(headWords - 1) === BigInt(headWords * 32) &&
    depth <= 12n &&
    signature.length === min + Number(depth) * 64 &&
    word(0) < 1n << depth
  );
}
