import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal, StaggerGroup, StaggerItem } from '@/components/motion';
import { LIVE_CHAIN_COUNT } from '@/lib/chains-directory';

export const metadata: Metadata = {
  title: 'Quantum Exposure Index — PQWeave',
  description:
    'How much of crypto is already quantum-exposed, why, and which chains. Methodology and live per-address scanning across 11 chains.',
};

const STATS = [
  {
    value: 'Every active EOA',
    label:
      'On EVM chains, the public key is recoverable from any transaction the account has ever signed — so every account that has moved funds is already exposed.',
  },
  {
    value: '~30% of BTC',
    label:
      'Independent analyses estimate roughly a third of all bitcoin sits in addresses that have already revealed their public key (early P2PK coins plus reused addresses). Estimate, not a live figure — see the Bitcoin breakdown.',
  },
  {
    value: `${LIVE_CHAIN_COUNT} chains`,
    label:
      'PQWeave scores quantum exposure live across EVM, Bitcoin, Litecoin, Dogecoin, Solana, Cardano, Cosmos, XRP, Algorand, Stellar, NEAR, Aptos, Tron, Sui, TON, and Polkadot.',
  },
];

const FAMILIES = [
  {
    tag: 'Recoverable from signature',
    tone: 'border-rose-500/30 bg-rose-500/5',
    dot: 'bg-rose-400',
    chains: 'Ethereum & all EVM chains',
    body: 'The public key can be recovered from any signature the account has produced. Exposure begins with the first outgoing transaction and is permanent.',
    fix: 'Quantum-safe migration available — sweep into a post-quantum account.',
  },
  {
    tag: 'Revealed on first spend',
    tone: 'border-amber-500/30 bg-amber-500/5',
    dot: 'bg-amber-400',
    chains: 'Bitcoin, Litecoin, Dogecoin, Cosmos, XRP, Cardano, Aptos, Tron, Sui, TON',
    body: 'The address is a hash of the public key, so the key stays hidden until the first spend reveals it. Unspent, never-reused addresses are still safe.',
    fix: 'Transitional only — move funds to a fresh address; a permanent fix needs a protocol upgrade.',
  },
  {
    tag: 'Address is the key',
    tone: 'border-zinc-500/30 bg-white/5',
    dot: 'bg-zinc-400',
    chains: 'Solana, Algorand, Stellar, NEAR, Polkadot',
    body: 'The public key is the address, so it is exposed the moment the account exists — before any transaction.',
    fix: 'No application-layer fix — protection requires a protocol-level post-quantum upgrade.',
  },
];

export default function ExposurePage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-white/5 px-3 py-1 text-xs text-zinc-300">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Quantum Exposure Index
      </span>
      <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
        Most crypto is already quantum-exposed.
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Exposure is not a future event — public keys leak the moment accounts transact, and they can
        be harvested today to be broken once a sufficient quantum computer exists. Here is the shape
        of the problem, and a live scanner to check any address yourself.
      </p>

      <StaggerGroup className="mt-12 grid gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <StaggerItem key={stat.value} className="rounded-panel border border-rule bg-panel p-5">
            <div className="text-2xl font-semibold tracking-tight text-white">{stat.value}</div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{stat.label}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <Reveal className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight">Three ways a key gets exposed</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          The exposure model determines what can be done about it. PQWeave classifies every chain
          into one of three families.
        </p>
        <div className="mt-6 grid gap-4">
          {FAMILIES.map((family) => (
            <div key={family.tag} className={`rounded-panel border p-5 ${family.tone}`}>
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${family.dot}`} />
                <span className="text-sm font-semibold text-white">{family.tag}</span>
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                {family.chains}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">{family.body}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{family.fix}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Methodology</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">
          For each address, PQWeave looks at the chain&apos;s key model and the address&apos;s
          on-chain history: whether a public key has been revealed (an outgoing transaction on EVM,
          a spend on UTXO and account chains, or simply the address itself where the key is the
          address), the balance at risk, and address reuse. It scores exposure from safe to critical
          without ever touching a private key or taking custody. The macro figures above are cited
          independent estimates; the per-address result is computed live and verifiable.
        </p>
      </Reveal>

      <Reveal className="mt-12">
        <div className="rounded-panel border border-rule bg-gradient-to-br from-brand/15 to-accent/10 p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-white">Check any address</h2>
          <p className="mt-2 max-w-xl text-sm text-zinc-300">
            Paste an address from any of the {LIVE_CHAIN_COUNT} live chains and see its exposure
            score — no wallet connection, no custody.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/scan"
              className="rounded-control bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-bright"
            >
              Scan a wallet
            </Link>
            <Link
              href="/exposure/bitcoin"
              className="rounded-control border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20"
            >
              Bitcoin breakdown
            </Link>
            <Link
              href="/partners"
              className="rounded-control border border-rule-strong px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
            >
              Scan at scale (partners)
            </Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
