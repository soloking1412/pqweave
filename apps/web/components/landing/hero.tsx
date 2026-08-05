'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { VerifierDiagram } from '@/components/landing/verifier-diagram';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';

const EASE = [0.16, 0.84, 0.44, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();
  const rise = reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };
  const at = (delay: number) => ({ duration: 0.45, ease: EASE, delay });

  return (
    <section className="grid items-center gap-12 pt-16 pb-16 sm:pt-24 sm:pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
      <div>
        <motion.div
          {...rise}
          transition={at(0)}
          className="tabular flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-500"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-zinc-300">GOOGLE QUANTUM AI · MAR 2026</span>
          <span className="text-zinc-700">/</span>
          <span>~1,200 logical qubits to break secp256k1</span>
        </motion.div>

        <motion.h1
          {...rise}
          transition={at(0.06)}
          className="mt-5 max-w-2xl text-[2.1rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl"
        >
          Your public key is already published.
          <span className="mt-1.5 block text-zinc-500">
            Shor&apos;s algorithm turns it into your private key.
          </span>
        </motion.h1>

        <motion.p
          {...rise}
          transition={at(0.12)}
          className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-400"
        >
          Every transaction you have signed put your public key on chain. PQWeave measures that
          exposure across {LIVE_CHAIN_COUNT} chains, and moves EVM wallets behind a post-quantum
          signature a quantum computer cannot forge. Bitcoin, Solana and Stellar get the honest
          version of the same idea — not a promise the protocol cannot keep.
        </motion.p>

        <motion.div
          {...rise}
          transition={at(0.18)}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <Link
            href="/scan"
            className="rounded-[7px] bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-[#06060a]"
          >
            Scan an address
          </Link>
          <Link
            href="/#how"
            className="rounded-[7px] border border-rule-strong px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors duration-150 hover:border-white/30 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06060a]"
          >
            How it works
          </Link>
          <span className="tabular text-[11px] text-zinc-600">no wallet connection</span>
        </motion.div>
      </div>

      <motion.div
        initial={reduce ? undefined : { opacity: 0, y: 18 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={at(0.22)}
      >
        <VerifierDiagram />
      </motion.div>
    </section>
  );
}
