import { hex } from '@scure/base';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildControlBlock,
  decodeP2mrAddress,
  encodeP2mrAddress,
  isDepthZeroControlBlock,
  isP2mrAddress,
  P2mrUnsafeTreeError,
  P2MR_LEAF_VERSION,
  p2mrMerkleRoot,
  p2mrScript,
  tapBranchHash,
  type P2mrNetwork,
} from '../src/bitcoin/p2mr.js';
import {
  assertP2mrSpendable,
  P2mrNotActivatedError,
  planP2mrMigration,
} from '../src/bitcoin/p2mr-migration.js';
import { classifyBitcoinAddress } from '../src/bitcoin/address.js';

/**
 * Property-based tests for BIP-360 (P2MR) construction and its activation guard.
 *
 * The guard is the important one. A witness v2 output is anyone-can-spend until
 * BIP-360 activates, so "the mainnet path always throws" is a safety property,
 * not a preference — it should hold for every input, not just the cases someone
 * thought to write down.
 */

const bytes32 = fc.uint8Array({ minLength: 32, maxLength: 32 });
const networkArb = fc.constantFrom<P2mrNetwork>('bitcoin', 'testnet', 'signet', 'regtest');
const leafArb = fc.uint8Array({ minLength: 1, maxLength: 40 }).map((script) => ({ script }));

