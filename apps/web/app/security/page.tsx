import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security model — PQWeave',
  description:
    'Bitcoin preparation and experimental Ethereum account authorization: capabilities, boundaries and release requirements.',
};

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <p className="tabular text-xs uppercase tracking-widest text-amber-300">
        Security / release boundaries
      </p>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Know what protects your funds.
      </h1>
      <p className="mt-5 leading-relaxed text-zinc-300">
        The Ethereum contracts and custom signature verifiers have not had an independent audit.
        Mainnet execution is disabled. Local test results establish specific behavior; they do not
        certify a custody system.
      </p>
      <section className="mt-10 border-t border-rule pt-7">
        <h2 className="text-xl font-semibold">Bitcoin: preparation with your signer</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          The kit verifies funding data, prepares bounded unsigned transactions and compares the
          signed result against your reviewed plan. Your wallet must verify and sign. Standard
          Bitcoin transfers reduce public-key exposure; they do not add a post-quantum signature.
          The hosted API does not broadcast.
        </p>
        <Link
          href="/bitcoin/research"
          className="mt-4 inline-flex min-h-11 items-center text-accent underline underline-offset-4"
        >
          Bitcoin research and limitations →
        </Link>
      </section>
      <section className="mt-10 border-t border-rule pt-7">
        <h2 className="text-xl font-semibold">Ethereum: experimental account authorization</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          A separate account with a zero ECDSA owner requires its post-quantum verifier for every
          operation. Ethereum consensus, bridges, token administrators and your device remain
          separate dependencies. An EIP-7702 address retains its original ECDSA authority even when
          delegated code claims otherwise.
        </p>
        <div className="mt-5 grid gap-3">
          {[
            [
              'Hybrid account',
              'ECDSA authorizes routine operations. Sensitive operations also require the PQ signature.',
            ],
            [
              'Both signatures on every operation',
              'The pqcOnly setting requires both signatures when an ECDSA owner is present.',
            ],
            [
              'Separate account with sole PQ authority',
              'No ECDSA owner at the account level. This is the recommended testnet destination, subject to cryptographic and operational review.',
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-panel border border-rule bg-panel p-5">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
        <Link
          href="/ethereum"
          className="mt-4 inline-flex min-h-11 items-center text-accent underline underline-offset-4"
        >
          Ethereum readiness and research →
        </Link>
      </section>
      <section className="mt-10 border-t border-rule pt-7">
        <h2 className="text-xl font-semibold">Signing history is part of the key</h2>
        <p className="mt-3 leading-relaxed text-zinc-400">
          Lamport and Winternitz keys are one-time keys. Persist a reservation before signing,
          including signatures that are never submitted or confirmed. A seed file, a stale backup or
          the on-chain usage bitmap alone cannot safely restore that history. Rotate before the
          current tree is exhausted.
        </p>
        <p className="mt-3 leading-relaxed text-zinc-400">
          The Node journal supports one trusted local host. It does not prevent disk rollback or
          coordinate copied keys on other devices. A complete browser and hardware recovery workflow
          remains a production requirement.
        </p>
      </section>
      <section className="mt-10 border-t border-rule pt-7">
        <h2 className="text-xl font-semibold">Before real funds</h2>
        <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>
            Independent cryptographic and contract review. These custom Keccak constructions are not
            NIST-approved implementations.
          </li>
          <li>
            Recovery and rotation drills, reviewed deployment hashes, wallet compatibility, token
            reconciliation and dependency remediation.
          </li>
          <li>
            Monitoring, incident procedures and a bounded pilot approved against a specific release.
          </li>
        </ul>
        <p className="mt-6 text-sm text-zinc-400">
          Report vulnerabilities to{' '}
          <a
            href="mailto:security@pqweave.com"
            className="text-accent underline underline-offset-4"
          >
            security@pqweave.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
