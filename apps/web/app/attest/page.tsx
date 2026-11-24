import type { Metadata } from 'next';
import { Providers } from '@/app/providers';
import { AttestClient } from './attest-client';

export const metadata: Metadata = {
  title: 'Attest a post-quantum key for Bitcoin — PQWeave',
  description:
    'Bind your Bitcoin address to a post-quantum key and anchor the binding on-chain — an open, verifiable registry, not a proprietary one. One post-quantum key across Bitcoin, EVM, and Solana.',
};

export default function AttestPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-ink/5 px-3 py-1 text-xs text-ink-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Cross-chain attestation
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Bind a post-quantum key to your Bitcoin address
      </h1>
      <p className="mt-3 text-ink-dim">
        Generate a post-quantum key, sign a binding message with your Bitcoin wallet, and anchor the
        pair on-chain. It is a public, timestamped, verifiable record that both are yours — an open
        registry, not a company&apos;s private one. The same key already secures a PQWeave EVM
        account and Solana vault, so this is one post-quantum identity across all three. It records
        intent and ownership; it does not by itself make your Bitcoin quantum-safe.
      </p>
      <div className="mt-8">
        <Providers>
          <AttestClient />
        </Providers>
      </div>
    </div>
  );
}
