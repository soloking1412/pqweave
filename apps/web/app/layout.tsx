import './globals.css';
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  metadataBase: new URL('https://pqweave.com'),
  title: 'PQWeave',
  description:
    'Scan any address for quantum exposure across 16 chains, including Bitcoin, Ethereum and Solana. Move an EVM wallet behind a post-quantum signature in one transaction, with an honest answer on every other chain.',
  openGraph: {
    title: 'PQWeave',
    description:
      'Scan your quantum exposure across 16 chains, then move an EVM wallet to a post-quantum account in one transaction. No custody.',
    url: 'https://pqweave.com',
    siteName: 'PQWeave',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PQWeave',
    description:
      'Scan your quantum exposure across 16 chains, then move an EVM wallet to a post-quantum account in one transaction. No custody.',
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
