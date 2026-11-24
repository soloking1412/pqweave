import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Bitcoin post-quantum research and route analysis — PQWeave',
  description:
    'A dated comparison of standard Bitcoin PSBTs, QSB, BIP-360 P2MR, and SHRINCS. Current capabilities, unresolved assumptions, and the PQWeave route decision.',
};

const SOURCES = {
  psbt: 'https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki',
  qsb: 'https://starkware.co/blog/the-first-quantum-safe-bitcoin-transaction-has-been-mined/',
  qsbCode: 'https://github.com/avihu28/Quantum-Safe-Bitcoin-Transactions',
  qsbUpdate:
    'https://starkware.co/blog/ai-research-competition-cut-quantum-safe-bitcoin-costs-by-79-in-a-week/',
  p2mr: 'https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki',
  migration: 'https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki',
  shrincs:
    'https://blog.blockstream.com/op_checkshrincs-a-hash-based-signature-opcode-for-post-quantum-bitcoin/',
};

const ROUTES = [
  {
    route: 'Native SegWit + PSBT',
    status: 'Available · Transitional',
    protection:
      'A fresh public-key-hash output hides the key until spending. It still uses classical signatures.',
    decision:
      'Default kit route for reviewed, supported coins. Consider fees, privacy, and signer compatibility before moving.',
    source: SOURCES.psbt,
    sourceLabel: 'BIP-174',
  },
  {
    route: 'Quantum-Safe Bitcoin (QSB)',
    status: 'Mainnet experiment',
    protection:
      'A specialized hash-based construction demonstrated on mainnet without a consensus change.',
    decision:
      'Research only. Requires GPU search and direct miner submission; not implemented in this kit.',
    source: SOURCES.qsb,
    sourceLabel: 'Mainnet demonstration',
  },
  {
    route: 'BIP-360 / P2MR',
    status: 'Draft · Not activated',
    protection: 'Removes the Taproot key path. Does not itself introduce post-quantum signatures.',
    decision:
      'Track for future integration. Draft P2MR addresses must not receive funds on current public networks.',
    source: SOURCES.p2mr,
    sourceLabel: 'BIP-360 specification',
  },
  {
    route: 'SHRINCS / OP_CHECKSHRINCS',
    status: 'Research proposal',
    protection: 'Explores hash-based signatures and a new verification opcode for Bitcoin.',
    decision:
      'Requires consensus activation and implementation review before a Bitcoin mainnet route can be offered.',
    source: SOURCES.shrincs,
    sourceLabel: 'Blockstream research',
  },
  {
    route: 'Liquid SHRINCS',
    status: 'Sidechain route',
    protection:
      'An exploration under Liquid’s network rules, with separate custody and peg assumptions.',
    decision:
      'Excluded from the default Bitcoin kit. A sidechain transfer changes the trust model and asset environment.',
    source: SOURCES.shrincs,
    sourceLabel: 'Research and deployment context',
  },
];

const sourceClass =
  'inline-flex min-h-11 items-center text-sm text-brand-bright underline underline-offset-4 hover:text-accent focus-visible:ring-2 focus-visible:ring-brand-bright';

