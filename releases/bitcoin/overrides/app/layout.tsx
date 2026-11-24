import './globals.css';
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  metadataBase: new URL('https://pqweave.com'),
  title: 'PQWeave',
  description:
    'Inspect Bitcoin quantum exposure and prepare a reviewed transaction with your existing signer. Watch-only readiness for individuals, wallets, and exchanges.',
  openGraph: {
    title: 'PQWeave',
    description:
      'Prepare a reviewed Bitcoin transaction with your existing signer. Watch-only readiness, exposure analysis, and current post-quantum Bitcoin research.',
    url: 'https://pqweave.com',
    siteName: 'PQWeave',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PQWeave',
    description:
      'Prepare a reviewed Bitcoin transaction with your existing signer. Watch-only readiness, exposure analysis, and current post-quantum Bitcoin research.',
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
