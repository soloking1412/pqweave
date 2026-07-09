import { decodeFunctionData, getAddress, keccak256 } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  buildForwarderInstall,
  buildSetDestination,
  encodeFlush,
  encodeFlushErc20,
  pqWeaveForwarderAbi,
  setDestinationDigest,
} from '../src/forwarder/index.js';
import { HashSigSigner, verifyHashSig } from '../src/pqc/hashsig.js';

const FORWARDER = getAddress('0x00000000000000000000000000000000000f0f0f');
const DESTINATION = getAddress('0x2222222222222222222222222222222222222222');
const VERIFIER = getAddress('0x3333333333333333333333333333333333333333');
const USDC = getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');

// Shared with the Foundry fixture test (test/PQWeaveForwarder.t.sol):
// chainId 84532, mailbox = vm.addr(0xC0FFEE), nonce 0, destination 0x2222…2222.
const FIXTURE_MAILBOX = getAddress('0xF5A5E415061470A8b9137959180901aEa72450a4');
const FIXTURE_CHAIN_ID = 84532;

describe('forwarder install', () => {
  it('builds the one-transaction install calldata', () => {
    const install = buildForwarderInstall({
      forwarder: FORWARDER,
      destination: DESTINATION,
      pqcRoot: keccak256(new Uint8Array([1])),
      verifier: VERIFIER,
      erc20s: [USDC],
    });
    expect(install.delegate).toBe(FORWARDER);

    const decoded = decodeFunctionData({ abi: pqWeaveForwarderAbi, data: install.data });
    expect(decoded.functionName).toBe('initializeAndFlush');
    expect(decoded.args[0]).toBe(DESTINATION);
    expect(decoded.args[3]).toEqual([USDC]);
  });

  it('encodes permissionless flush calls', () => {
    expect(decodeFunctionData({ abi: pqWeaveForwarderAbi, data: encodeFlush() }).functionName).toBe(
      'flush',
    );
    const erc20 = decodeFunctionData({ abi: pqWeaveForwarderAbi, data: encodeFlushErc20(USDC) });
    expect(erc20.functionName).toBe('flushERC20');
    expect(erc20.args[0]).toBe(USDC);
  });
});

// The identical constant is asserted against the real contract in
// PQWeaveForwarderTest.test_setDestinationDigestMatchesSdkFixture.
const FIXTURE_DIGEST = '0xfd2874aae6828d66391db7698ed33782592b8b860a7ffa30a0799b07e63d3fee';

describe('setDestination digest', () => {
  it('matches the on-chain digest byte-for-byte (Foundry fixture)', () => {
    const digest = setDestinationDigest({
      chainId: FIXTURE_CHAIN_ID,
      account: FIXTURE_MAILBOX,
      nonce: 0n,
      newDestination: DESTINATION,
    });
    expect(digest).toBe(FIXTURE_DIGEST);
  });

  it('changes with the nonce so a signature cannot be replayed', () => {
    const base = { chainId: 1, account: FIXTURE_MAILBOX, newDestination: DESTINATION };
    expect(setDestinationDigest({ ...base, nonce: 0n })).not.toBe(
      setDestinationDigest({ ...base, nonce: 1n }),
    );
  });
});

describe('buildSetDestination', () => {
  it('consumes exactly one leaf and produces a verifiable signature', () => {
    const signer = HashSigSigner.create(keccak256(new Uint8Array([7])), 16);
    const before = signer.nextLeafIndex;

    const call = buildSetDestination(signer, {
      chainId: FIXTURE_CHAIN_ID,
      account: FIXTURE_MAILBOX,
      nonce: 0n,
      newDestination: DESTINATION,
    });

    expect(signer.nextLeafIndex).toBe(before + 1);
    expect(call.leafIndex).toBe(before);

    const decoded = decodeFunctionData({ abi: pqWeaveForwarderAbi, data: call.data });
    expect(decoded.functionName).toBe('setDestination');
    expect(decoded.args[0]).toBe(DESTINATION);
    expect(verifyHashSig(signer.root, call.digest, decoded.args[1] as `0x${string}`)).toBe(true);
  });
});
