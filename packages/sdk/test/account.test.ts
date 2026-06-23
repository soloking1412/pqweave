import {
  decodeAbiParameters,
  decodeFunctionData,
  keccak256,
  recoverMessageAddress,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import {
  buildHybridSignature,
  encodeExecute,
  encodeHybridSignature,
  pqWeaveAccountAbi,
} from '../src/account/index.js';
import { createHashSigKey, HashSigSigner, verifyHashSig } from '../src/pqc/hashsig.js';

const owner = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
);
const userOpHash = keccak256(toHex('user-op'));

describe('account encoding', () => {
  it('encodes an execute call that decodes back to its arguments', () => {
    const dest = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const data = encodeExecute(dest, 1_000_000n, '0x');
    const decoded = decodeFunctionData({ abi: pqWeaveAccountAbi, data });
    expect(decoded.functionName).toBe('execute');
    expect(decoded.args).toEqual([dest, 1_000_000n, '0x']);
  });

  it('round-trips a hybrid signature', () => {
    const hybrid = encodeHybridSignature('0xaabb', '0xccdd');
    const [ecdsa, pqc] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], hybrid);
    expect(ecdsa).toBe('0xaabb');
    expect(pqc).toBe('0xccdd');
  });
});

describe('buildHybridSignature', () => {
  it('produces an ECDSA signature the account can recover to the owner', async () => {
    const hybrid = await buildHybridSignature({ signer: owner, userOpHash });
    const [ecdsa, pqc] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], hybrid);

    const recovered = await recoverMessageAddress({
      message: { raw: userOpHash },
      signature: ecdsa,
    });
    expect(recovered).toBe(owner.address);
    expect(pqc).toBe('0x');
  });

  it('attaches a verifiable post-quantum signature for gated operations', async () => {
    const key = createHashSigKey(keccak256(toHex('pqc-master')), 4);
    const hybrid = await buildHybridSignature({
      signer: owner,
      userOpHash,
      hashSigKey: key,
      leafIndex: 2,
    });
    const [, pqc] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], hybrid);
    expect(verifyHashSig(key.root, userOpHash, pqc)).toBe(true);
  });

  it('advances the leaf index when signing through a HashSigSigner', async () => {
    const hashSigner = HashSigSigner.create(keccak256(toHex('pqc-master')), 4);
    expect(hashSigner.nextLeafIndex).toBe(0);

    const hybrid = await buildHybridSignature({ signer: owner, userOpHash, hashSigner });
    const [, pqc] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], hybrid);

    expect(verifyHashSig(hashSigner.root, userOpHash, pqc)).toBe(true);
    expect(hashSigner.nextLeafIndex).toBe(1); // the leaf was consumed
  });
});
