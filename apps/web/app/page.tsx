import Link from 'next/link';
import { ChainsSection } from '@/components/landing/chains-section';
import { Hero } from '@/components/landing/hero';
import { PartnerCta } from '@/components/landing/partner-cta';
import { RoadmapSection } from '@/components/landing/roadmap-section';
import { VerifierComparison } from '@/components/landing/verifier-comparison';
import { Reveal } from '@/components/motion';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';

/** Measured facts, with the source attached. No number here is ours to round. */
const READINGS = [
  {
    value: '~1,200',
    unit: 'logical qubits',
    label: 'to derive a secp256k1 private key, in minutes of runtime',
    source: 'Google Quantum AI, Mar 2026',
  },
  {
    value: '34',
    unit: '% of BTC',
    label: 'had already revealed a public key on chain by 1 March 2026',
    source: 'BIP-361',
  },
  {
    value: '41',
    unit: '% odds',
    label: 'of a key being derived before a Bitcoin transaction confirms',
    source: 'Google Quantum AI, Mar 2026',
  },
  {
    value: String(LIVE_CHAIN_COUNT),
    unit: 'chains',
    label: 'scanned live across all three exposure families',
    source: 'This repository',
  },
];

const TIERS = [
  {
    step: '01',
    title: 'Scan',
    body: `Check whether an address has published its public key and score the exposure — ${LIVE_CHAIN_COUNT} chains, three exposure families, no wallet connection.`,
    href: '/scan',
    cta: 'Open the scanner',
  },
  {
    step: '02',
    title: 'Migrate',
    body: 'Sweep an entire EVM wallet — native, ERC-20 and NFTs — into a post-quantum account in one EIP-7702 transaction, or keep the address and harden it in place.',
    href: '/migrate',
    cta: 'Migrate a wallet',
  },
  {
    step: '03',
    title: 'Start clean',
    body: 'New accounts are post-quantum from the first block, with a counterfactual address safe to fund before it is even deployed.',
    href: '/start',
    cta: 'Create an account',
  },
];

const VERIFIERS = [
  {
    name: 'Winternitz + Merkle',
    standard: 'WOTS+, keccak256',
    role: 'Default. Same construction family as Ethereum’s leanSig. 2,304-byte signatures.',
    state: 'shipped' as const,
  },
  {
    name: 'Lamport + Merkle',
    standard: 'Hash-based, keccak256',
    role: 'The original verifier, still deployed. Simpler to audit, 10x larger on the wire.',
    state: 'shipped' as const,
  },
  {
    name: 'Falcon-512',
    standard: 'FIPS 206',
    role: 'Blocked: FIPS 206 is still a draft, expected final late 2026. Pluggable when it lands.',
    state: 'blocked' as const,
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <Hero />

      {/* Readings — an instrument strip, not a row of cards. */}
      <Reveal>
        <section
          aria-label="Measured threat readings"
          className="grid border-y border-rule sm:grid-cols-2 lg:grid-cols-4"
        >
          {READINGS.map((r, i) => (
            <div
              key={r.label}
              className={`px-5 py-6 ${i > 0 ? 'border-t border-rule sm:border-t-0 sm:border-l' : ''} ${
                i === 2 ? 'lg:border-l' : ''
              } ${i % 2 === 0 ? 'sm:border-l-0 lg:border-l' : ''} ${i === 0 ? 'lg:border-l-0' : ''}`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="tabular text-2xl text-white">{r.value}</span>
                <span className="tabular text-[11px] text-accent">{r.unit}</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{r.label}</p>
              <p className="tabular mt-2 text-[10px] text-zinc-600">{r.source}</p>
            </div>
          ))}
        </section>
      </Reveal>

      <ChainsSection />

      {/* What the verifier upgrade actually bought — measured, not asserted. */}
      <VerifierComparison />

      {/* How it works */}
      <Reveal>
        <section id="how" className="scroll-mt-20 border-t border-rule py-20 sm:py-28">
          <h2 className="text-[1.7rem] font-semibold tracking-tight sm:text-4xl">
            Scan, migrate, start clean
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
            Measure the exposure, move an existing wallet behind a post-quantum signature, or begin
            on an account that never had a vulnerable key to begin with.
          </p>
          <div className="mt-10 grid gap-px overflow-hidden border border-rule bg-rule lg:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.step} className="group flex flex-col bg-panel p-6">
                <div className="tabular text-[11px] text-accent">{tier.step}</div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{tier.title}</h3>
                <p className="mt-2.5 flex-1 text-[13px] leading-relaxed text-zinc-400">
                  {tier.body}
                </p>
                <Link
                  href={tier.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-bright transition-all duration-150 group-hover:gap-2.5"
                >
                  {tier.cta} <span aria-hidden>→</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Hybrid circuit-breaker */}
      <Reveal>
        <section className="grid gap-10 border-t border-rule py-20 sm:py-28 lg:grid-cols-2">
          <div>
            <h2 className="text-[1.7rem] font-semibold tracking-tight sm:text-3xl">
              A circuit-breaker, not a rip-and-replace
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
              ECDSA keeps signing routine activity, so the wallet still feels like the wallet. The
              moment an operation gets dangerous — a large transfer, a token approval, an account
              change — a second post-quantum signature is required. Break the ECDSA key and the gate
              still holds.
            </p>
            <ul className="mt-6 space-y-2.5 text-[13px] text-zinc-300">
              {[
                'Large native transfers above a configurable threshold',
                'Token approvals (approve / setApprovalForAll)',
                'Administrative changes: key rotation, verifier swap, owner change',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1 w-1 shrink-0 bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-lg border-l-2 border-amber-500/40 pl-3 text-[12px] leading-relaxed text-zinc-500">
              Fully quantum-safe means removing ECDSA from the trust model entirely — sweeping into
              an account where the post-quantum key is sole authority. Keeping your old address is
              always transitional, because an EIP-7702 delegation stays revocable by the ECDSA key.
            </p>
          </div>

          <div className="panel h-fit p-6">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                Pluggable verifiers
              </span>
              <span className="tabular text-[10px] text-zinc-600">IPQCVerifier</span>
            </div>
            <div className="mt-4 divide-y divide-rule">
              {VERIFIERS.map((v) => (
                <div key={v.name} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-white">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          v.state === 'shipped' ? 'bg-accent' : 'bg-zinc-600'
                        }`}
                        aria-hidden
                      />
                      {v.name}
                    </span>
                    <span className="tabular text-[10px] text-zinc-500">{v.standard}</span>
                  </div>
                  <div className="mt-1.5 pl-3.5 text-[12px] leading-relaxed text-zinc-400">
                    {v.role}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <RoadmapSection />

      <PartnerCta />
    </div>
  );
}
