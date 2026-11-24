import Link from 'next/link';
import { Logo } from './logo';

const COLUMNS = [
  [
    'Tools',
    [
      ['/scan', 'Scan an address'],
      ['/kit', 'Migration kit'],
      ['/protect/bitcoin', 'Bitcoin kit'],
      ['/ethereum', 'Ethereum readiness'],
      ['/exposure', 'Exposure index'],
    ],
  ],
  [
    'Reading',
    [
      ['/bitcoin/research', 'Bitcoin research'],
      ['/security', 'Security model'],
      [
        'https://github.com/soloking1412/pqweave/blob/master/docs/SELF_AUDIT_2026-09-25.md',
        'Self-audit',
      ],
      ['https://github.com/soloking1412/pqweave', 'Source (MIT)'],
    ],
  ],
  [
    'Work with us',
    [
      ['/partners', 'Wallets and custodians'],
      ['mailto:security@pqweave.com', 'Report a vulnerability'],
      ['mailto:maheswaran@pqweave.com', 'Contact'],
    ],
  ],
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-rule-strong bg-base">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 text-sm sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 text-ink">
            <Logo className="h-5 w-5" />
            <span className="font-semibold">PQWeave</span>
          </div>
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-dim">
            Open-source tooling for the post-quantum transition. Watch-only where it has to be. The
            contracts are not audited and nothing here runs on mainnet.
          </p>
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <div className="label">{title}</div>
            <ul className="mt-3 space-y-1">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-8 items-center text-ink-2 underline-offset-4 hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
