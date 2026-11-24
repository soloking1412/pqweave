import './globals.css';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
});
const serif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-serif',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
});

const DESCRIPTION =
  'Check whether a wallet has already published its public key, on 16 chains, and get the migration route that chain actually supports. Watch-only. No wallet connection.';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.pqweave.com'),
  title: 'PQWeave',
  description: DESCRIPTION,
  openGraph: {
    title: 'PQWeave',
    description: DESCRIPTION,
    url: 'https://www.pqweave.com',
    siteName: 'PQWeave',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'PQWeave', description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
