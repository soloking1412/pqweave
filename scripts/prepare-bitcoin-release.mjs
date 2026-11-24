/** Build an allowlisted Bitcoin source tree; never copy environment files or legacy routes. */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'releases/bitcoin');
const target = join(release, 'site');
mkdirSync(target, { recursive: true });
// Only these generated directories are replaced. Dependencies and build cache may be reused.
for (const name of ['app', 'components', 'lib'])
  rmSync(join(target, name), { recursive: true, force: true });
const manifest = { format: 'pqweave-bitcoin-release', version: 1, files: {} };
function copy(source, destination) {
  const to = join(target, destination);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, source), to);
  manifest.files[destination] = {
    source,
    sha256: createHash('sha256').update(readFileSync(to)).digest('hex'),
  };
}
const web = [
  'app/globals.css',
  'app/icon.svg',
  'app/bitcoin/research/page.tsx',
  'app/exposure/bitcoin/page.tsx',
  'app/protect/bitcoin/page.tsx',
  'app/protect/bitcoin/evacuation-client.tsx',
  'app/protect/bitcoin/checklist-client.tsx',
  'app/protect/bitcoin/wallet-scan-client.tsx',
  'app/api/btc/route.ts',
  'app/api/btc/esplora/[...path]/route.ts',
  'components/site-header.tsx',
  'components/site-footer.tsx',
  'components/logo.tsx',
  'lib/bitcoin-indexer.ts',
  'postcss.config.mjs',
];
for (const file of web) copy(`apps/web/${file}`, file);
for (const file of readdirSync(join(root, 'packages/sdk/src/bitcoin')).filter((f) =>
  f.endsWith('.ts'),
)) {
  copy(`packages/sdk/src/bitcoin/${file}`, `lib/bitcoin/${file}`);
  // The SDK uses Node ESM .js specifiers. Emit matching runtime files from the
  // identical TypeScript source; Next still typechecks the copied .ts files.
  const source = `packages/sdk/src/bitcoin/${file}`;
  const runtime = `lib/bitcoin/${file.replace(/\.ts$/, '.js')}`;
  const output = ts.transpileModule(readFileSync(join(root, source), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    fileName: file,
  }).outputText;
  writeFileSync(join(target, runtime), output);
  manifest.files[runtime] = {
    source,
    compiler: `typescript@${ts.version}`,
    sha256: createHash('sha256').update(output).digest('hex'),
  };
}
for (const file of [
  'app/page.tsx',
  'app/layout.tsx',
  'app/api/scan/route.ts',
  'app/security/page.tsx',
  'components/site-header.tsx',
  'components/site-footer.tsx',
])
  copy(`releases/bitcoin/overrides/${file}`, file);
for (const file of ['package.json', 'tsconfig.json', 'next.config.mjs', 'pnpm-workspace.yaml'])
  copy(`releases/bitcoin/${file}`, file);
if (existsSync(join(release, 'pnpm-lock.yaml')))
  copy('releases/bitcoin/pnpm-lock.yaml', 'pnpm-lock.yaml');
copy('LICENSE', 'LICENSE');
writeFileSync(join(target, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Prepared ${Object.keys(manifest.files).length} allowlisted files in ${relative(root, target)}. No secrets or legacy routes copied.`,
);
