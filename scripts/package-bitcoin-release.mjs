import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'releases/bitcoin/site');
const manifest = JSON.parse(readFileSync(join(site, 'release-manifest.json')));
for (const [path, entry] of Object.entries(manifest.files)) {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(join(site, path)))
      .digest('hex'),
    entry.sha256,
    `Release source changed after preparation: ${path}`,
  );
}
const artifact = join(site, 'dist');
assert.ok(existsSync(join(site, '.next/standalone/server.js')), 'Standalone server was not built');
rmSync(artifact, { recursive: true, force: true });
cpSync(join(site, '.next/standalone'), artifact, { recursive: true, verbatimSymlinks: true });
mkdirSync(join(artifact, '.next'), { recursive: true });
cpSync(join(site, '.next/static'), join(artifact, '.next/static'), { recursive: true });
for (const file of ['release-manifest.json', 'pnpm-lock.yaml', 'LICENSE'])
  cpSync(join(site, file), join(artifact, file));
function check(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    assert.ok(!entry.name.startsWith('.env'), 'Environment file must not be packaged');
    const child = join(path, entry.name);
    if (entry.isSymbolicLink())
      assert.ok(
        realpathSync(child).startsWith(artifact + '/'),
        `Artifact symlink escapes release: ${child}`,
      );
    if (entry.isDirectory()) check(child);
    else if (entry.name === 'package.json' && entry.isFile()) {
      const { name = '' } = JSON.parse(readFileSync(child));
      assert.ok(
        !/^(wagmi|viem|@walletconnect\/|@stellar\/|@pqweave\/sdk)/.test(name),
        `Legacy dependency in artifact: ${name}`,
      );
    }
  }
}
check(artifact);
console.log(`Packaged isolated Bitcoin server: ${artifact}`);
