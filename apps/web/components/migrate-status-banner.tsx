import Link from 'next/link';
import type { DeploymentStage } from '@/lib/deployment';

const COPY: Record<
  DeploymentStage,
  { label: string; text: string; className: string; dot: string }
> = {
  preview: {
    label: 'Preview',
    text: 'Migration is not live on a network yet. You can walk every step and generate your real post-quantum key now — the one-click on-chain sweep unlocks on testnet, then mainnet after the security audit.',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    dot: 'bg-amber-400',
  },
  testnet: {
    label: 'Testnet beta',
    text: 'Live on a public EVM testnet. Run a real one-transaction migration with test funds — no real value at risk while the contracts finish their audit.',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    dot: 'bg-sky-400',
  },
  mainnet: {
    label: 'Live',
    text: 'Live on mainnet. One transaction sweeps your wallet into a post-quantum account.',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    dot: 'bg-emerald-400',
  },
};

export function MigrateStatusBanner({ stage }: { stage: DeploymentStage }) {
  const copy = COPY[stage];
  return (
    <div className={`rounded-2xl border p-4 ${copy.className}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wide">{copy.label}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{copy.text}</p>
      <p className="mt-2 text-xs leading-relaxed opacity-80">
        Migration works on any EVM chain and any EVM wallet. Non-EVM chains (Bitcoin, Solana, and
        more) can&apos;t be migrated in-protocol —{' '}
        <Link href="/scan" className="font-medium underline underline-offset-2">
          scan one
        </Link>{' '}
        to see its options.
      </p>
    </div>
  );
}
