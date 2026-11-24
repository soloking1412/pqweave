import Link from 'next/link';
import { Logo } from './logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-base">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 text-sm text-ink-dim sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo className="h-5 w-5" />
            <span className="text-ink">PQWeave</span>
          </div>
          <p className="mt-3 max-w-md text-xs leading-relaxed">
            Bitcoin readiness with your existing signer. Standard transactions offer exposure
            reduction, not post-quantum protection.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            ['/protect/bitcoin', 'Bitcoin kit'],
            ['/bitcoin/research', 'Research'],
            ['/exposure/bitcoin', 'Exposure'],
            ['/security', 'Security'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
