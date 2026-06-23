import type { Metadata } from 'next';
import { Providers } from '@/app/providers';
import { MigrateClient } from './migrate-client';

export const metadata: Metadata = {
  title: 'Migrate to post-quantum security — PQWeave',
  description:
    'Connect any EVM wallet, review your exposure, derive a post-quantum key, and activate protection.',
};

export default function MigratePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Migrate to post-quantum security
      </h1>
      <p className="mt-3 text-zinc-400">
        Four steps to a quantum-safe wallet. Your keys stay in your wallet; PQWeave adds the
        post-quantum account logic around them.
      </p>
      <div className="mt-8">
        <Providers>
          <MigrateClient />
        </Providers>
      </div>
    </div>
  );
}
