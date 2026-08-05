import Link from 'next/link';
import { ChainsSection } from '@/components/landing/chains-section';
import { Hero } from '@/components/landing/hero';
import { PartnerCta } from '@/components/landing/partner-cta';
import { RoadmapSection } from '@/components/landing/roadmap-section';
import { Reveal } from '@/components/motion';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';

const TIERS = [
  {
    step: '01',
    title: 'Scan',
    body: `Check whether an address has revealed its public key and score its quantum risk — across ${LIVE_CHAIN_COUNT} chains and three exposure families. No wallet connection required.`,
    href: '/scan',
    cta: 'Open the scanner',
  },
  {
    step: '02',
    title: 'Migrate in one click',
    body: 'Sweep an entire wallet — native, ERC-20, and NFTs — into a quantum-safe account in a single EIP-7702 transaction. One signature, same address kept or left behind.',
    href: '/migrate',
    cta: 'Migrate a wallet',
  },
  {
    step: '03',
    title: 'Create',
    body: 'New users start on a fresh account that is quantum-safe from block one, whose public key is never exposed as a vulnerable EOA. Hybrid ECDSA + post-quantum from day one.',
    href: '/migrate',
    cta: 'Create an account',
  },
];

const SCHEMES = [
  {
    name: 'Lamport + Merkle',
    standard: 'Hash-based (FIPS 205 family)',
    role: 'Default on-chain gate — keccak256 only, no lattice assumptions',
  },
  {
    name: 'Falcon-512',
    standard: 'FIPS 206',
    role: 'Compact lattice verifier (ETHFALCON), pluggable per account',
  },
  {
    name: 'ML-DSA (Dilithium)',
    standard: 'FIPS 204',
    role: 'NIST primary signature standard, available in the SDK',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <Hero />

      {/* Threat numbers */}
      <Reveal>
        <section className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
          {[
            {
              stat: '~1,200',
              label:
                'Logical qubits Google Quantum AI estimates would break secp256k1, in minutes of runtime',
            },
            {
              stat: 'Every spend',
              label: 'A public key is recoverable from — or embedded in — your address',
            },
            {
              stat: `${LIVE_CHAIN_COUNT} chains`,
              label: 'Scanned today across all three exposure families, with more landing soon',
            },
          ].map((item) => (
            <div key={item.label} className="bg-[#0b0b12] p-6">
              <div className="text-2xl font-semibold tracking-tight text-white">{item.stat}</div>
              <div className="mt-2 text-sm leading-relaxed text-zinc-400">{item.label}</div>
            </div>
          ))}
        </section>
      </Reveal>

      <ChainsSection />

      {/* How it works */}
      <Reveal>
        <section id="how" className="scroll-mt-20 py-20 sm:py-28">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Scan, migrate, create
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Understand your exposure, move an existing wallet to safety in one transaction, or start
            new on an account that is quantum-safe from the first block.
          </p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.step}
                className="group flex flex-col rounded-2xl border border-white/10 bg-[#0b0b12] p-6 transition hover:border-brand/40"
              >
                <div className="font-mono text-sm text-brand-bright">{tier.step}</div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{tier.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-400">{tier.body}</p>
                <Link
                  href={tier.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-bright transition group-hover:gap-2.5"
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
        <section className="grid gap-10 rounded-2xl border border-white/10 bg-[#0b0b12] p-8 sm:p-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              A hybrid circuit-breaker, not a rip-and-replace
            </h2>
            <p className="mt-4 text-zinc-400">
              ECDSA keeps signing routine activity for a familiar experience. The moment an
              operation gets dangerous — a large transfer, a token approval, an account change —
              PQWeave requires a second, post-quantum signature. Even if the ECDSA key is broken, an
              attacker cannot pass the gate.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-300">
              {[
                'Large native transfers above a configurable threshold',
                'Token approvals (approve / setApprovalForAll)',
                'Administrative changes: key rotation, verifier swap, owner change',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-6">
            <div className="text-sm font-medium text-zinc-300">
              Pluggable post-quantum verifiers
            </div>
            <div className="mt-4 divide-y divide-white/5">
              {SCHEMES.map((scheme) => (
                <div key={scheme.name} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{scheme.name}</span>
                    <span className="font-mono text-xs text-zinc-500">{scheme.standard}</span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">{scheme.role}</div>
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
