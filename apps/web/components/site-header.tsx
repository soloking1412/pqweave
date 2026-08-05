import Link from 'next/link';
import { Logo } from './logo';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0a0a0b]/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">PQWeave</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-zinc-300">
          <Link
            href="/scan"
            className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white sm:block"
          >
            Scanner
          </Link>
          <Link
            href="/migrate"
            className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white sm:block"
          >
            Migrate
          </Link>
          <Link
            href="/start"
            className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white md:block"
          >
            Start safe
          </Link>
          <Link
            href="/exposure"
            className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white md:block"
          >
            Index
          </Link>
          <Link
            href="/attest"
            className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white lg:block"
          >
            Attest
          </Link>
          <Link
            href="/#chains"
            className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white lg:block"
          >
            Chains
          </Link>
          <Link
            href="/partners"
            className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white sm:block"
          >
            Partners
          </Link>
          <Link
            href="/scan"
            className="ml-1 rounded-lg bg-brand px-3.5 py-2 font-medium text-white shadow-[0_0_30px_-8px_rgba(124,108,255,0.8)] transition hover:bg-brand-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            Scan
          </Link>
        </nav>
      </div>
    </header>
  );
}
