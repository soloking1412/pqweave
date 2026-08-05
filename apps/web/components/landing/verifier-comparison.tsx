'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Reveal } from '@/components/motion';

/**
 * Measured, not asserted. Every figure here comes from `VerifierGas.t.sol`,
 * which any reader can run. Bars are drawn to the real ratio rather than a
 * flattering one — Winternitz wins on both axes, but the calldata win is far
 * larger than the execution win, and the chart should show that.
 */
const METRICS = [
  {
    label: 'Signature size',
    unit: 'bytes',
    lamport: 24_736,
    winternitz: 2_304,
  },
  {
    label: 'Total gas, all in',
    unit: 'gas',
    lamport: 670_062,
    winternitz: 254_218,
  },
];

const EASE = [0.16, 0.84, 0.44, 1] as const;

export function VerifierComparison() {
  return (
    <section className="border-t border-rule py-20 sm:py-28">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="tabular text-[11px] uppercase tracking-[0.14em] text-accent">
              Shipped August 2026
            </div>
            <h2 className="mt-3 text-[1.7rem] font-semibold tracking-tight sm:text-4xl">
              The same security, an order of magnitude cheaper
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
              A Lamport signature has to transmit its one-time public key so the chain can rebuild
              the Merkle leaf. Winternitz derives that key by finishing each hash chain instead, so
              nothing but the chain values travel. Identical assumption — keccak256 preimage
              resistance, nothing lattice-based — at a tenth of the calldata.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-10 grid gap-px border border-rule bg-rule lg:grid-cols-2">
          {METRICS.map((metric, i) => (
            <MetricBars key={metric.label} metric={metric} index={i} />
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-6 grid gap-px border border-rule bg-rule sm:grid-cols-2">
          <Note
            tag="BIP-361"
            title="A second clock on every bitcoin address"
            body="Quantum exposure is a fact about your address. The proposed signature sunset is a policy that would freeze legacy outputs whether or not a key ever leaked. The draft does not resolve its own scope, so the scanner reports both readings rather than guessing one."
            href="/exposure/bitcoin"
            cta="See the phase timeline"
          />
          <Note
            tag="BIP-2198"
            title="A hazard we found in our own shipped code"
            body="BIP-360 was amended so a single-leaf script tree is anyone-can-spend on purpose, to stop wallets dropping a post-quantum fallback leaf. Our tree builder accepted one leaf, and a test asserted it was correct. Now a two-leaf minimum is enforced at both layers."
            href="/security"
            cta="Read the security model"
          />
        </div>
      </Reveal>
    </section>
  );
}

function MetricBars({ metric, index }: { metric: (typeof METRICS)[number]; index: number }) {
  const reduce = useReducedMotion();
  const factor = metric.lamport / metric.winternitz;

  return (
    <div className="bg-panel p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-white">{metric.label}</span>
        <span className="tabular text-[11px] text-accent">{factor.toFixed(1)}× smaller</span>
      </div>

      <div className="mt-5 space-y-3.5">
        <Bar
          name="Lamport"
          value={metric.lamport}
          unit={metric.unit}
          percent={100}
          tone="muted"
          delay={index * 0.08}
          reduce={!!reduce}
        />
        <Bar
          name="Winternitz"
          value={metric.winternitz}
          unit={metric.unit}
          percent={(metric.winternitz / metric.lamport) * 100}
          tone="accent"
          delay={index * 0.08 + 0.12}
          reduce={!!reduce}
        />
      </div>
    </div>
  );
}

function Bar({
  name,
  value,
  unit,
  percent,
  tone,
  delay,
  reduce,
}: {
  name: string;
  value: number;
  unit: string;
  percent: number;
  tone: 'muted' | 'accent';
  delay: number;
  reduce: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className={tone === 'accent' ? 'text-zinc-200' : 'text-zinc-500'}>{name}</span>
        <span className="tabular text-zinc-400">
          {value.toLocaleString('en-US')}
          <span className="ml-1 text-zinc-600">{unit}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[1px] bg-white/5">
        <motion.div
          className={`h-full rounded-[1px] ${tone === 'accent' ? 'bg-accent' : 'bg-white/20'}`}
          initial={{ width: reduce ? `${percent}%` : 0 }}
          whileInView={{ width: `${percent}%` }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: EASE, delay }}
        />
      </div>
    </div>
  );
}

function Note({
  tag,
  title,
  body,
  href,
  cta,
}: {
  tag: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="group flex flex-col bg-panel p-6">
      <span className="tabular text-[10px] uppercase tracking-[0.14em] text-brand-bright">
        {tag}
      </span>
      <h3 className="mt-2.5 text-[15px] font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-zinc-400">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-bright transition-all duration-150 group-hover:gap-2.5"
      >
        {cta} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
