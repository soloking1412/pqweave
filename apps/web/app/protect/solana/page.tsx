import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion';

export const metadata: Metadata = {
  title: 'Solana quantum exposure — what can and cannot be fixed — PQWeave',
  description:
    'A Solana address is the Ed25519 public key itself, so it is exposed from day one and no wallet-level fix exists. PQWeave built a post-quantum vault program — custody you move funds into, not a wallet upgrade. Unaudited, not yet deployed.',
};

const STEPS = [
  {
    n: 1,
    title: 'Generate a post-quantum key',
    body: 'A Lamport one-time-signature key with a Merkle root, generated from fresh randomness and saved as a password-encrypted keystore. The same key construction PQWeave uses for EVM accounts — one key can back both.',
  },
  {
    n: 2,
    title: 'Sweep SOL into the vault',
    body: 'The vault is a program-derived account bound to your post-quantum key. Your normal wallet signs the deposit — the only time your exposed Ed25519 key is involved. After that, it has no authority over the vaulted funds.',
  },
  {
    n: 3,
    title: 'Withdraw with a hash-based signature',
    body: 'A withdrawal must carry a Lamport signature (~24 KB, staged across several transactions because Solana caps one at 1232 bytes). Each signature uses a one-time key leaf that the program marks used on-chain, so it can never be replayed.',
  },
];

const LIMITS = [
  'Your everyday wallet stays quantum-exposed forever. A Solana address is the public key; nothing can hide it, and moving to a fresh address just exposes a different key.',
  'Only funds inside the vault are protected. Everything still sitting at your wallet address is as exposed as before.',
  'The sweep transaction itself is signed by your exposed Ed25519 key. Safe today, but a quantum attacker present at sweep time could in principle race it — the same caveat as the Bitcoin transitional flow.',
  'The vault is deployed to devnet for testing only. It is not on mainnet and it is not audited. Do not put real funds in it.',
  'Losing the post-quantum seed means losing the vault: there is deliberately no Ed25519 fallback, because a fallback would be the quantum hole.',
];

export default function SolanaProtectPage() {
  const solanaProgramId = process.env.NEXT_PUBLIC_SOLANA_VAULT_PROGRAM_ID ?? null;
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        Vault custody — not a wallet fix
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Your Solana wallet can&apos;t be made quantum-safe. Here&apos;s what can.
      </h1>
      <p className="mt-3 text-zinc-400">
        We&apos;ll be straight with you: a Solana address <span className="text-zinc-200">is</span>{' '}
        the Ed25519 public key — exposed from the moment the account exists. There is no first-spend
        grace period to preserve, and no account abstraction to swap in a post-quantum signature. No
        app can change that; it would take a protocol upgrade. What{' '}
        <span className="text-zinc-200">can</span> exist is a vault: a program-controlled account
        that only releases funds against a post-quantum signature.
      </p>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Why Solana is different</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          On EVM chains, PQWeave migrates your account in place: EIP-7702 delegation lets contract
          code enforce a hash-based signature on the address you already have. Bitcoin at least
          hides the key behind a hash until you spend. Solana has neither property — validators
          verify Ed25519 at the protocol level, and the address itself broadcasts the key. That is
          why our scanner reports Solana migration capability as{' '}
          <span className="font-mono text-zinc-300">none</span>, and why anyone selling a
          &ldquo;quantum-safe Solana wallet&rdquo; today is overclaiming.
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">The vault, step by step</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-4 rounded-panel border border-rule bg-panel p-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                {step.n}
              </span>
              <div>
                <h3 className="text-[1rem] font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Where this stands today</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          The vault program and its client SDK are built and cross-verified: instruction encoding,
          vault derivation, the withdrawal digest, and signature staging match byte-for-byte between
          the TypeScript SDK and the on-chain Rust, the one-time-leaf guard is enforced on-chain,
          and the full initialize → deposit → withdraw → replay-rejected lifecycle passes through
          the real Solana VM. It is now <span className="text-zinc-200">deployed to devnet</span>{' '}
          for testing. It has <span className="text-zinc-200">not</span> been deployed to mainnet,
          and it has <span className="text-zinc-200">not</span> been audited. Do not put real funds
          in it.
        </p>
        {solanaProgramId && (
          <div className="mt-4 rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Devnet program id</div>
            <a
              href={`https://explorer.solana.com/address/${solanaProgramId}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all font-mono text-xs text-accent hover:underline"
            >
              {solanaProgramId}
            </a>
          </div>
        )}
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">What this does not do</h2>
        <ul className="mt-4 space-y-2.5">
          {LIMITS.map((limit) => (
            <li
              key={limit}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-300"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
              {limit}
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/scan"
          className="rounded-control bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright"
        >
          Scan another address
        </Link>
        <Link
          href="/migrate"
          className="rounded-control border border-rule-strong px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
        >
          Quantum-safe migration (EVM)
        </Link>
      </Reveal>
    </div>
  );
}
