import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/scanner/index.ts',
    'src/pqc/index.ts',
    'src/account/index.ts',
    'src/migration/index.ts',
    'src/bitcoin/index.ts',
    'src/solana/index.ts',
    'src/cosmos/index.ts',
    'src/xrp/index.ts',
    'src/cardano/index.ts',
    'src/algorand/index.ts',
    'src/stellar/index.ts',
    'src/near/index.ts',
    'src/aptos/index.ts',
    'src/chains/index.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
