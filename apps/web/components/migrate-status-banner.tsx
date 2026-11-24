import Link from 'next/link';
import type { DeploymentStage } from '@/lib/deployment';

const COPY: Record<
  DeploymentStage,
  { label: string; text: string; className: string; dot: string }
> = {
  preview: {
    label: 'Preview',
    text: 'Migration is not live on a network yet. You can walk every step and generate your post-quantum key now. Sepolia execution requires a reviewed deployment manifest. Mainnet remains disabled until cryptographic review and the signing-state recovery workflow are complete.',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    dot: 'bg-amber-400',
  },
  testnet: {
    label: 'Testnet beta',
    text: 'Configured for Ethereum Sepolia. Deploy a destination account, then migrate test funds. Destination spending and keystore recovery are not yet available in this interface. Do not use real value while the contracts finish their audit.',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    dot: 'bg-sky-400',
  },
  mainnet: {
    label: 'Live',
    text: 'A deployment is configured for mainnet. Confirm the independent audit and contract addresses before securing real funds.',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    dot: 'bg-emerald-400',
  },
};

export function MigrateStatusBanner({ stage }: { stage: DeploymentStage }) {
  const copy = COPY[stage];
  return (
    <div className={`rounded-panel border p-4 ${copy.className}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wide">{copy.label}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{copy.text}</p>
      <p className="mt-2 text-xs leading-relaxed opacity-80">
        Routes depend on the chain and signer. Algorand offers native Falcon rekeying; Bitcoin
        remains watch-only preparation.{' '}
        <Link href="/kit" className="font-medium underline underline-offset-2">
          Build a plan
        </Link>{' '}
        to see its options.
      </p>
    </div>
  );
}
