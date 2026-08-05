import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, toHex } from 'viem';
import { createWinternitzKey, signWinternitz, verifyWinternitz } from '../dist/pqc/index.js';

// Regenerates the cross-runtime fixture asserted by the contracts'
// CrossCompat test: a signature produced here must verify on-chain.
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../contracts/test/vectors/winternitz.json');

const masterSeed = keccak256(toHex('cross-runtime-winternitz'));
const message = keccak256(toHex('authorize-1.5-eth-transfer'));
const leafIndex = 2;

const key = createWinternitzKey(masterSeed, 4);
const signature = signWinternitz(key, message, leafIndex);
if (!verifyWinternitz(key.root, message, signature)) throw new Error('self-verification failed');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify({ root: key.root, message, leafIndex, signature }, null, 2)}\n`,
);
console.log(`wrote ${out} (${(signature.length - 2) / 2} signature bytes)`);
