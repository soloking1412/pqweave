import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion';
import { BitcoinChecklistClient } from './checklist-client';
import { EvacuationClient } from './evacuation-client';
import { WalletScanClient } from './wallet-scan-client';

export const metadata: Metadata = {
  title: 'Reduce Bitcoin quantum exposure (transitional) — PQWeave',
  description:
    'Bitcoin cannot be made quantum-safe at the app layer — that needs a protocol upgrade (BIP-360). The one thing you can do today is transitional: keep your public key hidden by moving to a fresh, never-used address.',
};

const STEPS = [
  {
    n: 1,
    title: 'Create a brand-new, never-used address',
    body: 'In your own wallet, generate a fresh native SegWit address (starts with bc1q). Do not reuse an old one. Avoid Taproot (bc1p) here — Taproot key-path spends reveal the public key in the output, which defeats the purpose.',
  },
  {
    n: 2,
    title: 'Move your funds to it in one transaction',
    body: 'Consolidate your balance into the new address. PQWeave never touches your keys — you sign this in your own wallet. Until you spend from the new address, only its hash is public, so the key stays hidden.',
  },
  {
    n: 3,
    title: 'Treat every address as one-time',
    body: 'Each spend re-reveals the public key behind that address. Receive into fresh addresses and avoid address reuse, so a revealed key never guards remaining funds.',
  },
];

const LIMITS = [
  'This is transitional, not quantum-safe. The moment you spend from the new address, its public key is revealed again.',
  'A sufficiently fast quantum attacker could still race your spend — seeing the key in the mempool and trying to forge a conflicting transaction before yours confirms.',
  'There is no post-quantum signature protecting Bitcoin today. This only defers exposure; it does not remove it.',
  'The permanent fix is a Bitcoin protocol upgrade — e.g. BIP-360 (Pay-to-Quantum-Resistant-Hash) — which is consensus-level and not something any app can ship.',
];

export default function BitcoinProtectPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Transitional protection — not quantum-safe
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Reduce your Bitcoin quantum exposure
      </h1>
      <p className="mt-3 text-zinc-400">
        We&apos;ll be straight with you: Bitcoin cannot be made quantum-safe at the application
        layer. It has no smart-contract accounts to enforce a post-quantum signature, so a real fix
        needs a protocol upgrade. What you <span className="text-zinc-200">can</span> do today is
        keep your public key hidden for as long as possible. This is risk reduction, not a cure.
      </p>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Why this works (a little)</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          A Bitcoin address is a hash of your public key. The key itself stays hidden until you
          spend from the address — that&apos;s when the signature, and the key, become public and
          harvestable. So funds sitting in a fresh, never-spent address are not yet exposed. Moving
          there buys time; it does not make the coins quantum-proof.
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <WalletScanClient />
      </Reveal>

      <Reveal className="mt-10">
        <EvacuationClient />
      </Reveal>

      <Reveal className="mt-10">
        <BitcoinChecklistClient />
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">The steps, in detail</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-4 rounded-panel border border-rule bg-panel p-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                {step.n}
              </span>
              <div>
                <h3 className="text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">What this does not do</h2>
        <ul className="mt-4 space-y-2.5">
          {LIMITS.map((limit) => (
            <li
              key={limit}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-300"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              {limit}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-zinc-500">
          The same transitional approach applies to other first-spend chains (Litecoin, Dogecoin,
          and similar). Only EVM chains support a true quantum-safe migration today, because only
          they have the account layer to enforce a post-quantum signature.
        </p>
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
