import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal, StaggerGroup, StaggerItem } from '@/components/motion';

export const metadata: Metadata = {
  title: 'Bitcoin Quantum Exposure — PQWeave',
  description:
    'How much bitcoin is already quantum-exposed: ~6 million BTC (about 30% of supply) sits in addresses that have revealed their public key. Sourced estimates, the exposure split, and what you can actually do about it.',
};

// Sourced, dated estimates. These are independent research figures, not a live
// on-chain count — labeled as such, matching the honesty of the main index.
const AS_OF = 'March 2026';
const SUPPLY = {
  structuralPct: 9.6, // P2PK + old formats (Glassnode)
  reusedPct: 20.6, // address reuse (Glassnode)
  safePct: 69.8, // never revealed a public key
};
const SEGMENTS = [
  {
    label: 'Exposed — old formats (P2PK)',
    pct: SUPPLY.structuralPct,
    coins: '~1.92M BTC',
    color: 'bg-rose-500',
    swatch: 'bg-rose-400',
    body: 'Ancient pay-to-public-key outputs — including coins widely attributed to Satoshi — publish the public key directly. These can never be un-exposed; only a protocol upgrade can protect them.',
  },
  {
    label: 'Exposed — address reuse',
    pct: SUPPLY.reusedPct,
    coins: '~4.12M BTC',
    color: 'bg-orange-500',
    swatch: 'bg-orange-400',
    body: 'Addresses that received again after their first spend. The spend revealed the public key, and every coin still sitting there is exposed. This is the part individual holders can act on.',
  },
  {
    label: 'Not yet exposed',
    pct: SUPPLY.safePct,
    coins: '~13.9M BTC',
    color: 'bg-emerald-500',
    swatch: 'bg-emerald-400',
    body: 'Held in addresses that have never spent, so the public key is still hidden behind its hash. Safe today — and stays safe only if the address is never reused and is evacuated before it must spend on Q-Day.',
  },
];

const SOURCES = [
  {
    name: 'Glassnode',
    claim: '6.04M BTC (30.2% of supply) exposed; ~1.92M structural, ~4.12M via reuse.',
    href: 'https://cryptobriefing.com/bitcoin-quantum-risk-glassnode/',
  },
  {
    name: 'Coinbase advisory board',
    claim: '~7M BTC exposed, including cold-wallet coins.',
    href: 'https://www.spotedcrypto.com/bitcoin-quantum-exposure-coinbase-report-2026/',
  },
  {
    name: 'Google Quantum AI',
    claim: 'Breaking secp256k1 estimated at <1,200 logical qubits, minutes of runtime.',
    href: 'https://quantumai.google/static/site-assets/downloads/cryptocurrency-whitepaper.pdf',
  },
];

export default function BitcoinExposurePage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Bitcoin Quantum Exposure
      </span>
      <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
        About a third of all bitcoin has already revealed its public key.
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        A quantum computer running Shor&apos;s algorithm could derive a private key from an exposed
        public key. Roughly 6 million BTC sit in addresses that have already published theirs. No
        quantum computer can do this today, but the exposed keys are on-chain forever — harvestable
        now, breakable later. These are independent research estimates as of {AS_OF}, not a live
        count.
      </p>

      {/* Stacked supply bar */}
      <Reveal className="mt-12">
        <div className="rounded-2xl border border-white/10 bg-[#0b0b12] p-6 sm:p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Bitcoin supply by exposure</h2>
            <span className="text-xs text-zinc-500">of ~19.9M BTC · {AS_OF}</span>
          </div>
          <div className="mt-5 flex h-6 w-full overflow-hidden rounded-full">
            {SEGMENTS.map((seg) => (
              <div
                key={seg.label}
                className={`${seg.color} h-full`}
                style={{ width: `${seg.pct}%` }}
                title={`${seg.label}: ${seg.pct}%`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400">
            {SEGMENTS.map((seg) => (
              <div key={seg.label} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-sm ${seg.swatch}`} />
                {seg.label} · {seg.pct}% ({seg.coins})
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <StaggerGroup className="mt-6 grid gap-4 sm:grid-cols-3">
        {SEGMENTS.map((seg) => (
          <StaggerItem
            key={seg.label}
            className="rounded-2xl border border-white/10 bg-[#0b0b12] p-5"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-sm ${seg.swatch}`} />
              <span className="text-sm font-semibold text-white">{seg.coins}</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{seg.label}</div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{seg.body}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <Reveal className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">What you can actually do</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Bitcoin cannot be made quantum-safe at the app layer — that needs a protocol upgrade
          (BIP-360 / BIP-361, proposed but not activated). Until then, the honest moves are
          preparation, not a cure.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Link
            href="/scan?chain=bitcoin"
            className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:bg-white/5"
          >
            <div className="text-sm font-semibold text-white">Scan your addresses</div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
              Check which of your addresses have already revealed their public key.
            </p>
          </Link>
          <Link
            href="/protect/bitcoin"
            className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:bg-white/5"
          >
            <div className="text-sm font-semibold text-white">Build an evacuation kit</div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
              Pre-sign sweeps to a fresh address so you can move within minutes of a threat.
            </p>
          </Link>
          <Link
            href="/attest"
            className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:bg-white/5"
          >
            <div className="text-sm font-semibold text-white">Attest a post-quantum key</div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
              Bind your address to a post-quantum key on-chain, ready for a future migration path.
            </p>
          </Link>
        </div>
      </Reveal>

      <Reveal className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          The macro figures above are independent published estimates. They differ because they draw
          the boundary differently (some count only P2PK, others add every reused address), but all
          agree the exposed share is measured in millions of coins.
        </p>
        <ul className="mt-4 space-y-2.5">
          {SOURCES.map((source) => (
            <li key={source.name} className="flex items-start gap-2.5 text-sm text-zinc-300">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-zinc-100 hover:underline"
                >
                  {source.name}
                </a>{' '}
                — {source.claim}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-zinc-600">
          Estimates as of {AS_OF}. PQWeave does not endorse any single figure; the per-address
          result in our scanner is computed live and is verifiable.
        </p>
      </Reveal>

      <Reveal className="mt-12">
        <Link href="/exposure" className="text-sm font-medium text-brand-bright hover:underline">
          ← Back to the full Quantum Exposure Index
        </Link>
      </Reveal>
    </div>
  );
}
