#!/usr/bin/env node
// Writes the Stellar vault deployment into apps/web/.env.local so the web app's
// /protect/stellar flow can deploy per-user instances from the uploaded wasm.
// Usage: node write-stellar-env.mjs [network] [--dry]   (network defaults to testnet)
//
// Reads packages/stellar-vault/deployments/<network>.json (written by deploy.sh).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const network = args.find((a) => !a.startsWith('--')) ?? 'testnet';

const deploymentPath = resolve(scriptDir, `deployments/${network}.json`);
if (!existsSync(deploymentPath)) {
  console.error(`No deployment at ${deploymentPath}. Run ./deploy.sh ${network} first.`);
  process.exit(1);
}
const d = JSON.parse(readFileSync(deploymentPath, 'utf8'));

const updates = {
  NEXT_PUBLIC_STELLAR_VAULT_WASM_HASH: d.wasmHash,
  NEXT_PUBLIC_STELLAR_NETWORK: d.network,
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: d.networkPassphrase,
  NEXT_PUBLIC_STELLAR_RPC_URL: d.rpcUrl,
};

const envPath = resolve(repoRoot, 'apps/web/.env.local');
const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const lines = existing ? existing.split('\n') : [];
const seen = new Set();
const next = lines.map((line) => {
  const m = line.match(/^([A-Z0-9_]+)=/);
  if (m && m[1] in updates) {
    seen.add(m[1]);
    return `${m[1]}=${updates[m[1]]}`;
  }
  return line;
});
for (const [key, value] of Object.entries(updates)) {
  if (!seen.has(key)) next.push(`${key}=${value}`);
}
const output = next.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
const finalOutput = output.endsWith('\n') ? output : `${output}\n`;

console.log(`Stellar ${network} — from deployments/${network}.json`);
for (const [key, value] of Object.entries(updates)) console.log(`  ${key}=${value}`);

if (dry) {
  console.log('\n--dry: not writing. Target:', envPath);
} else {
  writeFileSync(envPath, finalOutput);
  console.log(`\nWrote ${envPath}`);
  console.log('Restart the web dev server to pick it up.');
}
