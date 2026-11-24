import Link from 'next/link';

const WORKFLOW = [
  ['01', 'Source outputs', 'Inspect addresses, spend history, and the coins you intend to move.'],
  ['02', 'Reviewed PSBT', 'Check the destination, source transactions, fees, and every input.'],
  ['03', 'Your signer', 'Export the unsigned plan and approve it in your own compatible wallet.'],
  ['04', 'Verified transaction', 'Compare the signed transaction with the plan before broadcast.'],
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
        <div>
          <div className="tabular flex items-center gap-2 text-xs uppercase tracking-widest text-caution">
            <span className="h-2 w-2 bg-caution" aria-hidden />
            Bitcoin readiness / 01
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Your bitcoin.
            <br />
            Your signer.
            <br />
            <span className="text-accent">A reviewed next move.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[1rem] leading-relaxed text-ink-2">
            A noncustodial kit to understand quantum exposure, validate existing coins, and prepare
            a Bitcoin transaction for your own wallet to sign.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/protect/bitcoin"
              className="inline-flex min-h-11 items-center rounded-control bg-brand px-5 py-3 text-sm font-semibold text-paper hover:bg-brand-strong active:bg-brand-strong focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            >
              Prepare a Bitcoin plan →
            </Link>
            <Link
              href="/bitcoin/research"
              className="inline-flex min-h-11 items-center rounded-control border border-rule-strong px-5 py-3 text-sm font-medium text-ink hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-brand"
            >
              Review the research
            </Link>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-dim">
            The standard route reduces public-key exposure. It does not add a post-quantum signature
            to your bitcoin.
          </p>
        </div>
        <aside className="panel" aria-label="Bitcoin kit capability">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-panel-raised px-6 py-4">
            <span className="tabular text-xs uppercase tracking-widest text-ink-2">
              Route status
            </span>
            <span className="text-xs text-caution">Transitional</span>
          </div>
          <div className="px-6 py-7">
            <div className="tabular text-xs text-accent">BTC / NATIVE SEGWIT</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Preparation you can inspect.
            </h2>
            <dl className="mt-6 divide-y divide-rule text-sm">
              {[
                ['Key custody', 'Your existing wallet'],
                ['Preparation', 'Watch-only'],
                ['Signing', 'External wallet'],
                ['Experimental PQ routes', 'Excluded'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-2 py-4">
                  <dt className="text-ink-dim">{label}</dt>
                  <dd className="font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="border-t border-rule bg-panel-raised px-6 py-4 text-xs leading-relaxed text-ink-2">
            No seed phrase or private key requested. Signing support depends on your wallet and the
            source output type.
          </p>
        </aside>
      </section>

      <section className="border-y border-rule py-12 sm:py-16" aria-labelledby="workflow-title">
        <div className="tabular text-xs uppercase tracking-widest text-accent">
          The transaction path
        </div>
        <h2 id="workflow-title" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Keep every step reviewable.
        </h2>
        <ol className="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW.map(([number, title, detail]) => (
            <li key={number} className="border-t border-rule-strong pt-5">
              <div className="flex items-center justify-between">
                <span className="tabular text-xs text-caution">{number}</span>
                <span className="text-ink-dim" aria-hidden>
                  →
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-dim">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="grid gap-8 py-16 sm:py-24 lg:grid-cols-[.7fr_1.3fr]"
        aria-labelledby="decision-title"
      >
        <div>
          <div className="tabular text-xs uppercase tracking-widest text-accent">
            Choose deliberately
          </div>
          <h2 id="decision-title" className="mt-3 text-3xl font-semibold tracking-tight">
            A move should earn its cost.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-dim">
            Exposure, transaction fees, privacy, and signer support all matter. A scan is a starting
            point for a decision.
          </p>
        </div>
        <div className="divide-y divide-rule border-y border-rule">
          {[
            [
              'Inspect before moving',
              'Fresh native SegWit outputs can hide a public key until spending. Taproot output keys are visible immediately. Address history helps distinguish these cases.',
            ],
            [
              'Preserve your privacy',
              'Combining outputs can link balances and address histories. Choose inputs deliberately and avoid moving every coin simply to consolidate.',
            ],
            [
              'Recognize special assets',
              'Inscriptions, runes, multisig, timelocks, and custom scripts need specialized tools. An ordinary address scan cannot prove that every asset or spending condition was discovered.',
            ],
          ].map(([title, detail]) => (
            <article key={title} className="py-6">
              <h3 className="text-[1rem] font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-16 border border-rule bg-panel px-6 py-8 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="tabular text-xs uppercase tracking-widest text-accent">
              Individuals · Wallets · Exchanges
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Build readiness around existing custody.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-2">
              Start with a public address or wallet inventory. Review the available route, keep
              approvals in your existing signing process, and retain the transaction plan for your
              records.
            </p>
          </div>
          <Link
            href="/bitcoin/research"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-brand/50 px-5 py-3 text-sm font-semibold text-brand hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-brand"
          >
            Read the route analysis →
          </Link>
        </div>
        <p className="mt-7 border-t border-rule pt-5 text-sm leading-relaxed text-ink-dim">
          Post-quantum Bitcoin research is advancing, including a QSB mainnet experiment. These
          experimental constructions are outside the kit. Review their assumptions before treating
          any route as suitable for custody.
        </p>
      </section>
    </div>
  );
}
