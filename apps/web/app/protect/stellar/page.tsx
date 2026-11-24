import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion';
import { getStellarVault } from '@/lib/contracts';
import { StellarVaultClient } from './stellar-vault-client';

export const metadata: Metadata = {
  title: 'Stellar quantum exposure — what can and cannot be fixed — PQWeave',
  description:
    'A Stellar account is the Ed25519 public key itself, so it is exposed from day one and no wallet-level fix exists. PQWeave built a post-quantum vault on Soroban, custody you sweep funds into, gated by a hash-based one-time signature. Unaudited, testnet only.',
};

const STEPS = [
  {
    n: 1,
    title: 'Generate a post-quantum key',
    body: 'A Lamport one-time-signature key with a Merkle root, generated from fresh randomness and saved as a password-encrypted keystore. The same key construction PQWeave uses for EVM and Solana, one key can back all three.',
  },
  {
    n: 2,
    title: 'Deploy your vault and sweep XLM in',
    body: 'The vault is a Soroban contract account bound to your post-quantum key. Your normal Stellar wallet signs the deploy and the deposit, the only time your exposed Ed25519 key is involved. After that, it has no authority over the vaulted funds.',
  },
  {
    n: 3,
    title: 'Withdraw with a hash-based signature',
    body: 'A withdrawal is authorized by Soroban’s __check_auth against a Lamport signature over the call. Each signature uses a one-time key leaf the contract marks used on-chain, so it can never be replayed. The whole ~24 KB signature fits in one transaction.',
  },
];

const LIMITS = [
  'Your everyday wallet stays quantum-exposed forever. A Stellar address is the public key; nothing can hide it, and moving to a fresh account just exposes a different key.',
  'Only funds inside the vault are protected. Everything still sitting at your account is as exposed as before.',
  'The sweep transaction itself is signed by your exposed Ed25519 key. Safe today, but a quantum attacker present at sweep time could in principle race it, the same caveat as every transitional flow.',
  'The vault is on testnet for evaluation only. It is not on mainnet (Stellar public network) and it is not audited. Do not put real funds in it.',
  'Losing the post-quantum seed means losing the vault: there is deliberately no Ed25519 fallback, because a fallback would be the quantum hole.',
];

export default function StellarProtectPage() {
  const vault = getStellarVault();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-note/30 bg-note/10 px-3 py-1 text-xs text-note">
        <span className="h-1.5 w-1.5 rounded-full bg-note" />
        Vault custody, not a wallet fix
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Your Stellar account can&apos;t be made quantum-safe. Here&apos;s what can.
      </h1>
      <p className="mt-3 text-ink-dim">
        We&apos;ll be straight with you: a Stellar account id (<span className="text-ink">G…</span>){' '}
        <span className="text-ink">is</span> the Ed25519 public key, exposed from the moment the
        account is funded. There is no first-spend grace period like Bitcoin, and setting the master
        key weight to zero doesn&apos;t help, because every classic signer is also an Ed25519 key
        written to the ledger. No app can change that; it would take a protocol upgrade. What{' '}
        <span className="text-ink">can</span> exist is a vault: a Soroban contract that only
        releases funds against a post-quantum signature.
      </p>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Why Stellar is the hardest case</h2>
        <p className="mt-3 leading-relaxed text-ink-dim">
          On EVM chains, PQWeave migrates your account in place: EIP-7702 lets contract code enforce
          a hash-based signature on the address you already have. Bitcoin at least hides the key
          behind a hash until you spend. Stellar has neither. The account id itself broadcasts the
          public key from day one. That is why our scanner reports Stellar migration capability as{' '}
          <span className="font-mono text-ink-2">none</span>, and why anyone selling a
          &ldquo;quantum-safe Stellar wallet&rdquo; today is overclaiming. The one advantage Stellar
          has is <span className="text-ink">Soroban</span>: real account abstraction (
          <span className="font-mono text-ink-2">__check_auth</span>) that lets a contract verify
          any signature scheme, including a post-quantum one, on-chain.
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">The vault, step by step</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-4 rounded-panel border border-rule bg-panel p-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-paper">
                {step.n}
              </span>
              <div>
                <h3 className="text-[1rem] font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal className="mt-10">
        <StellarVaultClient vault={vault} />
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Where this stands today</h2>
        <p className="mt-3 leading-relaxed text-ink-dim">
          The vault contract and its client are built and cross-verified: the Lamport+Merkle
          verifier matches the same canonical vector byte-for-byte as the EVM verifier and the
          Solana vault (so one key works on all three), the one-time-leaf guard is enforced inside{' '}
          <span className="font-mono text-ink-2">__check_auth</span>, a full verify costs about 3.2M
          of Soroban&apos;s 100M per-transaction instruction budget, and the deploy → read-state
          path is proven on Stellar testnet. It has <span className="text-ink">not</span> been
          deployed to mainnet, and it has <span className="text-ink">not</span> been audited. Do not
          put real funds in it.
        </p>
        {vault && (
          <div className="mt-4 rounded-lg border border-rule bg-well p-3">
            <div className="text-xs uppercase tracking-wide text-ink-dim">
              {vault.network} vault wasm hash
            </div>
            <a
              href={`${
                vault.network === 'mainnet' || vault.network === 'public'
                  ? 'https://stellar.expert/explorer/public'
                  : 'https://stellar.expert/explorer/testnet'
              }/contract/${vault.wasmHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all font-mono text-xs text-accent hover:underline"
            >
              {vault.wasmHash}
            </a>
          </div>
        )}
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">What this does not do</h2>
        <ul className="mt-4 space-y-2.5">
          {LIMITS.map((limit) => (
            <li key={limit} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-note" />
              {limit}
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/scan"
          className="rounded-control bg-brand px-5 py-3 text-sm font-medium text-paper transition hover:bg-brand-strong"
        >
          Scan another address
        </Link>
        <Link
          href="/migrate"
          className="rounded-control border border-rule-strong px-5 py-3 text-sm font-medium text-ink transition hover:bg-ink/5"
        >
          Quantum-safe migration (EVM)
        </Link>
      </Reveal>
    </div>
  );
}
