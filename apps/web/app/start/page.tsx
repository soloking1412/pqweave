import type { Metadata } from 'next';
import { Providers } from '@/app/providers';
import { StartClient } from './start-client';

export const metadata: Metadata = {
  title: 'Start quantum-safe — PQWeave',
  description:
    'For new wallets: generate a post-quantum key and get an account address that is quantum-safe from day one — reserved on-chain before it is even deployed.',
};

export default function StartPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Start quantum-safe from day one
      </h1>
      <p className="mt-3 text-zinc-400">
        No exposed key to clean up, ever: generate a post-quantum key first, get your account
        address second, and only then let value touch it. The address is reserved deterministically
        on-chain (CREATE2), so it is safe to receive funds before the account contract is even
        deployed.
      </p>
      <div className="mt-8">
        <Providers>
          <StartClient />
        </Providers>
      </div>
    </div>
  );
}