export default function BitcoinResearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-5">
        <span className="tabular text-xs uppercase tracking-widest text-amber-300">
          Bitcoin / Research desk
        </span>
        <time dateTime="2026-09-25" className="tabular text-xs text-zinc-400">
          Reviewed 25 Sep 2026
        </time>
      </div>
      <section className="grid gap-8 py-8 sm:py-12 lg:grid-cols-[1.25fr_.75fr]">
        <div>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            The best route depends on what Bitcoin can enforce.
          </h1>
          <p className="mt-6 max-w-2xl leading-relaxed text-zinc-300">
            Our recommendation is a signer-neutral, noncustodial readiness kit: validate existing
            outputs, prepare a reviewed unsigned transaction, and keep signing in the user’s wallet.
            Continue evaluating PQ destinations as their security and operation mature.
          </p>
        </div>
        <aside className="border-l-2 border-brand bg-panel p-6 lg:self-end">
          <div className="tabular text-xs uppercase tracking-widest text-accent">
            Product decision
          </div>
          <h2 className="mt-3 text-xl font-semibold">Ship inspectable preparation.</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            The kit’s standard Bitcoin route reduces exposure; it is not a post-quantum custody
            product. Experimental routes require a separate review before they can protect customer
            funds.
          </p>
        </aside>
      </section>
      <section aria-labelledby="comparison-title">
        <h2 id="comparison-title" className="text-2xl font-semibold tracking-tight">
          Routes, evidence, and tradeoffs
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Availability alone does not establish suitability for custody. The table records our
          current interpretation of the linked specifications and research.
        </p>
        <p
          id="comparison-scroll-hint"
          className="mt-5 flex items-center gap-2 text-sm text-accent lg:hidden"
        >
          <span aria-hidden>↔</span> Scroll sideways to compare all routes and kit decisions.
        </p>
        <div
          className="mt-3 overflow-x-auto border border-rule focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright lg:mt-6"
          aria-describedby="comparison-scroll-hint"
          role="region"
          aria-label="Bitcoin route comparison, scroll horizontally on smaller screens"
          tabIndex={0}
        >
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Bitcoin post-quantum route comparison as of September 25, 2026
            </caption>
            <thead className="bg-panel-raised text-xs uppercase tracking-wider text-zinc-300">
              <tr>
                <th scope="col" className="w-[25%] p-5 font-medium">
                  Route / status
                </th>
                <th scope="col" className="w-[35%] p-5 font-medium">
                  What it changes
                </th>
                <th scope="col" className="p-5 font-medium">
                  Kit decision
                </th>
              </tr>
            </thead>
            <tbody>
              {ROUTES.map((route) => (
                <tr key={route.route} className="border-t border-rule bg-panel align-top">
                  <th scope="row" className="p-5 font-normal">
                    <span className="block font-semibold text-zinc-100">{route.route}</span>
                    <span className="mt-2 block text-xs text-amber-200">{route.status}</span>
                    <a href={route.source} className={sourceClass}>
                      {route.sourceLabel} ↗
                    </a>
                  </th>
                  <td className="p-5 leading-relaxed text-zinc-300">{route.protection}</td>
                  <td className="p-5 leading-relaxed text-zinc-300">{route.decision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-8 border-b border-rule py-12 sm:py-16 lg:grid-cols-[.7fr_1.3fr]">
        <div>
          <div className="tabular text-xs uppercase tracking-widest text-accent">What changed</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            A real mainnet experiment deserves a precise reading.
          </h2>
        </div>
        <div>
          <p className="leading-relaxed text-zinc-300">
            StarkWare reported a QSB transaction mined on Bitcoin mainnet on 26 August 2026 without
            changing consensus rules. Its specialized bare-script approach is not a standard wallet
            migration. It needs substantial computation and a direct miner path. The kit does not
            implement it, and the demonstration does not establish broad wallet compatibility or
            production custody readiness.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300">
            A 23 September update reports an estimated $67 GPU computation cost after optimization.
            This modeled compute figure is not a service quote, a Bitcoin fee, or a complete
            production benchmark covering preparation, signing, recovery, and miner submission.
          </p>
          <a className={sourceClass} href={SOURCES.qsbUpdate}>
            Read the September cost update ↗
          </a>
          <div className="mt-3 flex flex-wrap gap-x-6">
            <a className={sourceClass} href={SOURCES.qsb}>
              Read the demonstration ↗
            </a>
            <a className={sourceClass} href={SOURCES.qsbCode}>
              Inspect the implementation ↗
            </a>
          </div>
        </div>
      </section>
      <section className="grid gap-8 py-12 sm:py-16 lg:grid-cols-[.7fr_1.3fr]">
        <div>
          <div className="tabular text-xs uppercase tracking-widest text-accent">
            Migration planning
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Protection must include a way to spend.
          </h2>
        </div>
        <div className="space-y-5 text-sm leading-relaxed text-zinc-300">
          <p>
            Review every spending and recovery path, not just the receiving address. Standard
            Bitcoin signatures remain vulnerable to a sufficiently capable quantum attacker. Hiding
            a key until spending reduces one kind of exposure but leaves the spend itself exposed.
          </p>
          <p>
            BIP-360 and BIP-361 remain drafts. BIP-360 specifies Pay-to-Merkle-Root; BIP-361
            discusses migration and a proposed sunset of vulnerable signatures. Neither draft should
            be treated as activated policy or a promised network timeline.
          </p>
          <div className="flex flex-wrap gap-x-6">
            <a className={sourceClass} href={SOURCES.p2mr}>
              BIP-360 specification ↗
            </a>
            <a className={sourceClass} href={SOURCES.migration}>
              BIP-361 migration proposal ↗
            </a>
          </div>
          <p>
            For individuals, begin with the coins and signer you already use. For wallets and
            exchanges, validate representative output types, independent transaction review,
            backups, and recovery before a fleet rollout. Keep inscriptions, runes, and special
            scripts in a separate supported workflow.
          </p>
        </div>
      </section>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-6 border border-rule bg-panel p-6 sm:p-8">
        <div>
          <h2 className="text-xl font-semibold">Start with a reviewed inventory.</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Prepare a plan and inspect the tradeoffs before signing.
          </p>
        </div>
        <Link
          href="/protect/bitcoin"
          className="inline-flex min-h-11 items-center rounded-control bg-[#285f96] px-5 py-3 text-sm font-semibold text-white hover:bg-[#326fa9] active:bg-[#204f7d] focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        >
          Prepare a Bitcoin plan →
        </Link>
      </div>
    </div>
  );
}
