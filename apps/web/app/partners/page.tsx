import type { Metadata } from 'next';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';
import { PartnerForm } from './partner-form';

export const metadata: Metadata = {
  title: 'Partners — PQWeave',
  description:
    'Integrate quantum-safe exposure detection and migration into your wallet, exchange, or custody platform.',
};

const VALUE = [
  {
    title: 'Scanner SDK & API',
    body: `Drop quantum-exposure detection into your product across ${LIVE_CHAIN_COUNT} chains. One call per address.`,
  },
  {
    title: 'One-click migration',
    body: 'Offer your EVM users a single-transaction sweep into a post-quantum account.',
  },
  {
    title: 'Shared infrastructure',
    body: 'Deterministic contracts at the same address on every chain — no per-partner deployment. Independent audit in progress before mainnet.',
  },
];

export default function PartnersPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-white/5 px-3 py-1 text-xs text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Onboarding launch partners
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
          Protect your users before Q-Day
        </h1>
        <p className="mt-3 text-zinc-400">
          Wallets, exchanges, and custodians: integrate PQWeave&apos;s detection and migration to
          give your users a clear path to post-quantum safety. Tell us what you&apos;re building and
          we&apos;ll set you up.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-5">
          {VALUE.map((item) => (
            <li key={item.title} className="rounded-panel border border-rule bg-panel p-5">
              <h2 className="text-base font-semibold text-white">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="rounded-panel border border-rule bg-panel p-6 sm:p-8">
          <PartnerForm />
        </div>
      </div>
    </div>
  );
}
