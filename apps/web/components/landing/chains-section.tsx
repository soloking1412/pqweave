'use client';

import { Reveal, StaggerGroup, StaggerItem } from '@/components/motion';
import { type DirectoryChain, DIRECTORY_CHAINS, LIVE_CHAIN_COUNT } from '@/lib/chains-directory';

export function ChainsSection() {
  return (
    <section id="chains" className="scroll-mt-20 py-20 sm:py-28">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Every chain that holds value is at risk
            </h2>
            <p className="mt-3 max-w-2xl text-zinc-400">
              The scanner is live across {LIVE_CHAIN_COUNT} chains spanning all three exposure
              families — recoverable-from-signature, hash-behind-address, and address-is-the-key.
              More land soon.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {LIVE_CHAIN_COUNT} live
          </div>
        </div>
      </Reveal>

      <StaggerGroup className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {DIRECTORY_CHAINS.map((chain) => (
          <StaggerItem key={chain.ticker} className="h-full">
            <ChainTile chain={chain} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}

function ChainTile({ chain }: { chain: DirectoryChain }) {
  const soon = chain.status === 'soon';
  return (
    <div
      className={`group h-full rounded-2xl border border-white/10 bg-[#0b0b12] p-4 transition duration-150 ease-out hover:-translate-y-0.5 hover:border-white/25 ${
        soon ? 'opacity-60 hover:opacity-90' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-[11px] font-bold"
          style={{ backgroundColor: `${chain.accent}1f`, color: chain.accent }}
        >
          {chain.ticker.slice(0, 4)}
        </div>
        {soon ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
            Soon
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live
          </span>
        )}
      </div>
      <div className="mt-3 text-sm font-medium text-white">{chain.name}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{chain.family}</div>
    </div>
  );
}
