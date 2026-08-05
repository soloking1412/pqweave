'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Reveal, StaggerGroup, StaggerItem } from '@/components/motion';
import {
  type DirectoryChain,
  DIRECTORY_CHAINS,
  EXPOSURE_CEILING,
  type ExposureFamily,
  LIVE_CHAIN_COUNT,
  PLANNED_KIND,
  PLANNED_PRECEDENT,
  PROTECTED_CHAIN_COUNT,
  PROTECTION_LABEL,
} from '@/lib/chains-directory';

const FAMILIES: { id: ExposureFamily; label: string }[] = [
  { id: 'recoverable', label: 'Recoverable from signature' },
  { id: 'first-spend', label: 'Hidden until first spend' },
  { id: 'address-is-key', label: 'Address is the key' },
];

export function ChainsSection() {
  const [family, setFamily] = useState<ExposureFamily | null>(null);
  const shown = family ? DIRECTORY_CHAINS.filter((c) => c.exposure === family) : DIRECTORY_CHAINS;

  return (
    <section id="chains" className="scroll-mt-20 border-t border-rule py-20 sm:py-28">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-[1.7rem] font-semibold tracking-tight sm:text-4xl">
              What a chain lets you do about it
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
              Scanning and protecting are different problems. How a chain publishes public keys
              decides which fix is even possible — so the work in progress below is the shape the
              cryptography allows, not a roadmap we invented.
            </p>
          </div>
          <dl className="tabular flex gap-6 text-[11px]">
            <div>
              <dt className="text-zinc-500">Scanning</dt>
              <dd className="mt-0.5 text-lg text-white">{LIVE_CHAIN_COUNT}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Protection shipped</dt>
              <dd className="mt-0.5 text-lg text-accent">{PROTECTED_CHAIN_COUNT}</dd>
            </div>
          </dl>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-8 flex flex-wrap gap-2">
          <FilterChip active={family === null} onClick={() => setFamily(null)}>
            All chains
          </FilterChip>
          {FAMILIES.map((f) => (
            <FilterChip key={f.id} active={family === f.id} onClick={() => setFamily(f.id)}>
              {f.label}
            </FilterChip>
          ))}
        </div>
        {family ? (
          <p className="mt-4 max-w-3xl border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed text-zinc-400">
            {EXPOSURE_CEILING[family]}
          </p>
        ) : null}
      </Reveal>

      <StaggerGroup
        key={family ?? 'all'}
        className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {shown.map((chain) => (
          <StaggerItem key={chain.ticker} className="h-full">
            <ChainTile chain={chain} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright ${
        active
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-rule text-zinc-400 hover:border-rule-strong hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function ChainTile({ chain }: { chain: DirectoryChain }) {
  const reduce = useReducedMotion();
  const building = chain.protection === 'building';

  return (
    <motion.article
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ duration: 0.15, ease: [0.16, 0.84, 0.44, 1] }}
      className="group flex h-full flex-col rounded-[3px] border border-rule bg-panel p-4 transition-colors duration-150 hover:border-rule-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="tabular flex h-7 w-9 items-center justify-center rounded-[2px] text-[10px] font-bold"
            style={{ backgroundColor: `${chain.accent}1a`, color: chain.accent }}
          >
            {chain.ticker}
          </span>
          <div>
            <div className="text-[13px] font-medium leading-tight text-white">{chain.name}</div>
            <div className="tabular mt-0.5 text-[10px] text-zinc-600">{chain.scheme}</div>
          </div>
        </div>

        {/* Scan state is a signal, not a badge — a dot reads faster in a grid. */}
        <span
          className="tabular flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-wide"
          title={chain.scan === 'live' ? 'Scanner is live' : 'Scanner not yet available'}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              chain.scan === 'live' ? 'bg-emerald-400' : 'bg-zinc-600'
            }`}
          />
          <span className={chain.scan === 'live' ? 'text-emerald-300/90' : 'text-zinc-600'}>
            scan
          </span>
        </span>
      </div>

      {/* Always the chain-specific note: nine tiles repeating one generic
          sentence reads as filler and hides the reason each chain differs. */}
      <p className="mt-3 flex-1 text-[12px] leading-relaxed text-zinc-500">{chain.note}</p>

      <div className="mt-3 flex items-center gap-2 border-t border-rule pt-2.5">
        {building ? (
          <BuildingIndicator />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        )}
        <span className={`text-[11px] font-medium ${building ? 'text-zinc-300' : 'text-accent'}`}>
          {building
            ? PROTECTION_LABEL[PLANNED_KIND[chain.exposure]]
            : PROTECTION_LABEL[chain.protection]}
        </span>
        <span className="tabular ml-auto text-[10px] text-zinc-600">
          {building ? PLANNED_PRECEDENT[chain.exposure] : 'shipped'}
        </span>
      </div>
    </motion.article>
  );
}

/**
 * "Building" is an active state, so it gets motion a static badge would not —
 * the point is that this work is under way, not parked behind a date.
 */
function BuildingIndicator() {
  const reduce = useReducedMotion();
  if (reduce) return <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden />;
  return (
    <motion.span
      className="h-1.5 w-1.5 rounded-full bg-zinc-500"
      aria-hidden
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
