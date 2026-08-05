import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion';

export const metadata: Metadata = {
  title: 'Security model — PQWeave',
  description:
    'Exactly what PQWeave protects against, the cryptographic basis, the security tiers, and the residual risks. Deliberately honest — contracts are not audited yet.',
};

const TIERS = [
  {
    mode: 'Hybrid',
    ecdsa: 'Routine ops',
    pqc: 'Sensitive ops',
    use: 'Daily wallets — defense-in-depth',
  },
  {
    mode: 'pqcOnly',
    ecdsa: 'Every op',
    pqc: 'Every op',
    use: 'High-value wallets',
  },
  {
    mode: 'Sole authority',
    ecdsa: 'Never',
    pqc: 'Every op',
    use: 'Vaults — the only fully quantum-safe mode',
  },
];

const RESIDUAL = [
  {
    title: 'Not audited yet',
    body: 'A custom account plus a custom verifier is exactly where implementation bugs live. An independent audit is planned before mainnet — until then, testnets only. No amount of extra code substitutes for review.',
  },
  {
    title: '"Harden in place" is transitional',
    body: 'Delegating an existing EOA (EIP-7702) keeps the original ECDSA key’s protocol-level authority. True safety requires migrating funds into a sole-authority account, not hardening the old address.',
  },
  {
    title: 'Hybrid mode is not absolute',
    body: 'Sub-threshold operations remain ECDSA-authorized. Use pqcOnly or sole authority for full post-quantum coverage.',
  },
  {
    title: 'Timeline is a projection',
    body: '“Q-Day” estimates (2029–2030) are forecasts, not facts. The concrete present risk is exposed public keys being harvested today to be broken later.',
  },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Status: unaudited — testnets only
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Security model</h1>
      <p className="mt-3 text-zinc-400">
        This page is deliberately honest about what PQWeave does and does not protect against. The
        contracts and the post-quantum verifier are custom code that has not had an independent
        audit. Do not secure real funds with it yet.
      </p>

      <Reveal className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">What it defends against</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          A quantum computer running Shor&apos;s algorithm can derive an ECDSA private key from the
          public key it exposes. Every EVM account reveals its public key the moment it sends a
          transaction, so funds are harvestable today (&quot;harvest now, decrypt later&quot;) and
          spendable once a sufficient quantum computer exists. PQWeave moves the authority for
          spending behind a post-quantum signature that such a computer cannot forge.
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">The cryptographic basis</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          The default verifier is hash-based — Lamport one-time signatures inside a Merkle tree, an
          XMSS-style construction. Its security rests only on the preimage and collision resistance
          of keccak256:
        </p>
        <ul className="mt-4 space-y-2 text-sm text-zinc-300">
          <li className="flex gap-2">
            <span className="text-accent">→</span> Shor&apos;s algorithm does not break hash
            functions.
          </li>
          <li className="flex gap-2">
            <span className="text-accent">→</span> Grover&apos;s algorithm only halves the security
            level, so keccak256 keeps roughly 128-bit strength against a quantum attacker.
          </li>
          <li className="flex gap-2">
            <span className="text-accent">→</span> No lattice or discrete-log assumption. The
            verifier is pluggable (IPQCVerifier), so NIST lattice schemes (Falcon, ML-DSA) can be
            swapped in.
          </li>
        </ul>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">
          Security tiers (choose per account)
        </h2>
        <div className="mt-4 overflow-hidden rounded-panel border border-rule">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">ECDSA</th>
                <th className="px-4 py-3 font-medium">Post-quantum</th>
                <th className="px-4 py-3 font-medium">Use for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {TIERS.map((tier) => (
                <tr key={tier.mode}>
                  <td className="px-4 py-3 font-medium text-white">{tier.mode}</td>
                  <td className="px-4 py-3 text-zinc-400">{tier.ecdsa}</td>
                  <td className="px-4 py-3 text-zinc-400">{tier.pqc}</td>
                  <td className="px-4 py-3 text-zinc-400">{tier.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Sole authority is the only fully quantum-safe configuration: the ECDSA key is removed from
          the trust model entirely, so a quantum break of it grants nothing. The web migration flow
          defaults to this mode.
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">
          Residual risks — what is not solved
        </h2>
        <div className="mt-4 grid gap-3">
          {RESIDUAL.map((risk) => (
            <div key={risk.title} className="rounded-panel border border-rule bg-panel p-5">
              <h3 className="text-base font-semibold text-white">{risk.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{risk.body}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">
          What &quot;ready for real funds&quot; requires
        </h2>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-300">
          <li className="flex gap-3">
            <span className="font-mono text-zinc-500">1</span> One or more independent security
            audits, ideally with formal verification of the verifier.
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-500">2</span> A public bug bounty and time running
            in production with bounded value.
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-500">3</span> Standardization (an ERC) so the wider
            ecosystem reviews the design, on the path to native protocol-level post-quantum support.
          </li>
        </ol>
        <p className="mt-6 text-sm text-zinc-500">
          Found a vulnerability? Email{' '}
          <a
            href="mailto:security@pqweave.com"
            className="text-brand-bright underline underline-offset-2"
          >
            security@pqweave.com
          </a>{' '}
          rather than opening a public issue. Or{' '}
          <Link href="/scan" className="text-brand-bright underline underline-offset-2">
            scan a wallet
          </Link>{' '}
          to see your own exposure.
        </p>
      </Reveal>
    </div>
  );
}
