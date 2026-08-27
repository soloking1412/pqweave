import Link from 'next/link';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';
import { Logo } from './logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo className="h-5 w-5" />
          <span>PQWeave</span>
          <span className="text-zinc-600">
            — post-quantum security across {LIVE_CHAIN_COUNT} chains
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/scan" className="transition hover:text-white">
            Scanner
          </Link>
          <Link href="/migrate" className="transition hover:text-white">
            Migrate
          </Link>
          <Link href="/exposure" className="transition hover:text-white">
            Exposure index
          </Link>
          <Link href="/security" className="transition hover:text-white">
            Security
          </Link>
          <a href="mailto:partnerships@pqweave.com" className="transition hover:text-white">
            Partnerships
          </a>
        </div>
      </div>
    </footer>
  );
}
