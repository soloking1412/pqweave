#!/usr/bin/env node
// Writes the deployed contract addresses into apps/web/.env.local, so the web
// app can use a reviewed Sepolia deployment manifest. Usage:
//   node script/write-web-env.mjs [chainId] [--dry]
// chainId defaults to 11155111 (Ethereum Sepolia).
//
// Prefers the canonical deployments/<chainId>.json the Deploy script writes
// (it always contains every address, even ones skipped as already-deployed).
// Falls back to parsing the latest broadcast for older deploys.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractsRoot = resolve(scriptDir, '..');
const repoRoot = resolve(contractsRoot, '../..');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const chainId = args.find((a) => /^\d+$/.test(a)) ?? '11155111';

const MAINNET_IDS = new Set(['1', '8453', '42161', '10', '137']);
const stage = MAINNET_IDS.has(chainId) ? 'mainnet' : 'testnet';

/** Resolve the six addresses the web app needs, preferring the deployments JSON. */
function resolveAddresses() {
  const deploymentPath = resolve(contractsRoot, `deployments/${chainId}.json`);
  if (existsSync(deploymentPath)) {
    const d = JSON.parse(readFileSync(deploymentPath, 'utf8'));
    return {
      verifier: d.verifier,
      factory: d.factory,
      batchExecutor: d.batchExecutor,
      forwarder: d.forwarder,
      accountImpl: d.accountImpl,
      attestation: d.attestation,
      source: `deployments/${chainId}.json`,
    };
  }

  // Fallback: parse the latest broadcast (only contains newly-deployed contracts).
  const broadcastPath = resolve(contractsRoot, `broadcast/Deploy.s.sol/${chainId}/run-latest.json`);
  if (!existsSync(broadcastPath)) {
    console.error(`No deployments/${chainId}.json and no broadcast at ${broadcastPath}`);
    console.error('Run the deploy first (with --broadcast) for this chain id.');
    process.exit(1);
  }
  const broadcast = JSON.parse(readFileSync(broadcastPath, 'utf8'));
  const deploys = (broadcast.transactions ?? []).filter(
    (t) => (t.transactionType === 'CREATE2' || t.transactionType === 'CREATE') && t.contractAddress,
  );
  const find = (re) => deploys.find((t) => re.test(t.contractName ?? ''))?.contractAddress;
  return {
    verifier: find(/Verifier$/),
    factory: find(/Factory$/),
    batchExecutor: find(/BatchExecutor$/),
    forwarder: find(/Forwarder$/),
    accountImpl: find(/Account$/),
    attestation: find(/Attestation$/),
    source: 'broadcast/run-latest.json',
  };
}

const addrs = resolveAddresses();

const missing = [
  ['verifier', addrs.verifier],
  ['factory', addrs.factory],
  ['batchExecutor', addrs.batchExecutor],
  ['forwarder', addrs.forwarder],
  ['accountImpl', addrs.accountImpl],
  ['attestation', addrs.attestation],
].filter(([, v]) => !v);
if (missing.length) {
  console.error(`Could not resolve addresses for: ${missing.map(([k]) => k).join(', ')}`);
  console.error(`Source: ${addrs.source}`);
  process.exit(1);
}

// Addresses alone are not execution approval. Hashes must be supplied through
// a separately reviewed manifest, never learned from the RPC being checked.
const manifestPath = resolve(contractsRoot, `deployments/${chainId}.reviewed.json`);
if (!existsSync(manifestPath)) throw new Error(`Missing reviewed manifest: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== 1 || manifest.chainId !== Number(chainId))
  throw new Error('Manifest network/version mismatch');
for (const role of ['factory', 'verifier', 'batchExecutor', 'forwarder', 'accountImpl']) {
  if (manifest.addresses?.[role]?.toLowerCase() !== addrs[role]?.toLowerCase())
    throw new Error(`Manifest address mismatch: ${role}`);
}
for (const role of [
  'factory',
  'verifier',
  'batchExecutor',
  'account',
  'entryPoint',
  'forwarder',
  'accountImpl',
]) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(manifest.codeHashes?.[role]))
    throw new Error(`Missing runtime code hash: ${role}`);
}
if (manifest.addresses.entryPoint?.toLowerCase() !== '0x0000000071727de22e5e9d8baf0edac6f37da032')
  throw new Error('Unsupported EntryPoint');
const updates = {
  NEXT_PUBLIC_DEPLOYMENT_CHAIN_ID: chainId,
  NEXT_PUBLIC_FACTORY_CODE_HASH: manifest.codeHashes.factory,
  NEXT_PUBLIC_VERIFIER_CODE_HASH: manifest.codeHashes.verifier,
  NEXT_PUBLIC_BATCH_EXECUTOR_CODE_HASH: manifest.codeHashes.batchExecutor,
  NEXT_PUBLIC_ACCOUNT_CODE_HASH: manifest.codeHashes.account,
  NEXT_PUBLIC_ENTRYPOINT_CODE_HASH: manifest.codeHashes.entryPoint,
  NEXT_PUBLIC_FORWARDER_CODE_HASH: manifest.codeHashes.forwarder,
  NEXT_PUBLIC_ACCOUNT_IMPL_CODE_HASH: manifest.codeHashes.accountImpl,
  NEXT_PUBLIC_VERIFIER_ADDRESS: addrs.verifier,
  NEXT_PUBLIC_FACTORY_ADDRESS: addrs.factory,
  NEXT_PUBLIC_BATCH_EXECUTOR_ADDRESS: addrs.batchExecutor,
  NEXT_PUBLIC_FORWARDER_ADDRESS: addrs.forwarder,
  NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS: addrs.accountImpl,
  NEXT_PUBLIC_ATTESTATION_ADDRESS: addrs.attestation,
  NEXT_PUBLIC_DEPLOYMENT_STAGE: stage,
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
const output = next
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/^\n+/, '');
const finalOutput = output.endsWith('\n') ? output : `${output}\n`;

console.log(`Chain ${chainId} (${stage}) — from ${addrs.source}`);
for (const [key, value] of Object.entries(updates)) console.log(`  ${key}=${value}`);

if (dry) {
  console.log('\n--dry: not writing. Target:', envPath);
} else {
  writeFileSync(envPath, finalOutput);
  console.log(`\nWrote ${envPath}`);
  console.log('Restart the web dev server to pick it up.');
}
