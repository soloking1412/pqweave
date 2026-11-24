import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Bitcoin quantum exposure — PQWeave',
  description:
    'Understand exposed Bitcoin public keys, transitional preparation, and the current status of BIP-360 and BIP-361.',
};

const TYPES = [
  {
    name: 'Key visible in output',
    example: 'P2PK and Taproot key path',
    note: 'The public key or a tweaked form is committed in the output. A new destination is needed to change the exposure of those coins.',
  },
  {
    name: 'Key revealed by spending',
    example: 'Common P2PKH and P2WPKH use',
    note: 'The first spend publishes a public key. Address reuse may leave later deposits guarded by an already visible key.',
  },
  {
    name: 'Key not yet revealed',
    example: 'Unused hash-based address',
    note: 'A fresh address can defer long exposure, but spending still reveals the classical key and can create a short-range race.',
  },
];

export default function BitcoinExposurePage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
      <div className="tabular text-xs uppercase tracking-widest text-accent">Bitcoin exposure</div>
      <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
        See what your Bitcoin address reveals.
      </h1>
      <p className="mt-5 max-w-3xl leading-relaxed text-zinc-300">
        Quantum risk depends on the output type and whether a public key has appeared on chain.
        BIP-361 cites more than 34% of bitcoin with a revealed public key as of March 2026. That is
        a dated estimate from a draft proposal, not a live network measurement.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/protect/bitcoin"
          className="inline-flex min-h-11 items-center rounded-control bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-bright"
        >
          Build a Bitcoin plan →
        </Link>
        <Link
          href="/protect/bitcoin"
          className="inline-flex min-h-11 items-center rounded-control border border-rule-strong px-5 py-3 text-sm font-medium text-zinc-100 hover:bg-white/5"
        >
          Watch-only tools
        </Link>
      </div>

      <section className="mt-16">
        <div className="tabular text-xs uppercase tracking-widest text-accent">Address states</div>
        <h2 className="mt-3 text-2xl font-semibold">Exposure is not the same for every output.</h2>
        <div className="mt-6 grid gap-px border border-rule bg-rule sm:grid-cols-3">
          {TYPES.map((item) => (
            <article key={item.name} className="bg-panel p-6">
              <h3 className="font-semibold">{item.name}</h3>
              <p className="mt-1 text-xs text-accent">{item.example}</p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-300">{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 border-t border-rule pt-12">
        <div className="tabular text-xs uppercase tracking-widest text-accent">
          Proposed protocol routes
        </div>
        <h2 className="mt-3 text-2xl font-semibold">Network upgrades remain drafts.</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <article className="rounded-panel border border-rule bg-panel p-6">
            <h3 className="font-semibold">BIP-360 · P2MR</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Proposes an output type without a key-path commitment. It does not itself activate a
              post-quantum signature. Do not send mainnet funds to a proposed output before
              activation.
            </p>
            <a
              href="https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-brand-bright underline underline-offset-2"
            >
              Read draft →
            </a>
          </article>
          <article className="rounded-panel border border-rule bg-panel p-6">
            <h3 className="font-semibold">BIP-361 · signature sunset</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Proposes restricting new classical outputs after Phase A. Phase B would add a
              quantum-safe rescue condition to classical spends. The rescue protocol is not yet
              specified, so eligibility for an existing wallet cannot be determined.
            </p>
            <a
              href="https://github.com/bitcoin/bips/blob/master/bip-0361.mediawiki"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-brand-bright underline underline-offset-2"
            >
              Read draft →
            </a>
          </article>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-zinc-400">
          The current kit provides watch-only inventory and transitional fresh-address preparation.
          A complete Bitcoin post-quantum migration requires activated network rules and wallet
          support.
        </p>
      </section>
    </main>
  );
}
