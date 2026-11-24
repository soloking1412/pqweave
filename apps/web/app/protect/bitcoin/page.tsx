import type { Metadata } from 'next';
import Link from 'next/link';
import { BitcoinChecklistClient } from './checklist-client';
import { EvacuationClient } from './evacuation-client';
import { WalletScanClient } from './wallet-scan-client';

export const metadata: Metadata = {
  title: 'Bitcoin readiness kit — PQWeave',
  description:
    'Inspect Bitcoin public-key exposure, prepare an unsigned PSBT, and review a transaction for your own wallet to sign. Transitional exposure reduction with no key custody.',
};

const STEPS = [
  [
    'Inspect the coins you intend to move',
    'Review source history and spending conditions. Check fees and privacy before deciding to move. Combining outputs can link previously separate addresses.',
  ],
  [
    'Confirm a fresh destination in your wallet',
    'For the standard exposure-reduction route, use a never-used native SegWit address on the same network. Verify the destination on your signer. A scan cannot establish that you control an address.',
  ],
  [
    'Review and export the unsigned plan',
    'Check every input against its complete source transaction, then inspect the destination, amount, and fee. Import the PSBT into a compatible wallet; support varies by signer and output type.',
  ],
  [
    'Sign, verify, then broadcast',
    'Approve with your own wallet. Import the signed PSBT and compare it with the reviewed plan before broadcast. Track confirmation in your wallet and retain the transaction record.',
  ],
];

export default function BitcoinProtectPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-5">
        <span className="tabular text-xs uppercase tracking-widest text-caution">
          BTC / Readiness kit
        </span>
        <span className="text-xs text-ink-2">Watch-only preparation · External signing</span>
      </div>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
        Prepare your next Bitcoin move.
      </h1>
      <p className="mt-4 leading-relaxed text-ink-2">
        Inspect public-key exposure and prepare a transaction for your own wallet to sign. The
        standard route moves selected coins to a fresh native SegWit address when the benefits
        justify the fees and privacy cost.
      </p>
      <div className="mt-6 border-l-2 border-caution bg-caution/5 px-5 py-4">
        <p className="text-sm font-medium text-caution">
          Exposure reduction, not post-quantum protection
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          A fresh public-key-hash output can keep a key hidden until spending. Taproot output keys
          are already visible. Moving does not prevent a sufficiently capable attacker from racing a
          spend after the key is revealed.
        </p>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-ink-dim">
        No seed phrase or private key is requested. Public address and xpub scans reveal queried or
        derived addresses to the indexer. Scans may miss assets or wallet history outside their
        scope.
      </p>

      <section className="mt-10" aria-label="Bitcoin transaction preparation">
        <EvacuationClient />
      </section>
      <section className="mt-10" aria-label="Wallet inventory">
        <WalletScanClient />
      </section>

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="review-title">
        <div className="tabular text-xs uppercase tracking-widest text-accent">Review path</div>
        <h2 id="review-title" className="mt-3 text-xl font-semibold tracking-tight">
          Keep control of the decision and the signature.
        </h2>
        <ol className="mt-5 divide-y divide-rule">
          {STEPS.map(([title, body], index) => (
            <li key={title} className="flex gap-5 py-5">
              <span className="tabular mt-1 shrink-0 text-xs text-accent">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-[1rem] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-8" aria-label="Bitcoin readiness checklist">
        <BitcoinChecklistClient />
      </section>
      <section className="mt-10 border border-rule bg-panel p-6" aria-labelledby="scope-title">
        <h2 id="scope-title" className="text-lg font-semibold">
          Check what these coins represent.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Inscriptions, runes, multisig, timelocks, and custom scripts need specialized tools. A
          basic UTXO inventory cannot prove that these are absent. Do not use an ordinary sweep for
          coins whose additional assets or spending conditions have not been reviewed.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Experimental PQ constructions are excluded from this kit. BIP-360 P2MR is a draft and does
          not itself add post-quantum signatures. Do not send funds to draft P2MR addresses on
          current public networks.
        </p>
        <Link
          href="/bitcoin/research"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand"
        >
          Compare current Bitcoin research →
        </Link>
      </section>
    </div>
  );
}
