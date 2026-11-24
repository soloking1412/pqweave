import type { Metadata } from 'next';
import { ScanForm } from './scan-form';

export const metadata: Metadata = {
  title: 'Scan a wallet — PQWeave',
  description:
    'Check whether an address on Bitcoin, Ethereum, Solana, and 13 more chains has revealed its public key, what value it guards, and score its quantum risk.',
};

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Scan a wallet</h1>
      <p className="mt-3 text-ink-dim">
        Pick a chain and enter an address to see whether its public key is already exposed to a
        future quantum attacker, what value is visible, and which route is worth investigating.
        Supports EVM, Bitcoin, Litecoin, Dogecoin, Solana, Cardano, Cosmos, XRP, Algorand, Stellar,
        NEAR, Aptos, Tron, Sui, TON, and Polkadot. Nothing is stored, and no wallet connection is
        needed. Algorand signer status cannot be inferred from address format alone.
      </p>
      <div className="mt-8">
        <ScanForm initialAddress={address ?? ''} />
      </div>
      <p className="mt-8 text-xs leading-relaxed text-ink-faint">
        Risk reflects whether the address has broadcast a transaction (revealing its public key) and
        the value it guards, native balance plus, on EVM mainnets, balances in major tokens (USDC,
        USDT, DAI, WETH, WBTC). Other tokens, NFTs, and off-chain risk are not included. This is an
        informational tool, not financial or security advice.
      </p>
    </div>
  );
}