describe('address encoding round-trips for every root', () => {
  it('decode ∘ encode is the identity on all networks', () => {
    fc.assert(
      fc.property(bytes32, networkArb, (root, network) => {
        const address = encodeP2mrAddress(root, network);
        const decoded = decodeP2mrAddress(address);
        expect(decoded).not.toBeNull();
        expect(hex.encode(decoded!.merkleRoot)).toBe(hex.encode(root));
        // testnet and signet deliberately share the `tb` prefix, so decoding
        // resolves to the first match rather than the original label.
        const expected = network === 'signet' ? 'testnet' : network;
        expect(decoded!.network).toBe(expected);
        return true;
      }),
      { numRuns: 400 },
    );
  });

  it('distinct roots never produce the same address', () => {
    fc.assert(
      fc.property(bytes32, bytes32, (a, b) => {
        fc.pre(hex.encode(a) !== hex.encode(b));
        expect(encodeP2mrAddress(a, 'bitcoin')).not.toBe(encodeP2mrAddress(b, 'bitcoin'));
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('mainnet addresses always start bc1z and classify as p2mr', () => {
    fc.assert(
      fc.property(bytes32, (root) => {
        const address = encodeP2mrAddress(root, 'bitcoin');
        expect(address.startsWith('bc1z')).toBe(true);
        expect(isP2mrAddress(address)).toBe(true);
        expect(classifyBitcoinAddress(address)).toBe('p2mr');
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('the script is always OP_2 plus the exact 32-byte root', () => {
    fc.assert(
      fc.property(bytes32, (root) => {
        const script = p2mrScript(root);
        expect(script.length).toBe(34);
        expect(script[0]).toBe(0x52);
        expect(script[1]).toBe(32);
        expect(hex.encode(script.slice(2))).toBe(hex.encode(root));
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('a root that is not 32 bytes is always rejected', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 64 }).filter((b) => b.length !== 32),
        (root) => {
          expect(() => p2mrScript(root)).toThrow(/32 bytes/);
          expect(() => encodeP2mrAddress(root, 'bitcoin')).toThrow(/32 bytes/);
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('script trees are sound for any set of leaves', () => {
  it('every leaf path rebuilds the root', () => {
    fc.assert(
      fc.property(fc.array(leafArb, { minLength: 2, maxLength: 17 }), (leaves) => {
        const tree = p2mrMerkleRoot(leaves);
        expect(tree.leaves).toHaveLength(leaves.length);
        for (const leaf of tree.leaves) {
          let node = leaf.hash;
          for (const sibling of leaf.path) node = tapBranchHash(node, sibling);
          expect(hex.encode(node)).toBe(hex.encode(tree.root));
        }
        return true;
      }),
      { numRuns: 250 },
    );
  });

  it('tree construction is deterministic', () => {
    fc.assert(
      fc.property(fc.array(leafArb, { minLength: 2, maxLength: 12 }), (leaves) => {
        expect(hex.encode(p2mrMerkleRoot(leaves).root)).toBe(
          hex.encode(p2mrMerkleRoot(leaves).root),
        );
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('control blocks are always 1 + 32·m bytes with the parity bit set', () => {
    fc.assert(
      fc.property(fc.array(leafArb, { minLength: 2, maxLength: 17 }), (leaves) => {
        for (const leaf of p2mrMerkleRoot(leaves).leaves) {
          expect(leaf.controlBlock.length).toBe(1 + leaf.path.length * 32);
          // m >= 1 always: an empty path is the anyone-can-spend case.
          expect(leaf.path.length).toBeGreaterThanOrEqual(1);
          expect(isDepthZeroControlBlock(leaf.controlBlock)).toBe(false);
          // BIP-360 fixes the parity bit to 1: there is no key path to disagree with.
          expect(leaf.controlBlock[0]! & 1).toBe(1);
          expect(leaf.controlBlock[0]! & 0xfe).toBe(P2MR_LEAF_VERSION & 0xfe);
        }
        return true;
      }),
      { numRuns: 250 },
    );
  });

  it('path depth stays logarithmic in the number of leaves', () => {
    fc.assert(
      fc.property(fc.array(leafArb, { minLength: 2, maxLength: 33 }), (leaves) => {
        const bound = Math.ceil(Math.log2(Math.max(leaves.length, 1))) + 1;
        for (const leaf of p2mrMerkleRoot(leaves).leaves) {
          expect(leaf.path.length).toBeLessThanOrEqual(bound);
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('buildControlBlock preserves the path bytes in order', () => {
    fc.assert(
      fc.property(fc.array(bytes32, { maxLength: 10 }), (path) => {
        const block = buildControlBlock(path);
        expect(block.length).toBe(1 + path.length * 32);
        path.forEach((sibling, i) => {
          expect(hex.encode(block.slice(1 + i * 32, 33 + i * 32))).toBe(hex.encode(sibling));
        });
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe('depth-zero trees are always refused', () => {
  it('a single leaf never produces a tree, whatever the script', () => {
    fc.assert(
      fc.property(leafArb, (leaf) => {
        expect(() => p2mrMerkleRoot([leaf])).toThrow(P2mrUnsafeTreeError);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('a single leaf never produces a migration, on any network', () => {
    fc.assert(
      fc.property(leafArb, networkArb, (leaf, target) => {
        expect(() =>
          planP2mrMigration({
            inputs: [
              {
                txid: '33'.repeat(32),
                vout: 0,
                value: 400_000,
                status: { confirmed: true },
                address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
              },
            ],
            leaves: [leaf],
            feeRate: 5,
            target,
            acknowledgeAnyoneCanSpend: true,
          }),
        ).toThrow(target === 'bitcoin' ? P2mrNotActivatedError : P2mrUnsafeTreeError);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe('the activation guard cannot be bypassed', () => {
  const utxoArb = fc.record({
    value: fc.integer({ min: 10_000, max: 10_000_000 }),
    feeRate: fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
    ack: fc.boolean(),
  });

  it('mainnet always throws, whatever the inputs or the acknowledgement', () => {
    fc.assert(
      fc.property(utxoArb, fc.array(leafArb, { minLength: 2, maxLength: 5 }), (params, leaves) => {
        expect(() =>
          planP2mrMigration({
            inputs: [
              {
                txid: '11'.repeat(32),
                vout: 0,
                value: params.value,
                status: { confirmed: true },
                address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
              },
            ],
            leaves,
            feeRate: params.feeRate,
            target: 'bitcoin',
            acknowledgeAnyoneCanSpend: params.ack,
          }),
        ).toThrow(P2mrNotActivatedError);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('assertP2mrSpendable: mainnet always throws; other networks require the acknowledgement', () => {
    fc.assert(
      fc.property(networkArb, fc.boolean(), (network, ack) => {
        const call = () => assertP2mrSpendable(network, { acknowledgeAnyoneCanSpend: ack });
        if (network === 'bitcoin' || !ack) expect(call).toThrow(P2mrNotActivatedError);
        else expect(call).not.toThrow();
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('the default target is mainnet, so omitting it fails safe', () => {
    fc.assert(
      fc.property(fc.array(leafArb, { minLength: 2, maxLength: 3 }), (leaves) => {
        expect(() =>
          planP2mrMigration({
            inputs: [
              {
                txid: '22'.repeat(32),
                vout: 0,
                value: 500_000,
                status: { confirmed: true },
                address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
              },
            ],
            leaves,
            feeRate: 5,
            acknowledgeAnyoneCanSpend: true,
          }),
        ).toThrow(P2mrNotActivatedError);
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
