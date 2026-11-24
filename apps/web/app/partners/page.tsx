import type { Metadata } from 'next';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';
import { PartnerForm } from './partner-form';

export const metadata: Metadata = {
  title: 'Partners — PQWeave',
  description:
    'A post-quantum migration planning kit for wallets, exchanges, and custodians. Your signer keeps the keys.',
};

const VALUE = [
  {
    title: 'Fleet inventory',
    body: `Assess public-key exposure and known balances across ${LIVE_CHAIN_COUNT} scanned chains. Keep unsupported assets and unknown signing policies visible.`,
  },
  {
    title: 'Chain-specific plans',
    body: 'Route EVM, Algorand, Bitcoin, and other accounts to the protection each chain can enforce. Export plans for your existing signer and approval process.',
  },
  {
    title: 'Evidence and controls',
    body: 'Review destination control, missing assets, simulation, approvals, and post-migration reconciliation before a production wave.',
  },
];

export default function PartnersPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-ink/5 px-3 py-1 text-xs text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Read-only partner pilots
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
          Give every wallet a migration plan.
        </h1>
        <p className="mt-3 text-ink-dim">
          Add one planning workflow to your wallet or custody system. PQWeave maps chain
          capabilities and prepares evidence; your team retains keys, policy, and signing. Start
          with a read-only cohort and a testnet integration.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-5">
          {VALUE.map((item) => (
            <li key={item.title} className="rounded-panel border border-rule bg-panel p-5">
              <h2 className="text-[1rem] font-semibold text-ink">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="rounded-panel border border-rule bg-panel p-6 sm:p-8">
          <PartnerForm />
        </div>
      </div>
      <section className="mt-10 rounded-panel border border-rule bg-panel p-6 sm:p-8">
        <div className="tabular text-xs uppercase tracking-widest text-accent">
          Integration surface
        </div>
        <h2 className="mt-3 text-xl font-semibold">Plan a wallet fleet without sending keys</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
          The stateless <code className="text-accent">POST /api/kit</code> endpoint accepts up to 50
          public account records per request and returns route, checks, limitations, and source
          links. It plans from the facts you provide; your system must verify balances, signer
          policy, and destination control. The same route selector is exported as
          <code className="text-accent"> @pqweave/sdk/kit</code>.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-control border border-rule bg-base p-4 text-xs leading-relaxed text-ink">
          {JSON.stringify(
            {
              chain: 'algorand',
              address: 'PUBLIC_ACCOUNT_ADDRESS',
              exposure: 'unknown',
              currentAuthority: 'unknown',
            },
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  );
}
