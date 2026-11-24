import Link from 'next/link';
import { Logo } from './logo';

const NAVIGATION = [
  ['/protect/bitcoin', 'Bitcoin kit'],
  ['/bitcoin/research', 'Research'],
  ['/exposure/bitcoin', 'Exposure'],
  ['/security', 'Security'],
];

export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-base">
      <div className="mx-auto flex max-w-6xl flex-col px-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <Link
          href="/"
          className="flex min-h-16 w-fit items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Logo className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">PQWeave</span>
          <span className="tabular ml-2 border-l border-rule-strong pl-3 text-[10px] uppercase tracking-widest text-caution">
            Bitcoin
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-1 pb-3 text-sm text-ink-2 sm:py-2"
        >
          {NAVIGATION.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-control px-3 py-2 hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
