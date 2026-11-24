import type { Metadata } from 'next';
import { Providers } from '@/app/providers';
import { StartClient } from './start-client';

export const metadata: Metadata = {
  title: 'Testnet PQ account prototype — PQWeave',
  description:
    'Generate a post-quantum key and test a predicted smart-account destination on a configured EVM testnet. Unaudited prototype.',
};

export default function StartPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Test a post-quantum account
      </h1>
      <p className="mt-3 text-ink-dim">
        Generate a post-quantum key and derive a destination address on a configured testnet. The
        contract is unaudited. Use test funds only and verify the deployment and signer policy.
      </p>
      <div className="mt-8">
        <Providers>
          <StartClient />
        </Providers>
      </div>
    </div>
  );
}
