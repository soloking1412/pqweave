import type { Metadata } from 'next';
import { Providers } from '@/app/providers';
import { MigrateClient } from './migrate-client';

export const metadata: Metadata = {
  title: 'Migrate to post-quantum security — PQWeave',
  description:
    'Explore the EVM testnet migration prototype. Review exposure, generate a post-quantum key, and test the route before production use.',
};

export default function MigratePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Ethereum testnet migration
      </h1>
      <p className="mt-3 text-zinc-400">
        On the configured Sepolia deployment, test a sweep to a separate post-quantum smart account,
        or examine transitional in-place hardening. The contracts are unaudited; use test funds
        while the money path is reviewed.
      </p>
      <div className="mt-8">
        <Providers>
          <MigrateClient />
        </Providers>
      </div>
    </div>
  );
}
