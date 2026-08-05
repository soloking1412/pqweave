'use client';

import { Reveal, StaggerGroup, StaggerItem } from '@/components/motion';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';

type State = 'shipped' | 'building' | 'blocked';

interface Product {
  title: string;
  detail: string;
  state: State;
  body: string;
}

/**
 * Three states, not two. "Blocked" is the honest one and most roadmaps hide it:
 * it means the work is understood and cannot proceed for a reason outside the
 * code. Saying so is more useful than moving it into a vague "soon" column.
 */
const STATE_STYLE: Record<State, { label: string; dot: string; text: string }> = {
  shipped: { label: 'Shipped', dot: 'bg-accent', text: 'text-accent' },
  building: { label: 'Building', dot: 'bg-brand-bright', text: 'text-brand-bright' },
  blocked: { label: 'Blocked', dot: 'bg-amber-400', text: 'text-amber-300' },
};

const PRODUCTS: Product[] = [
  {
    title: 'Exposure scanner',
    detail: `${LIVE_CHAIN_COUNT} chains`,
    state: 'shipped',
    body: 'Detects published public keys across all three exposure families and scores value at risk. Free, instant, no wallet connection.',
  },
  {
    title: 'EVM migration',
    detail: 'Testnet',
    state: 'shipped',
    body: 'One EIP-7702 transaction sweeps native, ERC-20 and NFTs into a post-quantum account. Deployed to Base Sepolia, proven through the real EntryPoint.',
  },
  {
    title: 'Bitcoin suite',
    detail: 'Watch-only',
    state: 'shipped',
    body: 'PSBT evacuation kit, whole-wallet xpub scanning, on-chain key attestation, and BIP-360/361 tracking. Keys never touch us.',
  },
  {
    title: 'Non-EVM vaults',
    detail: 'Devnet / testnet',
    state: 'shipped',
    body: 'Solana and Stellar vaults verify the same hash-based key on chain. Custody, not migration — the original address stays exposed, and we say so.',
  },
  {
    title: 'Remaining chains',
    detail: 'By family',
    state: 'building',
    body: 'Porting the evacuation kit to the other first-spend chains, and the vault pattern to the address-is-the-key chains.',
  },
  {
    title: 'Partner APIs',
    detail: 'Design',
    state: 'building',
    body: 'Bulk exposure and migration endpoints for wallets, exchanges and custodians who need to move many users at once.',
  },
  {
    title: 'External audit',
    detail: 'Needs funding',
    state: 'blocked',
    body: 'Scope is frozen and the money path is property-tested, but an audit cannot be done by the author of the code. Nothing here is audited yet.',
  },
  {
    title: 'Falcon verifier',
    detail: 'FIPS 206 draft',
    state: 'blocked',
    body: 'The compact lattice signature would suit on-chain verification best. Its standard is still a draft, which is exactly why the default stays hash-based.',
  },
];

export function RoadmapSection() {
  return (
    <section id="building" className="scroll-mt-20 border-t border-rule py-20 sm:py-28">
      <Reveal>
        <h2 className="text-[1.7rem] font-semibold tracking-tight sm:text-4xl">
          Shipped, building, blocked
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
          Including the blocked column, because two of the most important items are waiting on
          things no amount of code will fix — an independent auditor, and a NIST standard that is
          not finished.
        </p>
      </Reveal>

      <StaggerGroup className="mt-10 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCTS.map((product) => {
          const style = STATE_STYLE[product.state];
          return (
            <StaggerItem key={product.title} className="h-full">
              <article className="flex h-full flex-col bg-panel p-5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`flex items-center gap-1.5 text-[11px] font-medium ${style.text}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
                    {style.label}
                  </span>
                  <span className="tabular text-[10px] text-zinc-600">{product.detail}</span>
                </div>
                <h3 className="mt-3.5 text-[15px] font-semibold tracking-tight">{product.title}</h3>
                <p className="mt-2 flex-1 text-[12px] leading-relaxed text-zinc-400">
                  {product.body}
                </p>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </section>
  );
}
