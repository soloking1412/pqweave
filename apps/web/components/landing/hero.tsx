'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';

const EASE = [0, 0, 0.2, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();
  const entrance = reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } };
  const at = (delay: number) => ({ duration: 0.5, ease: EASE, delay });

  return (
    <section className="pt-20 pb-16 sm:pt-28 sm:pb-24">
      <motion.div
        {...entrance}
        transition={at(0)}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Q-Day is estimated at 2029–2030. Migration takes years.
      </motion.div>

      <motion.h1
        {...entrance}
        transition={at(0.08)}
        className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
      >
        Find out if your wallet is{' '}
        <span className="bg-gradient-to-r from-brand-bright to-accent bg-clip-text text-transparent">
          quantum-exposed
        </span>
        .
      </motion.h1>

      <motion.p
        {...entrance}
        transition={at(0.16)}
        className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300"
      >
        Shor&apos;s algorithm will let quantum computers forge the signatures behind nearly every
        blockchain. Scan any address — across 11 chains — to see if its public key is already
        exposed, then migrate EVM wallets into a post-quantum account in one click.
      </motion.p>

      <motion.div
        {...entrance}
        transition={at(0.24)}
        className="mt-9 flex flex-wrap items-center gap-3"
      >
        <Link
          href="/scan"
          className="rounded-xl bg-brand px-5 py-3 font-medium text-white shadow-[0_0_40px_-8px_rgba(124,108,255,0.85)] transition hover:bg-brand-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-[#06060a]"
        >
          Scan a wallet free
        </Link>
        <Link
          href="/#how"
          className="rounded-xl border border-white/10 px-5 py-3 font-medium text-zinc-200 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06060a]"
        >
          How it works
        </Link>
      </motion.div>
    </section>
  );
}
