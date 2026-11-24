/** Test the packaged artifact outside the monorepo using synthetic, unspendable fixtures. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import * as btc from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const isolated = mkdtempSync(join(tmpdir(), 'pqweave-release-'));
const artifact = join(isolated, 'artifact');
cpSync(join(root, 'releases/bitcoin/site/dist'), artifact, {
  recursive: true,
  verbatimSymlinks: true,
});
const manifest = JSON.parse(readFileSync(join(artifact, 'release-manifest.json')));
assert.equal(manifest.format, 'pqweave-bitcoin-release');
const pub = secp256k1.getPublicKey(new Uint8Array(32).fill(7), true);
const payment = btc.p2wpkh(pub);
const destination = btc.p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true)).address;
const funding = new btc.Transaction();
funding.addOutput({ script: payment.script, amount: 1_000_000n });
funding.addInput({
  txid: new Uint8Array(32),
  index: 0xffffffff,
  finalScriptSig: Uint8Array.of(1, 1),
});
const utxo = { txid: funding.id, vout: 0, value: 1_000_000, status: { confirmed: true } };
const zeroStats = { funded_txo_sum: 0, spent_txo_sum: 0, spent_txo_count: 0, tx_count: 0 };
let mode = 'valid',
  requests = 0;
const indexer = createServer((req, res) => {
  requests++;
  res.setHeader('content-type', 'application/json');
  if (mode === 'invalid') return res.end('{}');
  if (req.url.endsWith('/utxo')) return res.end(JSON.stringify([utxo]));
  if (req.url.endsWith('/hex')) {
    res.setHeader('content-type', 'text/plain');
    return res.end(hex.encode(funding.toBytes(true, false)));
  }
  if (req.url.endsWith('/fee-estimates')) return res.end(JSON.stringify({ 1: 5, 3: 3, 6: 2 }));
  return res.end(
    JSON.stringify({
      chain_stats: zeroStats,
      ...(mode === 'missing-mempool' ? {} : { mempool_stats: zeroStats }),
    }),
  );
});
let app;
try {
  indexer.listen(0, '127.0.0.1');
  await once(indexer, 'listening');
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((r) => portProbe.close(r));
  const upstream = `http://127.0.0.1:${indexer.address().port}`;
  app = spawn(process.execPath, ['server.js'], {
    cwd: artifact,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      BITCOIN_ESPLORA_URL: upstream,
      BITCOIN_TESTNET_ESPLORA_URL: upstream,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  app.stdout.on('data', (d) => {
    logs += d;
  });
  app.stderr.on('data', (d) => {
    logs += d;
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (ready || app.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(ready, `Artifact did not boot independently: ${logs}`);
  for (const path of [
    '/',
    '/protect/bitcoin',
    '/bitcoin/research',
    '/exposure/bitcoin',
    '/security',
  ]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    const html = await res.text();
    assert.ok(
      !/href="\/(migrate|start|attest|partners|kit|protect\/solana|protect\/stellar)/.test(html),
      `${path} links to an excluded route`,
    );
    for (const [, asset] of html.matchAll(/(?:src|href)="([^\"]*\/_next\/static\/[^\"]+)"/g)) {
      assert.equal(
        (await fetch(new URL(asset.replaceAll('&amp;', '&'), base))).status,
        200,
        `Missing static asset ${asset}`,
      );
    }
  }
  for (const path of [
    '/migrate',
    '/start',
    '/attest',
    '/partners',
    '/kit',
    '/protect/solana',
    '/protect/stellar',
    '/api/kit',
    '/api/partner',
  ]) {
    assert.equal((await fetch(base + path)).status, 404, `Legacy route ${path} must not ship`);
  }
  for (const query of [
    `op=utxos&address=${payment.address}`,
    'op=fees',
    `op=txhex&txid=${funding.id}`,
    `op=destcheck&address=${destination}`,
  ]) {
    const res = await fetch(`${base}/api/btc?${query}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    await res.json();
  }
  const scan = await fetch(`${base}/api/scan?chain=bitcoin&address=${payment.address}`);
  assert.equal(scan.status, 200);
  const report = await scan.json();
  assert.equal(report.kind, 'utxo');
  assert.equal(report.balanceSats, '0');
  const before = requests;
  assert.equal((await fetch(`${base}/api/scan?chain=ethereum&address=0x00`)).status, 400);
  assert.equal((await fetch(`${base}/api/btc?op=fees&network=ethereum`)).status, 400);
  assert.equal((await fetch(`${base}/api/btc/esplora/not-allowed`)).status, 400);
  assert.equal(
    (await fetch(`${base}/api/btc`, { method: 'POST', body: '{"op":"broadcast"}' })).status,
    405,
  );
  assert.equal(requests, before, 'Rejected requests must not reach indexer');
  mode = 'invalid';
  assert.equal((await fetch(`${base}/api/btc?op=utxos&address=${payment.address}`)).status, 502);
  assert.equal((await fetch(`${base}/api/btc/esplora/address/${payment.address}`)).status, 502);
  mode = 'missing-mempool';
  const check = await (await fetch(`${base}/api/btc?op=destcheck&address=${destination}`)).json();
  assert.equal(check.check.verdict, 'warn');
  console.log(
    'PASS isolated artifact: standalone boot, 5 pages and assets, 9 excluded legacy routes, security headers, private indexer APIs, malformed data and broadcast refusal',
  );
} finally {
  if (app && app.exitCode === null) {
    app.kill('SIGTERM');
    await Promise.race([once(app, 'exit'), delay(5000)]);
  }
  if (app && app.exitCode === null) {
    app.kill('SIGKILL');
    await once(app, 'exit');
  }
  await new Promise((r) => indexer.close(r));
  rmSync(isolated, { recursive: true, force: true });
}
