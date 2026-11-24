import Link from 'next/link';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

const NAVIGATION = [
  ['/scan', 'Scan'],
  ['/kit', 'Migration kit'],
  ['/protect/bitcoin', 'Bitcoin'],
  ['/ethereum', 'Ethereum'],
  ['/exposure', 'Exposure'],
  ['/bitcoin/research', 'Research'],
  ['/security', 'Security'],
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-rule-strong bg-base">
      <div className="mx-auto flex max-w-6xl flex-col px-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <Link
          href="/"
          className="flex min-h-14 w-fit items-center gap-2.5 text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Logo className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-tight">PQWeave</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="-mx-2 flex flex-wrap items-center gap-x-1 pb-2 text-sm text-ink-2 sm:mx-0 sm:pb-0"
        >
          {NAVIGATION.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center px-2.5 underline-offset-[6px] hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/partners"
            className="ml-2 inline-flex min-h-9 items-center rounded-control border border-ink px-3 text-sm font-medium text-ink hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-brand"
          >
            For custodians
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
