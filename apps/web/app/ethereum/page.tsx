import Link from 'next/link';
import type { Metadata } from 'next';
import { EthereumReadinessClient } from './readiness-client';

export const metadata: Metadata = {
  title: 'Ethereum migration readiness — PQWeave',
  description:
    'Review an Ethereum address and prepare for a separate account with post-quantum authorization. Research and testnet tooling; mainnet transfers remain disabled.',
};

export default function EthereumPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
      <p className="tabular text-xs uppercase tracking-widest text-caution">
        Ethereum / research & testnet
      </p>
      <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        A new authority for your next account.
      </h1>
      <p className="mt-6 max-w-2xl leading-relaxed text-ink-2">
        Start with your public address. Review exposure and the assets we can see, then prepare a
        move to a separate smart account whose owner policy requires a post-quantum signature.
      </p>
      <div className="mt-8 border-l-2 border-caution bg-caution/5 p-5 text-sm leading-relaxed text-caution">
        Mainnet transfers are disabled. The local test suite covers migration, spending and key
        rotation. Independent cryptographic review and a complete user recovery workflow are still
        required before real funds can use this account.
      </div>
      <div className="mt-10">
        <EthereumReadinessClient />
      </div>
      <section
        className="mt-14 grid gap-8 border-t border-rule pt-8 sm:grid-cols-3"
        aria-label="Ethereum migration approach"
      >
        {[
          [
            '01 / Inventory',
            'Know what moves.',
            'ETH and explicitly listed tokens can be planned. NFTs, staking, DeFi positions, approvals, exchange deposit routes and administrator roles need their own checks.',
          ],
          [
            '02 / Authority',
            'Use a separate account.',
            'The destination has no ECDSA owner. Keeping your old address with EIP-7702 leaves its original key able to replace the guard.',
          ],
          [
            '03 / Recovery',
            'Protect the signing history.',
            'Our experimental hash-based keys are one-time keys. A seed backup alone cannot tell which signatures were already exposed. Reservations must be recorded before signing.',
          ],
        ].map(([label, title, body]) => (
          <div key={label}>
            <p className="tabular text-xs text-accent">{label}</p>
            <h2 className="mt-3 text-xl font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">{body}</p>
          </div>
        ))}
      </section>
      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="text-2xl font-semibold">
          Account protection is one part of the transition.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-dim">
          Ethereum&apos;s consensus, bridges and token administrators have separate cryptographic
          dependencies. The custom Lamport and Winternitz verifiers here are experimental, not
          NIST-approved implementations. New protocol proposals are tracked as research until
          activated and verified.
        </p>
        <div className="mt-6 flex flex-wrap gap-5 text-sm">
          <a href="https://pq.ethereum.org/" className="text-accent underline underline-offset-4">
            Ethereum Foundation research
          </a>
          <a
            href="https://eips.ethereum.org/EIPS/eip-7702"
            className="text-accent underline underline-offset-4"
          >
            EIP-7702 authority model
          </a>
          <Link href="/migrate" className="text-accent underline underline-offset-4">
            Open the Sepolia prototype →
          </Link>
        </div>
      </section>
    </div>
  );
}
