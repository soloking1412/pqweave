import * as btc from '@scure/btc-signer';
import { tapLeafHash as btcTapLeafHash } from '@scure/btc-signer/payment.js';
import { base64, bech32m, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';
import {
  assertP2mrSpendable,
  P2mrNotActivatedError,
  planP2mrMigration,
  rawLeafTemplate,
} from '../src/bitcoin/p2mr-migration.js';
import { buildEvacuationPsbts, type EvacuationInput } from '../src/bitcoin/evacuation.js';
import { checkDestination } from '../src/bitcoin/safety.js';
import {
  buildControlBlock,
  decodeP2mrAddress,
  encodeP2mrAddress,
  isDepthZeroControlBlock,
  isP2mrAddress,
  P2MR_LEAF_VERSION,
  P2MR_WITNESS_VERSION,
  P2mrUnsafeTreeError,
  p2mrMerkleRoot,
  p2mrScript,
  tapBranchHash,
  tapLeafHash,
} from '../src/bitcoin/p2mr.js';
import { classifyBitcoinAddress } from '../src/bitcoin/address.js';

/**
 * BIP-360 (P2MR) is Draft and not activated anywhere. These tests check the
 * wire format against the specification, including the example address the BIP
 * itself publishes — the one ground truth available today.
 */

// Published in BIP-360 as the example P2MR address.
const BIP360_ADDRESS = 'bc1zzmv50jjgxxhww6ve4g5zpewrkjqhr06fyujpm20tuezdlxmfphcqfc80ve';
const BIP360_PROGRAM = '16d947ca4831aee76999aa2820e5c3b48171bf4927241da9ebe644df9b690df0';

describe('BIP-360 published address vector', () => {
  it('decodes to SegWit v2 with a 32-byte program', () => {
    const decoded = decodeP2mrAddress(BIP360_ADDRESS);
    expect(decoded).not.toBeNull();
    expect(decoded!.network).toBe('bitcoin');
    expect(decoded!.merkleRoot.length).toBe(32);
    expect(hex.encode(decoded!.merkleRoot)).toBe(BIP360_PROGRAM);
  });

  it('re-encodes to exactly the published address', () => {
    const { merkleRoot } = decodeP2mrAddress(BIP360_ADDRESS)!;
    expect(encodeP2mrAddress(merkleRoot, 'bitcoin')).toBe(BIP360_ADDRESS);
  });

  it('uses witness version 2', () => {
    expect(P2MR_WITNESS_VERSION).toBe(2);
    // bech32m maps witness version 2 to the character "z" — the widely-repeated
    // "bc1r" prefix comes from an older draft that used version 3.
    expect(BIP360_ADDRESS.startsWith('bc1z')).toBe(true);
  });
});

describe('address decoding rejects near-misses', () => {
  it('rejects Taproot (witness v1)', () => {
    expect(isP2mrAddress('bc1pr896td3mmjl5vc57mutumgfmeet8hyzy9w6zr6hg5vhrtppevlpsp3x3nm')).toBe(
      false,
    );
  });

  it('rejects native SegWit (witness v0)', () => {
    expect(isP2mrAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe(false);
  });

  it('rejects a witness v2 program that is not 32 bytes', () => {
    // Same version, 20-byte program — structurally not P2MR.
    const short = encodeShortV2();
    expect(isP2mrAddress(short)).toBe(false);
  });

  it('rejects nonsense', () => {
    expect(isP2mrAddress('not-an-address')).toBe(false);
    expect(decodeP2mrAddress('')).toBeNull();
    expect(decodeP2mrAddress('bC1z' + BIP360_ADDRESS.slice(4))).toBeNull();
  });
});

/** A witness-v2 bech32m address with a 20-byte program, for the negative test. */
function encodeShortV2(): string {
  // Built by hand: encodeP2mrAddress deliberately enforces 32 bytes.
  return bech32m.encode('bc', [2, ...bech32m.toWords(new Uint8Array(20).fill(7))], false);
}

describe('scriptPubKey shape', () => {
  it('is OP_2 followed by a 32-byte push', () => {
    const root = new Uint8Array(32).fill(0xab);
    const script = p2mrScript(root);
    expect(script.length).toBe(34);
    expect(script[0]).toBe(0x52); // OP_2
    expect(script[1]).toBe(32); // OP_PUSHBYTES_32
    expect(hex.encode(script.slice(2))).toBe(hex.encode(root));
  });

  it('matches the published vector end to end', () => {
    const { merkleRoot } = decodeP2mrAddress(BIP360_ADDRESS)!;
    const script = p2mrScript(merkleRoot);
    const decoded = btc.Script.decode(script);
    expect(decoded[0]).toBe(2); // OP_2
    expect(hex.encode(decoded[1] as Uint8Array)).toBe(BIP360_PROGRAM);
  });

  it('refuses a root that is not 32 bytes', () => {
    expect(() => p2mrScript(new Uint8Array(20))).toThrow(/32 bytes/);
  });
});

describe('BIP-341 tagged hashes', () => {
  const scriptA = Uint8Array.of(0x51); // OP_1
  const scriptB = Uint8Array.of(0x52); // OP_2

  it('leaf hash matches btc-signer, which applies the compact-size prefix', () => {
    expect(hex.encode(tapLeafHash(scriptA))).toBe(
      hex.encode(btcTapLeafHash(scriptA, P2MR_LEAF_VERSION)),
    );
  });

  it('branch hash is order-independent (children sorted lexicographically)', () => {
    const a = tapLeafHash(scriptA);
    const b = tapLeafHash(scriptB);
    expect(hex.encode(tapBranchHash(a, b))).toBe(hex.encode(tapBranchHash(b, a)));
  });

  // BIP-360 diverges from BIP-341: a depth-0 tree validates without running the
  // leaf ("If m = 0, succeed immediately"), so the output is anyone-can-spend.
  // This test previously asserted the empty path was correct; it is a hazard.
  it('refuses a single-leaf tree, which would be anyone-can-spend', () => {
    expect(() => p2mrMerkleRoot([{ script: scriptA }])).toThrow(P2mrUnsafeTreeError);
    expect(() => p2mrMerkleRoot([{ script: scriptA }])).toThrow(/anyone-can-spend/);
  });

  it('every leaf of a two-leaf tree has a non-empty path', () => {
    const tree = p2mrMerkleRoot([{ script: scriptA }, { script: scriptB }]);
    for (const leaf of tree.leaves) {
      expect(leaf.path.length).toBeGreaterThanOrEqual(1);
      expect(isDepthZeroControlBlock(leaf.controlBlock)).toBe(false);
    }
  });
});

describe('script tree and control blocks', () => {
  const leaves = [
    { script: Uint8Array.of(0x51) },
    { script: Uint8Array.of(0x52) },
    { script: Uint8Array.of(0x53) },
    { script: Uint8Array.of(0x54) },
  ];

  it('every leaf gets a path that rebuilds the root', () => {
    const tree = p2mrMerkleRoot(leaves);
    for (const leaf of tree.leaves) {
      let node = leaf.hash;
      for (const sibling of leaf.path) node = tapBranchHash(node, sibling);
      expect(hex.encode(node)).toBe(hex.encode(tree.root));
    }
  });

  it('control block is 1 + 32*m bytes with the parity bit set', () => {
    const tree = p2mrMerkleRoot(leaves);
    for (const leaf of tree.leaves) {
      expect(leaf.controlBlock.length).toBe(1 + leaf.path.length * 32);
      // P2MR has no key path, so BIP-360 fixes the parity bit to 1.
      expect(leaf.controlBlock[0]! & 1).toBe(1);
      expect(leaf.controlBlock[0]! & 0xfe).toBe(P2MR_LEAF_VERSION & 0xfe);
    }
  });

  it('is deterministic — the same leaves give the same root', () => {
    expect(hex.encode(p2mrMerkleRoot(leaves).root)).toBe(hex.encode(p2mrMerkleRoot(leaves).root));
  });

  it('handles an odd number of leaves', () => {
    const tree = p2mrMerkleRoot(leaves.slice(0, 3));
    expect(tree.leaves).toHaveLength(3);
    for (const leaf of tree.leaves) {
      let node = leaf.hash;
      for (const sibling of leaf.path) node = tapBranchHash(node, sibling);
      expect(hex.encode(node)).toBe(hex.encode(tree.root));
    }
  });

  it('rejects an empty tree', () => {
    expect(() => p2mrMerkleRoot([])).toThrow(P2mrUnsafeTreeError);
  });

  it('buildControlBlock lays the path out in order', () => {
    const path = [new Uint8Array(32).fill(1), new Uint8Array(32).fill(2)];
    const block = buildControlBlock(path);
    expect(block.length).toBe(65);
    expect(block.slice(1, 33).every((b) => b === 1)).toBe(true);
    expect(block.slice(33).every((b) => b === 2)).toBe(true);
  });
});

describe('activation safety — the point of this phase', () => {
  const priv = (() => {
    const k = new Uint8Array(32).fill(0);
    k[31] = 11;
    return k;
  })();
  const pubkey = secp256k1.getPublicKey(priv, true);
  // Inputs live on the same network as the migration target — signet/testnet
  // share the `tb` prefix, so build them with TEST_NETWORK.
  const payment = btc.p2wpkh(pubkey, btc.TEST_NETWORK);
  // A P2MR tree needs two leaves minimum: a depth-0 tree is anyone-can-spend.
  // In production one of these is the post-quantum fallback path.
  const leaf = { script: Uint8Array.of(0x51) };
  const fallbackLeaf = { script: Uint8Array.of(0x52) };
  const leaves = [leaf, fallbackLeaf];

  function inputs(): EvacuationInput[] {
    const fund = new btc.Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
    fund.addOutput({ script: payment.script, amount: 300_000n });
    fund.addInput({
      txid: new Uint8Array(32),
      index: 0xffffffff,
      finalScriptSig: Uint8Array.of(1, 1),
      sequence: 0xffffffff,
    });
    return [
      {
        txid: fund.id,
        vout: 0,
        value: 300_000,
        status: { confirmed: true },
        address: payment.address!,
        pubkey,
        prevTxHex: hex.encode(fund.toBytes(true, false)),
      },
    ];
  }

  it('refuses a mainnet migration outright', () => {
    expect(() =>
      planP2mrMigration({
        inputs: inputs(),
        leaves,
        feeRate: 5,
        target: 'bitcoin',
        acknowledgeAnyoneCanSpend: true, // even with the flag, mainnet is refused
      }),
    ).toThrow(P2mrNotActivatedError);
    expect(() =>
      planP2mrMigration({ inputs: inputs(), leaves, feeRate: 5, target: 'bitcoin' }),
    ).toThrow(/anyone-can-spend/i);
  });

  it('refuses a test network without an explicit acknowledgement', () => {
    expect(() =>
      planP2mrMigration({ inputs: inputs(), leaves, feeRate: 5, target: 'signet' }),
    ).toThrow(P2mrNotActivatedError);
  });

  it('builds on a test network once the hazard is acknowledged', () => {
    const plan = planP2mrMigration({
      inputs: inputs(),
      leaves,
      feeRate: 5,
      target: 'signet',
      acknowledgeAnyoneCanSpend: true,
    });
    expect(plan.destination.startsWith('tb1z')).toBe(true);
    expect(plan.warnings.join(' ')).toMatch(/anyone-can-spend/i);
    // Regtest gets its own prefix.
    expect(encodeP2mrAddress(plan.tree.root, 'regtest').startsWith('bcrt1z')).toBe(true);
  });

  it('assertP2mrSpendable is exported and enforces the same rule', () => {
    expect(() => assertP2mrSpendable('bitcoin', { acknowledgeAnyoneCanSpend: true })).toThrow(
      P2mrNotActivatedError,
    );
    expect(() => assertP2mrSpendable('signet', { acknowledgeAnyoneCanSpend: true })).not.toThrow();
  });

  it('refuses to sweep FROM a P2MR output, because it cannot be spent yet', () => {
    const utxo: EvacuationInput = {
      txid: '11'.repeat(32),
      vout: 0,
      value: 100_000,
      status: { confirmed: true },
      address: BIP360_ADDRESS,
    };
    expect(() =>
      buildEvacuationPsbts({
        inputs: [utxo],
        destination: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        feeRates: { economy: 1, standard: 2, priority: 3 },
      }),
    ).toThrow(/draft|anyone-can-spend/i);
  });

  it('a mainnet P2MR destination is unsafe, not merely a warning', async () => {
    const stub = (async () =>
      new Response(
        JSON.stringify({
          chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, spent_txo_count: 0, tx_count: 0 },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const check = await checkDestination(BIP360_ADDRESS, undefined, { fetchImpl: stub });
    expect(check.verdict).toBe('unsafe');
    expect(check.problems.join(' ')).toMatch(/anyone-can-spend/i);
  });
});

describe('migration transaction shape', () => {
  const priv = (() => {
    const k = new Uint8Array(32).fill(0);
    k[31] = 12;
    return k;
  })();
  const pubkey = secp256k1.getPublicKey(priv, true);
  const legacy = btc.p2pkh(pubkey, btc.TEST_NETWORK);

  function legacyPlan() {
    const fund = new btc.Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
    fund.addOutput({ script: legacy.script, amount: 500_000n });
    fund.addInput({
      txid: new Uint8Array(32),
      index: 0xffffffff,
      finalScriptSig: Uint8Array.of(1, 1),
      sequence: 0xffffffff,
    });
    return planP2mrMigration({
      inputs: [
        {
          txid: fund.id,
          vout: 0,
          value: 500_000,
          status: { confirmed: true },
          address: legacy.address!,
          pubkey,
          prevTxHex: hex.encode(fund.toBytes(true, false)),
        },
      ],
      leaves: [{ script: Uint8Array.of(0x51) }, { script: Uint8Array.of(0x52) }],
      feeRate: 4,
      target: 'signet',
      acknowledgeAnyoneCanSpend: true,
    });
  }

  it('pays exactly one OP_2 output for the fee-adjusted amount', () => {
    const plan = legacyPlan();
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.psbtBase64));
    expect(tx.outputsLength).toBe(1);
    const out = tx.getOutput(0);
    expect(out.amount).toBe(plan.outputSats);
    expect(out.script![0]).toBe(0x52); // OP_2
    expect(out.script!.length).toBe(34);
    expect(plan.totalInputSats - plan.feeSats).toBe(plan.outputSats);
  });

  it('the output script commits to the tree root and matches the address', () => {
    const plan = legacyPlan();
    expect(hex.encode(plan.outputScript)).toBe(hex.encode(p2mrScript(plan.tree.root)));
    expect(plan.destination).toBe(encodeP2mrAddress(plan.tree.root, 'signet'));
  });

  it('inherits the legacy signing rules — nonWitnessUtxo is carried through', () => {
    const plan = legacyPlan();
    const tx = btc.Transaction.fromPSBT(base64.decode(plan.psbtBase64));
    expect(tx.getInput(0).nonWitnessUtxo).toBeTruthy();
    expect(tx.getInput(0).sequence).toBe(0xfffffffd); // RBF preserved
  });

  it('fails loudly when a legacy input lacks its previous transaction', () => {
    expect(() =>
      planP2mrMigration({
        inputs: [
          {
            txid: '22'.repeat(32),
            vout: 0,
            value: 500_000,
            status: { confirmed: true },
            address: legacy.address!,
            pubkey,
          },
        ],
        leaves: [{ script: Uint8Array.of(0x51) }, { script: Uint8Array.of(0x52) }],
        feeRate: 4,
        target: 'signet',
        acknowledgeAnyoneCanSpend: true,
      }),
    ).toThrow(/previous transaction/i);
  });

  it('rejects an empty tree and a non-positive fee rate', () => {
    const base = {
      inputs: [
        {
          txid: '33'.repeat(32),
          vout: 0,
          value: 500_000,
          status: { confirmed: true },
          address: legacy.address!,
        },
      ] as EvacuationInput[],
      target: 'signet' as const,
      acknowledgeAnyoneCanSpend: true,
    };
    expect(() => planP2mrMigration({ ...base, leaves: [], feeRate: 4 })).toThrow(
      P2mrUnsafeTreeError,
    );
    // One leaf is a tree, but an anyone-can-spend one.
    expect(() =>
      planP2mrMigration({ ...base, leaves: [{ script: Uint8Array.of(0x51) }], feeRate: 4 }),
    ).toThrow(P2mrUnsafeTreeError);
    expect(() =>
      planP2mrMigration({
        ...base,
        leaves: [{ script: Uint8Array.of(0x51) }, { script: Uint8Array.of(0x52) }],
        feeRate: 0,
      }),
    ).toThrow(/sat\/vB/);
  });

  it('rawLeafTemplate passes the script through untouched', () => {
    const script = Uint8Array.of(0x51, 0x52);
    const template = rawLeafTemplate(script);
    expect(hex.encode(template.buildLeafScript())).toBe(hex.encode(script));
    expect(template.describe()).toMatch(/no post-quantum signature opcodes/i);
  });
});

describe('address classification', () => {
  it('classifies a P2MR address as p2mr, not unknown', () => {
    expect(classifyBitcoinAddress(BIP360_ADDRESS)).toBe('p2mr');
  });

  it('still classifies the other types correctly', () => {
    expect(classifyBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('p2wpkh');
    expect(
      classifyBitcoinAddress('bc1pr896td3mmjl5vc57mutumgfmeet8hyzy9w6zr6hg5vhrtppevlpsp3x3nm'),
    ).toBe('p2tr');
    expect(classifyBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('p2pkh');
  });
});
