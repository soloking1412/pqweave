import Link from 'next/link';
import { Reveal } from '@/components/motion';
import { SignatureBars } from '@/components/signature-bars';
import { SCAN_OPTIONS } from '@/lib/chains';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';

const REPO = 'https://github.com/soloking1412/pqweave/blob/master';

const READINGS = [
  {
    value: '~1,200',
    unit: 'logical qubits',
    label: 'Estimated to break the secp256k1 curve',
    source: 'Google Quantum AI, March 2026',
  },
  {
    value: '~100',
    unit: 'logical qubits',
    label: 'Largest machines demonstrated so far',
    source: 'Public results, 2026',
  },
  {
    value: 'Draft',
    unit: 'BIP-360 / BIP-361',
    label: 'Bitcoin has no activation date and no chosen signature',
    source: 'bitcoin/bips, November 2026',
  },
  {
    value: '~2029',
    unit: 'target',
    label: 'Ethereum post-quantum base layer',
    source: 'ethereum.org roadmap',
  },
] as const;

const ROUTES = [
  {
    chain: 'Ethereum and EVM chains',
    leak: 'Recoverable from any signed transaction',
    route: 'Sweep into an account where a post-quantum key is the only authority',
    outcome: 'Protected',
    status: 'Testnet. Not audited.',
    href: '/ethereum',
    tone: 'text-ok',
  },
  {
    chain: 'Bitcoin',
    leak: 'Published on the first spend',
    route: 'Watch-only plan to move coins to a fresh address, signed in your own wallet',
    outcome: 'Transitional',
    status: 'Usable today. Verified on Bitcoin Core.',
    href: '/protect/bitcoin',
    tone: 'text-caution',
  },
  {
    chain: 'Algorand',
    leak: 'The address is the key',
    route: 'Rekey to a native Falcon account, where the wallet supports it',
    outcome: 'Protected',
    status: 'Native on the chain. We plan it, you sign it.',
    href: '/kit?chain=algorand',
    tone: 'text-ok',
  },
  {
    chain: 'Solana, Stellar',
    leak: 'The address is the key',
    route: 'Deposit into a vault that checks a hash-based signature',
    outcome: 'Custody change',
    status: 'Devnet and testnet prototypes.',
    href: '/protect/solana',
    tone: 'text-note',
  },
  {
    chain: `${LIVE_CHAIN_COUNT - 5} more chains`,
    leak: 'Measured per chain',
    route: 'Exposure reading and a written plan. No asset moves.',
    outcome: 'Prepared',
    status: 'Scanner live.',
    href: '/kit',
    tone: 'text-ink-dim',
  },
] as const;

const EVIDENCE = [
  ['492', 'SDK tests', 'Unit, property and hostile-input cases'],
  ['94', 'contract tests', 'Foundry, 512 fuzz runs each'],
  ['113', 'Bitcoin Core checks', 'Sign, fee-bump, mine and re-spend on regtest'],
  ['122', 'Ethereum checks', 'Against the real EntryPoint 0.7 bytecode'],
] as const;

