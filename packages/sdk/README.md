# @pqweave/sdk

Framework-agnostic SDK for post-quantum migration of EVM wallets. Runs in Node
and the browser.

## Modules

- **`@pqweave/sdk/scanner`** — detect quantum exposure for any EVM address
  (public-key recovery, risk scoring) and produce batch reports.
- **`@pqweave/sdk/pqc`** — post-quantum keys. NIST schemes (ML-DSA, SLH-DSA)
  via `@noble/post-quantum`, plus the hash-based Lamport+Merkle scheme that
  matches the on-chain verifier byte for byte.
- **`@pqweave/sdk/account`** — calldata builders, hybrid (ECDSA + PQC)
  signatures, EIP-7702 delegation, and counterfactual address prediction.
- **`@pqweave/sdk/migration`** — asset discovery and one-transaction sweeps.
- **`@pqweave/sdk/chains`** — multi-chain clients for the major EVM networks.

## Examples

Scan an address:

```ts
import { scanAddress } from '@pqweave/sdk/scanner';

const report = await scanAddress('ethereum', '0xabc…');
console.log(report.level, report.score, report.reasons);
```

Create a hash-based signer and sign a gated operation. The signer hands out a
strictly increasing one-time leaf index, so a Lamport key can never be reused —
always sign through it and persist its state after each signature:

```ts
import { HashSigSigner } from '@pqweave/sdk/pqc';
import { buildHybridSignature } from '@pqweave/sdk/account';

const hashSigner = HashSigSigner.create(masterSeed); // hashSigner.root is the on-chain public key

const signature = await buildHybridSignature({
  signer: walletAccount,
  userOpHash,
  hashSigner, // advances the leaf index automatically
});

persist(hashSigner.serialize()); // store so leaves are never reused across sessions
```

## Develop

```bash
pnpm test        # vitest
pnpm build       # tsup → dist
pnpm gen:vector  # regenerate the cross-runtime fixture (run after build)
```

The `gen:vector` script produces a signature that the contracts' CrossCompat
test verifies on-chain, guaranteeing the SDK and the verifier stay in lockstep.
