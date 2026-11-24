import type { Metadata } from 'next';
import { KitClient } from './kit-client';

export const metadata: Metadata = {
  title: 'Migration kit — PQWeave',
  description:
    'Scan an address and get a chain-specific post-quantum migration readiness plan. No wallet connection or private key required.',
};

export default async function KitPage({
  searchParams,
}: {
  searchParams: Promise<{ chain?: string; address?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
      <div className="tabular text-xs uppercase tracking-widest text-accent">
        PQWeave / migration kit
      </div>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        One place to plan the move.
        <span className="block text-ink-dim">The right route for each chain.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-ink-2">
        Start with a public address. We check what is visible, choose the current chain-supported
        route, and show the checks required before signing. Your wallet keeps the keys.
      </p>
      <KitClient initialChain={params.chain} initialAddress={params.address} />
    </main>
  );
}