const LIMITS = [
  [
    'Bitcoin cannot be made quantum-safe by an application.',
    'Script cannot verify a post-quantum signature. What we offer is preparation and reaction time. The fix has to come from the protocol.',
  ],
  [
    'Keeping your Ethereum address is a stopgap.',
    'An EIP-7702 delegation can be revoked by the old ECDSA key. Only moving to a new account with a post-quantum key as sole authority removes that key.',
  ],
  [
    'A vault is custody, not migration.',
    'On chains where the address is the public key, the original address stays exposed. The vault protects what you deposit and adds contract risk.',
  ],
  [
    'Nothing here is audited.',
    'We ran a self-audit and published it, including two high-severity bugs we found in our own verifiers. That is not an independent review.',
  ],
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:items-start">
        <div>
          <div className="label">Post-quantum readiness for {LIVE_CHAIN_COUNT} chains</div>
          <h1 className="mt-5 max-w-2xl text-[2.5rem] leading-[1.08] sm:text-[3.4rem]">
            Your public key is probably already public.
          </h1>
          <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">
            A large enough quantum computer can turn a public key into the private key. Most wallets
            published theirs the first time they sent a transaction. Paste an address to see where
            it stands and what that chain lets you do about it.
          </p>

          <form action="/kit" method="get" className="panel mt-8 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-end">
              <label className="block">
                <span className="label">Chain</span>
                <select
                  name="chain"
                  defaultValue="bitcoin"
                  className="mt-1.5 h-11 w-full rounded-control border border-rule-strong bg-paper px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {SCAN_OPTIONS.filter((option) => option.key !== 'evm-all').map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Public address</span>
                <input
                  name="address"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="bc1q… or 0x…"
                  className="tabular mt-1.5 h-11 w-full rounded-control border border-rule-strong bg-paper px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              </label>
              <button
                type="submit"
                className="h-11 rounded-control bg-brand px-5 text-sm font-semibold text-paper hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
              >
                Read exposure
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-dim">
              Watch-only. No wallet connection, no signature, no account. We never ask for a seed
              phrase or a private key.
            </p>
          </form>
        </div>

        <aside aria-label="Where things stand" className="panel">
          <div className="flex items-center justify-between border-b border-rule px-5 py-3">
            <span className="label">Where things stand</span>
            <span className="tabular text-[11px] text-ink-dim">25 Nov 2026</span>
          </div>
          <dl className="divide-y divide-rule">
            {READINGS.map((reading) => (
              <div key={reading.label} className="grid grid-cols-[7.5rem_1fr] gap-4 px-5 py-4">
                <dt>
                  <div className="tabular text-2xl font-medium leading-none text-ink">
                    {reading.value}
                  </div>
                  <div className="tabular mt-1.5 text-[11px] text-ink-dim">{reading.unit}</div>
                </dt>
                <dd>
                  <div className="text-sm leading-snug text-ink">{reading.label}</div>
                  <div className="mt-1 text-xs text-ink-faint">{reading.source}</div>
                </dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-rule bg-panel-raised px-5 py-3 text-xs leading-relaxed text-ink-2">
            These are estimates and drafts, not a date. Nobody can break a wallet today. The work is
            knowing your exposure before the answer changes.
          </p>
        </aside>
      </section>

      <Reveal>
        <section className="border-t border-rule-strong py-14 sm:py-20" aria-labelledby="routes">
          <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <div className="label">Routes</div>
              <h2 id="routes" className="mt-3 text-3xl leading-tight sm:text-4xl">
                One answer does not fit every chain.
              </h2>
            </div>
            <p className="max-w-xl text-[15px] leading-relaxed text-ink-2">
              What can be done depends on how a chain exposes keys and what its rules can verify. We
              name the outcome plainly, so &ldquo;protected&rdquo; is never used for something that
              is only prepared.
            </p>
          </div>

          <div className="panel mt-10 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-rule-strong">
                  {['Chain', 'How the key leaks', 'Best route today', 'Outcome'].map((heading) => (
                    <th key={heading} scope="col" className="label px-5 py-3 font-normal">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {ROUTES.map((row) => (
                  <tr key={row.chain} className="align-top">
                    <th scope="row" className="px-5 py-4 font-semibold text-ink">
                      <Link
                        href={row.href}
                        className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {row.chain}
                      </Link>
                    </th>
                    <td className="px-5 py-4 text-ink-2">{row.leak}</td>
                    <td className="px-5 py-4 text-ink-2">{row.route}</td>
                    <td className="px-5 py-4">
                      <div className={`font-semibold ${row.tone}`}>{row.outcome}</div>
                      <div className="mt-1 text-xs text-ink-dim">{row.status}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="border-t border-rule-strong py-14 sm:py-20" aria-labelledby="evidence">
          <div className="label">Evidence</div>
          <h2 id="evidence" className="mt-3 max-w-2xl text-3xl leading-tight sm:text-4xl">
            Every number here comes from a test you can run.
          </h2>

          <dl className="mt-10 grid border-l border-t border-rule-strong sm:grid-cols-2 lg:grid-cols-4">
            {EVIDENCE.map(([value, name, detail]) => (
              <div key={name} className="border-b border-r border-rule-strong bg-panel px-5 py-6">
                <dt className="tabular text-4xl font-medium text-ink">{value}</dt>
                <dd className="mt-2">
                  <div className="text-sm font-semibold text-ink">{name}</div>
                  <div className="mt-1 text-[13px] leading-snug text-ink-dim">{detail}</div>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
            <SignatureBars />
            <div>
              <h3 className="text-lg font-semibold text-ink">
                We found two serious bugs in our own verifiers, and published them.
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                Both signature verifiers accepted leaf indices outside the Merkle tree, which could
                defeat the one-time-key guard. A second flaw let token transfers skip the
                post-quantum check in hybrid mode. Both are fixed and covered by regression tests.
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                The write-up lists what we found, what changed and what is still open. It is a
                self-audit. An independent review has not happened yet.
              </p>
              <a
                href={`${REPO}/docs/SELF_AUDIT_2026-09-25.md`}
                className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-4 hover:text-brand-strong focus-visible:ring-2 focus-visible:ring-brand"
              >
                Read the self-audit →
              </a>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="border-t border-rule-strong py-14 sm:py-20" aria-labelledby="limits">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <div className="label text-danger">Limits</div>
              <h2 id="limits" className="mt-3 text-3xl leading-tight sm:text-4xl">
                What this cannot do.
              </h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-2">
                Stated before anything else, because the alternative is selling something that does
                not exist.
              </p>
            </div>
            <ol className="divide-y divide-rule border-y border-rule-strong">
              {LIMITS.map(([title, detail], index) => (
                <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-2 py-5">
                  <span className="tabular pt-0.5 text-xs text-ink-faint">0{index + 1}</span>
                  <div>
                    <h3 className="text-base font-semibold text-ink">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mb-16 border border-ink bg-ink px-6 py-10 text-paper sm:px-10 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[1.3fr_.7fr] lg:items-center">
            <div>
              <div className="label text-paper/70">Wallets · custodians · exchanges</div>
              <h2 className="mt-3 max-w-xl text-3xl leading-tight sm:text-4xl">
                Someone will ask how much of what you hold is exposed.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-paper/80">
                We will run a free exposure report on your own addresses: what has published a key,
                what value sits behind it, and which route each chain allows. Read-only. Your keys,
                policy and signing stay with you.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Link
                href="/partners"
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-paper px-5 text-sm font-semibold text-ink hover:bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                Request a report
              </Link>
              <a
                href="https://github.com/soloking1412/pqweave"
                className="inline-flex min-h-11 items-center text-sm text-paper/80 underline underline-offset-4 hover:text-paper focus-visible:ring-2 focus-visible:ring-paper"
              >
                Or run the MIT code yourself
              </a>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
