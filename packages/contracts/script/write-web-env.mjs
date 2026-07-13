#!/usr/bin/env node
// Reads the latest Foundry broadcast for a Deploy run and writes the deployed
// contract addresses into apps/web/.env.local, so the web app flips from
// "preview" to live without any hand-copying. Usage:
//   node script/write-web-env.mjs [chainId] [--dry]
// chainId defaults to 84532 (Base Sepolia).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractsRoot = resolve(scriptDir, '..');
const repoRoot = resolve(contractsRoot, '../..');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const chainId = args.find((a) => /^\d+$/.test(a)) ?? '84532';

const MAINNET_IDS = new Set(['1', '8453', '42161', '10', '137']);
const stage = MAINNET_IDS.has(chainId) ? 'mainnet' : 'testnet';

const broadcastPath = resolve(
  contractsRoot,
  `broadcast/Deploy.s.sol/${chainId}/run-latest.json`,
);
if (!existsSync(broadcastPath)) {
  console.error(`No broadcast found at ${broadcastPath}`);
  console.error('Run the deploy first (with --broadcast) for this chain id.');
  process.exit(1);
}

const broadcast = JSON.parse(readFileSync(broadcastPath, 'utf8'));
const deploys = (broadcast.transactions ?? []).filter(
  (t) => (t.transactionType === 'CREATE2' || t.transactionType === 'CREATE') && t.contractAddress,
);

// Match by role so this survives contract renames.
const find = (re) => deploys.find((t) => re.test(t.contractName ?? ''))?.contractAddress;
const verifier = find(/Verifier$/);
const factory = find(/Factory$/);
const batchExecutor = find(/BatchExecutor$/);
const forwarder = find(/Forwarder$/);
const accountImpl = find(/Account$/);
const attestation = find(/Attestation$/);

const missing = [
  ['verifier', verifier],
  ['factory', factory],
  ['batchExecutor', batchExecutor],
  ['forwarder', forwarder],
  ['accountImpl', accountImpl],
  ['attestation', attestation],
].filter(([, v]) => !v);
if (missing.length) {
  console.error(`Could not find addresses for: ${missing.map(([k]) => k).join(', ')}`);
  console.error('Deployed contracts in broadcast:', deploys.map((t) => t.contractName).join(', '));
  process.exit(1);
}

const updates = {
  NEXT_PUBLIC_VERIFIER_ADDRESS: verifier,
  NEXT_PUBLIC_FACTORY_ADDRESS: factory,
  NEXT_PUBLIC_BATCH_EXECUTOR_ADDRESS: batchExecutor,
  NEXT_PUBLIC_FORWARDER_ADDRESS: forwarder,
  NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS: accountImpl,
  NEXT_PUBLIC_ATTESTATION_ADDRESS: attestation,
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
const output = next.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
const finalOutput = output.endsWith('\n') ? output : `${output}\n`;

console.log(`Chain ${chainId} (${stage})`);
for (const [key, value] of Object.entries(updates)) console.log(`  ${key}=${value}`);

if (dry) {
  console.log('\n--dry: not writing. Target:', envPath);
} else {
  writeFileSync(envPath, finalOutput);
  console.log(`\nWrote ${envPath}`);
  console.log('Restart the web dev server to pick it up.');
}
