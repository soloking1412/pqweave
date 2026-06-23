import './globals.css';
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  metadataBase: new URL('https://pqweave.com'),
  title: 'PQWeave — Post-Quantum Migration for EVM Wallets',
  description:
    'Scan, harden, and migrate any EVM wallet to post-quantum-safe security before Q-Day. Works with MetaMask, Ledger, Rabby, and every EVM wallet via account abstraction.',
  openGraph: {
    title: 'PQWeave — Post-Quantum Migration for EVM Wallets',
    description:
      'Scan your quantum exposure, then migrate any EVM wallet to a post-quantum account — one transaction, no custody.',
    url: 'https://pqweave.com',
    siteName: 'PQWeave',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PQWeave — Post-Quantum Migration for EVM Wallets',
    description:
      'Scan your quantum exposure, then migrate any EVM wallet to a post-quantum account — one transaction, no custody.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
