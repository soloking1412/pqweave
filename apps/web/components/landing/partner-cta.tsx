'use client';

import Link from 'next/link';
import { Reveal } from '@/components/motion';

export function PartnerCta() {
  return (
    <Reveal className="my-20 sm:my-28">
      <section className="overflow-hidden rounded-panel border border-brand/20 bg-gradient-to-br from-brand/15 via-[#111113] to-[#111113] p-8 sm:p-12">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Build the migration layer with us.
        </h2>
        <p className="mt-4 max-w-2xl text-zinc-300">
          Wallets, exchanges, and custodians: integrate quantum-safe detection and migration through
          the PQWeave SDK and partner APIs. We&apos;re onboarding launch partners now.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/partners"
            className="rounded-control bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            Become a launch partner
          </Link>
          <Link
            href="/scan"
            className="rounded-control border border-rule px-5 py-3 font-medium text-zinc-200 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            Try the scanner
          </Link>
        </div>
      </section>
    </Reveal>
  );
}
