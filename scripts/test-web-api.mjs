/** Test the built public HTTP boundary without contacting RPCs or using wallet keys. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const require = createRequire(import.meta.url);
const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next', { paths: [web] }),
    'start',
    '-H',
    '127.0.0.1',
    '-p',
    String(port),
  ],
  { cwd: web, stdio: ['ignore', 'pipe', 'pipe'] },
);
child.stdout.resume();
child.stderr.resume();
let startupError;
child.on('error', (error) => (startupError = error));
const base = `http://127.0.0.1:${port}`;
const get = (path, init) => fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
let assertions = 0;
const check = (a, b) => {
  assert.deepEqual(a, b);
  assertions++;
};
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error('Website exited before starting');
    try {
      const response = await get('/ethereum');
      ready = response.ok;
      await response.body?.cancel();
      if (ready) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, 'Website did not start');
  const address = `0x${'11'.repeat(20)}`;
  for (const chain of [
    'toString',
    'constructor',
    '__proto__',
    'hasOwnProperty',
    'valueOf',
    'prototype',
    'unknown',
    'https://127.0.0.1',
  ]) {
    const response = await get(`/api/scan?chain=${encodeURIComponent(chain)}&address=${address}`);
    check(response.status, 400);
    check(typeof (await response.json()).error, 'string');
  }
  for (const chain of ['ethereum', 'bitcoin', 'evm-all']) {
    for (const value of ['', 'invalid', '0x1234']) {
      const response = await get(`/api/scan?chain=${chain}&address=${value}`);
      check(response.status, 400);
      await response.body?.cancel();
    }
  }
  const post = await get('/api/scan', { method: 'POST' });
  check(post.status, 405);
  await post.body?.cancel();
  for (const path of ['/ethereum', '/protect/bitcoin', '/security', '/migrate']) {
    const response = await get(path);
    check(response.status, 200);
    check(response.headers.get('x-content-type-options'), 'nosniff');
    const html = await response.text();
    assert(html.includes('<html'));
    assertions++;
  }
  console.log(
    `PASS web HTTP: ${assertions} assertions; prototype names, invalid addresses, method restrictions, BTC/ETH pages and security headers`,
  );
} finally {
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    await new Promise((resolve) => child.once('exit', resolve));
    clearTimeout(timer);
  }
}
