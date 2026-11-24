/** Isolated Bitcoin Core consensus/signing integration. Uses disposable regtest coins only. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import * as btc from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import {
  buildBitcoinReadinessPlan,
  createBitcoinPlanBundle,
  restoreBitcoinPlanBundle,
  verifySweepMatchesPlan,
  finalizeSweep,
} from '../dist/bitcoin/index.js';

const daemon = process.env.BITCOIND ?? 'bitcoind';
const cli = process.env.BITCOIN_CLI ?? 'bitcoin-cli';
const portServer = createServer();
portServer.listen(0, '127.0.0.1');
await once(portServer, 'listening');
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const datadir = mkdtempSync(join(tmpdir(), 'pqweave-core-'));
const args = ['-regtest', `-datadir=${datadir}`, `-rpcport=${port}`];
let child;
const rpc = (wallet, method, ...params) => {
  const result = execFileSync(
    cli,
    [
      ...args,
      '-rpcwait',
      '-rpcwaittimeout=15',
      ...(wallet ? [`-rpcwallet=${wallet}`] : []),
      method,
      ...params.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))),
    ],
    { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
};
const regtest = { ...btc.TEST_NETWORK, bech32: 'bcrt' };
const portable = (address) =>
  btc.Address(btc.TEST_NETWORK).encode(btc.Address(regtest).decode(address));
const publicKey = (info) => {
  const value =
    info.pubkey ??
    info.embedded?.pubkey ??
    info.desc?.match(/\]([a-fA-F0-9]{66}|[a-fA-F0-9]{64})[,)\]]/)?.[1];
  if (!value) throw new Error('Core did not expose the public signing key');
  return hex.decode(value.length === 64 ? `02${value}` : value);
};
const feeRates = { economy: 2, standard: 3, priority: 5 };
let checks = 1;
try {
  child = spawn(
    daemon,
    [
      ...args,
      '-server=1',
      '-listen=0',
      '-connect=0',
      '-dnsseed=0',
      '-discover=0',
      '-persistmempool=0',
      '-fallbackfee=0.00002',
    ],
    { stdio: 'ignore' },
  );
  child.on('error', () => {});
  const chain = rpc(null, 'getblockchaininfo');
  assert.equal(chain.chain, 'regtest');
  rpc(null, 'createwallet', 'source');
  rpc(null, 'createwallet', 'destination');
  const mineTo = rpc('source', 'getnewaddress', '', 'bech32');
  rpc(null, 'generatetoaddress', 101, mineTo);
  for (const type of ['legacy', 'p2sh-segwit', 'bech32', 'bech32m']) {
    const source = rpc('source', 'getnewaddress', '', type);
    const dest = rpc('destination', 'getnewaddress', '', 'bech32');
    const funding = rpc('source', 'sendtoaddress', source, 0.02);
    rpc(null, 'generatetoaddress', 1, mineTo);
    const utxo = rpc('source', 'listunspent', 1, 9999999, [source]).find((u) => u.txid === funding);
    assert.ok(utxo);
    const input = {
      txid: utxo.txid,
      vout: utxo.vout,
      value: Math.round(utxo.amount * 1e8),
      status: { confirmed: true },
      address: portable(source),
      prevTxHex: rpc('source', 'gettransaction', funding).hex,
      pubkey: publicKey(rpc('source', 'getaddressinfo', source)),
    };
    const params = { inputs: [input], destination: portable(dest), testnet: true, feeRates };
    const plan = buildBitcoinReadinessPlan(params);
    const restored = restoreBitcoinPlanBundle(JSON.stringify(createBitcoinPlanBundle(params)));
    assert.equal(restored.plan.tiers[0].psbtBase64, plan.tiers[0].psbtBase64);
    const finalized = [];
    for (const tier of plan.tiers) {
      const decoded = rpc(null, 'decodepsbt', tier.psbtBase64);
      assert.equal(Math.round(decoded.fee * 1e8), Number(tier.feeSats));
      const signed = rpc('source', 'walletprocesspsbt', tier.psbtBase64, true, 'ALL', true, false);
      const match = verifySweepMatchesPlan(signed.psbt, plan, tier);
      assert.equal(match.ok, true, match.mismatches.join('; '));
      const result = finalizeSweep(signed.psbt);
      const coreFinal = rpc(null, 'finalizepsbt', signed.psbt);
      assert.equal(coreFinal.hex, result.hex, 'SDK and Core finalized bytes must match');
      const corePsbt = rpc('source', 'walletprocesspsbt', tier.psbtBase64, true, 'ALL', true, true);
      assert.equal(
        verifySweepMatchesPlan(corePsbt.psbt, plan, tier).ok,
        true,
        'finalized PSBT matches',
      );
      const acceptance = rpc(null, 'testmempoolaccept', [result.hex])[0];
      assert.equal(acceptance.allowed, true, JSON.stringify(acceptance));
      const actual = rpc(null, 'decoderawtransaction', result.hex);
      assert.ok(
        actual.vsize <= plan.vsize,
        `underestimated signed vsize: ${actual.vsize} > ${plan.vsize}`,
      );
      if (tier === plan.tiers[0]) {
        const signedInput = btc.Transaction.fromPSBT(base64.decode(signed.psbt)).getInput(0);
        const signature = signedInput.partialSig?.[0]?.[1] ?? signedInput.tapKeySig;
        assert.ok(signature, 'Core supplied a signature');
        const broken = signature.slice();
        broken[5] ^= 1;
        const invalid = result.hex.replace(hex.encode(signature), hex.encode(broken));
        assert.notEqual(invalid, result.hex, 'the signature was actually changed');
        assert.equal(
          rpc(null, 'testmempoolaccept', [invalid])[0].allowed,
          false,
          'Core rejects an invalid signature',
        );
        checks += 3;
      }
      finalized.push(result);
      checks += 6;
    }
    rpc(null, 'sendrawtransaction', finalized[0].hex);
    rpc(null, 'sendrawtransaction', finalized[2].hex);
    assert.deepEqual(rpc(null, 'getrawmempool'), [finalized[2].txid]);
    rpc(null, 'generatetoaddress', 1, mineTo);
    assert.equal(rpc(null, 'gettxout', input.txid, input.vout), null);
    const received = rpc(null, 'gettxout', finalized[2].txid, 0);
    assert.equal(Math.round(received.value * 1e8), Number(plan.tiers[2].outputSats));
    const recovery = buildBitcoinReadinessPlan({
      testnet: true,
      feeRates,
      destination: portable(rpc('destination', 'getnewaddress', '', 'bech32')),
      inputs: [
        {
          txid: finalized[2].txid,
          vout: 0,
          value: Number(plan.tiers[2].outputSats),
          status: { confirmed: true },
          address: portable(dest),
          prevTxHex: finalized[2].hex,
          pubkey: publicKey(rpc('destination', 'getaddressinfo', dest)),
        },
      ],
    });
    const recoverySigned = rpc(
      'destination',
      'walletprocesspsbt',
      recovery.tiers[0].psbtBase64,
      true,
      'ALL',
      true,
      false,
    );
    const spent = finalizeSweep(recoverySigned.psbt);
    assert.equal(rpc(null, 'testmempoolaccept', [spent.hex])[0].allowed, true);
    rpc(null, 'sendrawtransaction', spent.hex);
    rpc(null, 'generatetoaddress', 1, mineTo);
    assert.equal(rpc(null, 'gettxout', finalized[2].txid, 0), null);
    checks += 7;
    console.log(
      `PASS ${type}: Core signs 3 tiers, agrees with SDK, replaces fee tier, confirms receipt, and spends destination`,
    );
  }
  console.log(
    `PASS Bitcoin Core ${rpc(null, 'getnetworkinfo').subversion}: ${checks} integration assertions; isolated regtest, no public broadcasts`,
  );
} finally {
  try {
    rpc(null, 'stop');
  } catch {
    child?.kill('SIGTERM');
  }
  if (child && child.exitCode === null)
    await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child?.exitCode !== null) rmSync(datadir, { recursive: true, force: true });
}
