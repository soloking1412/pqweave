'use client';

import { Reveal, StaggerGroup, StaggerItem } from '@/components/motion';

interface Product {
  title: string;
  status: string;
  live: boolean;
  body: string;
}

const PRODUCTS: Product[] = [
  {
    title: 'Exposure scanner',
    status: 'Live',
    live: true,
    body: 'Detect quantum-exposed public keys across 11 chains and all three exposure families. Free, instant, no wallet connection.',
  },
  {
    title: 'One-click migration',
    status: 'Live · EVM',
    live: true,
    body: 'Sweep an entire EVM wallet into a post-quantum account in a single EIP-7702 transaction — native, tokens, and NFTs at once.',
  },
  {
    title: 'Quantum-safe wallet',
    status: 'Building',
    live: false,
    body: 'A wallet that is post-quantum from the first block: hybrid ECDSA + hash-based keys, key rotation, and recovery built in.',
  },
  {
    title: 'Partner APIs',
    status: 'Building',
    live: false,
    body: 'Large-scale exposure and migration APIs for wallets, exchanges, and custodians to protect millions of users at once.',
  },
];

export function RoadmapSection() {
  return (
    <section id="building" className="scroll-mt-20 py-20 sm:py-28">
      <Reveal>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What we&apos;re building
        </h2>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Detection and EVM migration are live today. The wallet and partner APIs are next — the
          infrastructure layer for the whole ecosystem&apos;s migration.
        </p>
      </Reveal>

      <StaggerGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCTS.map((product) => (
          <StaggerItem key={product.title} className="h-full">
            <article className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#0b0b12] p-5 transition duration-150 ease-out hover:-translate-y-0.5 hover:border-white/20">
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  product.live
                    ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'bg-brand/10 text-brand-bright ring-1 ring-brand/30'
                }`}
              >
                {product.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                {product.status}
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{product.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{product.body}</p>
            </article>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}
