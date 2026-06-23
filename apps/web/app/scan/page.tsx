import type { Metadata } from 'next';
import { ScanForm } from './scan-form';

export const metadata: Metadata = {
  title: 'Wallet exposure scanner — PQWeave',
  description:
    'Check whether an EVM, Bitcoin, Litecoin, or Solana address has revealed its public key and score its quantum risk.',
};

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Wallet exposure scanner</h1>
      <p className="mt-3 text-zinc-400">
        Pick a chain and enter an address to see whether its public key is already exposed to a
        future quantum attacker, how much is at risk, and what migration is actually possible.
        Supports EVM, Bitcoin, Litecoin, Solana, Cardano, Cosmos, XRP, Algorand, Stellar, NEAR, and
        Aptos. Nothing is stored, and no wallet connection is needed.
      </p>
      <div className="mt-8">
        <ScanForm initialAddress={address ?? ''} />
      </div>
      <p className="mt-8 text-xs leading-relaxed text-zinc-600">
        Risk reflects whether the address has broadcast a transaction (revealing its public key) and
        the native balance it guards. Token balances and off-chain risk are not included. This is an
        informational tool, not financial or security advice.
      </p>
    </div>
  );
}
