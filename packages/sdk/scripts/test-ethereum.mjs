/** Real local ERC-4337 v0.7 and EIP-7702 lifecycle. No public RPC or funds. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  parseEther,
  zeroAddress,
  encodeFunctionData,
  parseAbi,
  decodeAbiParameters,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { DurablePqcSigner } from '../dist/pqc/index.js';
import { FileLeafReservationStore } from '../dist/pqc/node.js';
import {
  encodeCreateAccount,
  predictAccountAddress,
  encodeExecute,
  encodeExecuteBatch,
  encodeHybridSignature,
  pqWeaveAccountAbi,
} from '../dist/account/index.js';
import {
  buildOneClickMigration,
  buildEthereumTransferPlan,
  revalidateEthereumTransferPlan,
} from '../dist/migration/index.js';
import {
  buildAccountUserOp,
  getUserOpHash,
  encodeHandleOps,
  readUserOperationOutcome,
} from '../dist/userop/index.js';

const require = createRequire(import.meta.url);
const epArtifact = require('@account-abstraction/contracts/artifacts/EntryPoint.json');
const root = fileURLToPath(new URL('../../contracts/out/', import.meta.url));
const artifact = async (source, name = source.replace('.sol', '')) =>
  JSON.parse(await readFile(join(root, source, `${name}.json`), 'utf8'));
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const dir = await mkdtemp(join(tmpdir(), 'pqweave-eth-'));
const node = spawn(
  'anvil',
  ['--host', '127.0.0.1', '--port', String(port), '--hardfork', 'prague', '--silent'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let startupError;
node.stdout.resume();
node.stderr.resume();
node.on('error', (e) => {
  startupError = e;
});
const transport = http(`http://127.0.0.1:${port}`, { retryCount: 0, timeout: 10_000 });
const client = createPublicClient({ chain: foundry, transport, pollingInterval: 25 });
let assertions = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions++;
};
const rejects = async (fn) => {
  await assert.rejects(fn);
  assertions++;
};
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (startupError) throw startupError;
    try {
      await client.getChainId();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert(ready, 'Anvil did not start');
  const account = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({ chain: foundry, transport, account });
  await client.request({
    method: 'anvil_setBalance',
    params: [account.address, toHex(parseEther('1000'))],
  });
  async function receipt(hash) {
    return client.waitForTransactionReceipt({ hash, timeout: 45_000 });
  }
  async function send(to, data = '0x', value = 0n, extra = {}) {
    return receipt(await wallet.sendTransaction({ to, data, value, ...extra }));
  }
  async function deploy(a, args = []) {
    const result = await receipt(
      await wallet.deployContract({
        abi: a.abi,
        bytecode: typeof a.bytecode === 'string' ? a.bytecode : a.bytecode.object,
        args,
      }),
    );
    check(result.status, 'success', 'deployment');
    return result.contractAddress;
  }
  const entryPoint = await deploy(epArtifact);
  const factory = await deploy(await artifact('PQWeaveFactory.sol'), [entryPoint]);
  const executor = await deploy(await artifact('BatchExecutor.sol'));
  const tokenArtifact = await artifact('Mocks.sol', 'MockERC20');
  const token = await deploy(tokenArtifact);
  const falseToken = await deploy(await artifact('OneClickMigration.t.sol', 'FalseReturnToken'));
  const nftArtifact = await artifact('Mocks.sol', 'MockERC721');
  const nft = await deploy(nftArtifact);
  const tokenAbi = tokenArtifact.abi;
  const beneficiary = privateKeyToAccount(generatePrivateKey()).address;
  const read = (address, functionName, args = []) =>
    client.readContract({ address, abi: pqWeaveAccountAbi, functionName, args });
  const balance = (owner) =>
    client.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [owner],
    });

  for (const scheme of ['lamport', 'winternitz']) {
    const verifier = await deploy(
      await artifact(
        scheme === 'lamport' ? 'LamportMerkleVerifier.sol' : 'WinternitzMerkleVerifier.sol',
      ),
    );
    const store = new FileLeafReservationStore(join(dir, `${scheme}.json`));
    const signer = new DurablePqcSigner(generatePrivateKey(), 8, scheme, store);
    await store.initializeFreshKey(signer.root, 8);
    const params = {
      owner: zeroAddress,
      pqcPublicKey: signer.root,
      verifier,
      valueThreshold: 0n,
      salt: keccak256(toHex(scheme)),
    };
    const safe = await predictAccountAddress(client, factory, params);
    check((await send(factory, encodeCreateAccount(params))).status, 'success');
    check(await read(safe, 'owner'), zeroAddress);
    check(await read(safe, 'pqcPublicKey'), signer.root);
    await send(
      token,
      encodeFunctionData({ abi: tokenAbi, functionName: 'mint', args: [account.address, 1000n] }),
    );
    const tokenId = scheme === 'lamport' ? 7n : 8n;
    await send(
      nft,
      encodeFunctionData({
        abi: nftArtifact.abi,
        functionName: 'mint',
        args: [account.address, tokenId],
      }),
    );
    // Hashes are trusted only because this test deployed the artifacts itself.
    // Production callers must obtain them from an independently reviewed manifest.
    const plan = await buildEthereumTransferPlan(client, {
      source: account.address,
      nativeWei: parseEther('5'),
      gasReserveWei: parseEther('1'),
      tokens: [token],
      destination: {
        chainId: foundry.id,
        account: safe,
        root: signer.root,
        verifier,
        entryPoint,
        accountCodeHash: keccak256(await client.getCode({ address: safe })),
        verifierCodeHash: keccak256(await client.getCode({ address: verifier })),
        entryPointCodeHash: keccak256(await client.getCode({ address: entryPoint })),
      },
    });
    check((await revalidateEthereumTransferPlan(client, plan)).transfers.length, 2);
    const migration = buildOneClickMigration(executor, {
      from: account.address,
      to: safe,
      native: parseEther('5'),
      erc20s: [{ token, amount: 1000n }],
      erc721s: [{ token: nft, tokenId }],
    });
    if (scheme === 'lamport') {
      const authorization = await wallet.signAuthorization({
        contractAddress: executor,
        executor: 'self',
      });
      check(
        (await send(account.address, migration.data, 0n, { authorizationList: [authorization] }))
          .status,
        'success',
      );
      check(
        (await client.getCode({ address: account.address })).toLowerCase(),
        `0xef0100${executor.slice(2).toLowerCase()}`,
      );
    } else {
      const revoke = await wallet.signAuthorization({
        contractAddress: zeroAddress,
        executor: 'self',
      });
      check(
        (await send(account.address, '0x', 0n, { authorizationList: [revoke] })).status,
        'success',
      );
      for (const transfer of plan.transfers)
        check((await send(transfer.target, transfer.data, transfer.value)).status, 'success');
      // NFTs require a separately reviewed transfer; the ERC-20 planner does not claim to discover them.
      await send(
        nft,
        encodeFunctionData({
          abi: nftArtifact.abi,
          functionName: 'transferFrom',
          args: [account.address, safe, tokenId],
        }),
      );
      check((await client.getCode({ address: account.address })) ?? '0x', '0x');
    }
    check(await balance(account.address), 0n);
    check(await balance(safe), 1000n);
    check(await client.getBalance({ address: safe }), parseEther('5'));
    check(
      await client.readContract({
        address: nft,
        abi: nftArtifact.abi,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      safe,
    );

    async function signCall(callData, signing = signer) {
      const op = await buildAccountUserOp(client, {
        sender: safe,
        entryPoint,
        callData,
        gas: {
          verificationGasLimit: 4_000_000n,
          callGasLimit: 700_000n,
          preVerificationGas: 500_000n,
        },
      });
      const hash = await getUserOpHash(client, op, entryPoint);
      const { signature, leafIndex } = await signing.signNext(hash);
      op.signature = encodeHybridSignature('0x', signature);
      return { op, hash, leafIndex };
    }
    async function submit(signed) {
      const result = await send(entryPoint, encodeHandleOps([signed.op], beneficiary), 0n, {
        gas: 7_000_000n,
      });
      check(result.status, 'success', 'handleOps transaction');
      return readUserOperationOutcome(result.logs, signed.hash, entryPoint);
    }
    const withdrawal = await signCall(
      encodeExecuteBatch([
        { dest: beneficiary, value: parseEther('0.1'), data: '0x' },
        {
          dest: token,
          value: 0n,
          data: encodeFunctionData({
            abi: tokenAbi,
            functionName: 'transfer',
            args: [beneficiary, 100n],
          }),
        },
      ]),
    );
    check((await submit(withdrawal)).success, true);
    check(await read(safe, 'pqcLeafUsed', [0n]), true);
    check(await balance(safe), 900n);
    // Replay must fail during validation; no execution or nonce reuse.
    await rejects(() =>
      client.call({
        account: account.address,
        to: entryPoint,
        data: encodeHandleOps([withdrawal.op], beneficiary),
      }),
    );
    // On-chain history omits this reserved signature: never reuse its leaf.
    const invalid = await signCall(encodeExecute(beneficiary, 0n, '0x'));
    // A signed UserOperation binds every execution/fee field, not just calldata.
    for (const change of [
      { nonce: invalid.op.nonce + 1n },
      { initCode: '0x1234' },
      { preVerificationGas: invalid.op.preVerificationGas + 1n },
      { gasFees: toHex(1n, { size: 32 }) },
      { accountGasLimits: toHex(1n, { size: 32 }) },
      { paymasterAndData: account.address },
      { sender: beneficiary },
    ]) {
      await rejects(() =>
        client.call({
          account: account.address,
          to: entryPoint,
          data: encodeHandleOps([{ ...invalid.op, ...change }], beneficiary),
        }),
      );
      check(await read(safe, 'pqcLeafUsed', [BigInt(invalid.leafIndex)]), false);
    }
    const [, rawPqc] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes' }],
      invalid.op.signature,
    );
    // Same Merkle path, out-of-tree index; includes the former Winternitz tweak truncation.
    for (const alias of [
      BigInt(invalid.leafIndex) + 8n,
      (1n << 192n) + BigInt(invalid.leafIndex),
    ]) {
      const forged = `0x${alias.toString(16).padStart(64, '0')}${rawPqc.slice(66)}`;
      await rejects(() =>
        client.call({
          account: account.address,
          to: entryPoint,
          data: encodeHandleOps(
            [{ ...invalid.op, signature: encodeHybridSignature('0x', forged) }],
            beneficiary,
          ),
        }),
      );
      check(await read(safe, 'pqcLeafUsed', [alias]), false);
    }
    for (const malformed of [rawPqc.slice(0, -2), `${rawPqc}00`, '0x12']) {
      await rejects(() =>
        client.call({
          account: account.address,
          to: entryPoint,
          data: encodeHandleOps(
            [{ ...invalid.op, signature: encodeHybridSignature('0x', malformed) }],
            beneficiary,
          ),
        }),
      );
    }
    const original = invalid.op.signature;
    invalid.op.signature = encodeHybridSignature('0x', '0x');
    await rejects(() =>
      client.call({
        account: account.address,
        to: entryPoint,
        data: encodeHandleOps([invalid.op], beneficiary),
      }),
    );
    check(await read(safe, 'pqcLeafUsed', [BigInt(invalid.leafIndex)]), false);
    invalid.op.signature = original;
    // A valid signature over changed calldata must fail as well.
    invalid.op.callData = encodeExecute(beneficiary, 1n, '0x');
    await rejects(() =>
      client.call({
        account: account.address,
        to: entryPoint,
        data: encodeHandleOps([invalid.op], beneficiary),
      }),
    );
    const failed = await signCall(encodeExecute(beneficiary, parseEther('999999'), '0x'));
    check(
      (await submit(failed)).success,
      false,
      'execution failure must not be reported as success',
    );
    check(
      await read(safe, 'pqcLeafUsed', [BigInt(failed.leafIndex)]),
      true,
      'failed execution still consumes leaf',
    );
    const failedToken = await signCall(
      encodeExecute(
        falseToken,
        0n,
        encodeFunctionData({ abi: tokenAbi, functionName: 'transfer', args: [beneficiary, 1n] }),
      ),
    );
    check(
      (await submit(failedToken)).success,
      false,
      'false-return token must be a failed operation',
    );
    check(await read(safe, 'pqcLeafUsed', [BigInt(failedToken.leafIndex)]), true);
    const newStore = new FileLeafReservationStore(join(dir, `${scheme}-rotated.json`));
    const rotated = new DurablePqcSigner(generatePrivateKey(), 2, scheme, newStore);
    await newStore.initializeFreshKey(rotated.root, 2);
    const rotation = await signCall(
      encodeExecute(
        safe,
        0n,
        encodeFunctionData({
          abi: pqWeaveAccountAbi,
          functionName: 'rotatePqcKey',
          args: [rotated.root],
        }),
      ),
    );
    check((await submit(rotation)).success, true);
    check(await read(safe, 'pqcPublicKey'), rotated.root);
    check(await read(safe, 'pqcLeafUsed', [0n]), false);
    check(
      (await submit(await signCall(encodeExecute(beneficiary, 1n, '0x'), rotated))).success,
      true,
    );
    check(await read(safe, 'pqcLeafUsed', [0n]), true);
    console.log(
      `PASS ${scheme}: ${scheme === 'lamport' ? '7702 batch' : 'ordinary wallet'} ETH/ERC20/NFT migration, sole-PQ withdrawal, replay/tamper refusal, execution failure accounting, durable reservations, root rotation`,
    );
  }
  // Delegation persists even when execution reverts; migration must warn/reconcile.
  const authorization = await wallet.signAuthorization({
    contractAddress: executor,
    executor: 'self',
  });
  const reverted = await send(account.address, '0xdeadbeef', 0n, {
    authorizationList: [authorization],
    gas: 200_000n,
  });
  check(reverted.status, 'reverted');
  check(
    (await client.getCode({ address: account.address })).toLowerCase(),
    `0xef0100${executor.slice(2).toLowerCase()}`,
  );
  // Revoke delegation explicitly; this does not reverse the migrated assets.
  const revoke = await wallet.signAuthorization({ contractAddress: zeroAddress, executor: 'self' });
  check((await send(account.address, '0x', 0n, { authorizationList: [revoke] })).status, 'success');
  check((await client.getCode({ address: account.address })) ?? '0x', '0x');
  // Exercise the POSIX reservation lock across independent Node processes.
  const journalPath = join(dir, 'process-reservations.json');
  const journalRoot = keccak256(toHex('TEST ONLY process journal'));
  const journal = new FileLeafReservationStore(journalPath);
  await journal.initializeFreshKey(journalRoot, 32);
  const moduleUrl = new URL('../dist/pqc/node.js', import.meta.url).href;
  const childCode = `
    import { FileLeafReservationStore } from ${JSON.stringify(moduleUrl)};
    const store = new FileLeafReservationStore(process.argv[1]);
    const indices = [];
    for (let attempt = 0; indices.length < 2 && attempt < 200; attempt++) {
      try { indices.push(await store.reserve(process.argv[2], 32)); }
      catch (error) {
        if (!error.message.includes('locked')) throw error;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    if (indices.length !== 2) throw new Error('reservation retry budget exhausted');
    process.stdout.write(JSON.stringify(indices));
  `;
  const children = await Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ['--input-type=module', '-e', childCode, journalPath, journalRoot],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          );
          let output = '',
            error = '';
          child.stdout.on('data', (chunk) => (output += chunk));
          child.stderr.on('data', (chunk) => (error += chunk));
          child.on('error', reject);
          child.on('close', (code) =>
            code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)),
          );
        }),
    ),
  );
  const indices = children.flat().sort((a, b) => a - b);
  check(
    indices,
    Array.from({ length: 16 }, (_, i) => i),
    'cross-process reservations must be unique and gap-free',
  );
  check(JSON.parse(await readFile(journalPath, 'utf8')).nextIndex, 16);
  // Processes exited without signing: all sixteen reservations remain burned.
  check(await new FileLeafReservationStore(journalPath).reserve(journalRoot, 32), 16);
  await rejects(() => journal.initializeFreshKey(journalRoot, 32));
  console.log(
    'PASS signer storage: 8 concurrent processes, 16 unique durable reservations, restart and reset refusal',
  );
  console.log(
    `PASS Ethereum: ${assertions} assertions using actual EntryPoint 0.7.0 bytecode and local Prague transactions; no forks or public broadcasts`,
  );
} finally {
  if (node.pid && node.exitCode === null && node.signalCode === null) {
    node.kill('SIGTERM');
    const timer = setTimeout(() => node.kill('SIGKILL'), 2000);
    await new Promise((resolve) => node.once('exit', resolve));
    clearTimeout(timer);
  }
  await rm(dir, { recursive: true, force: true });
}
