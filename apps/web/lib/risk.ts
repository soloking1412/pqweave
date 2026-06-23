import type { RiskLevel } from '@pqweave/sdk/scanner';

export interface RiskStyle {
  label: string;
  badge: string;
  text: string;
  bar: string;
}

export const RISK_STYLES: Record<RiskLevel, RiskStyle> = {
  safe: {
    label: 'Safe',
    badge: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
    text: 'text-emerald-300',
    bar: 'bg-emerald-400',
  },
  low: {
    label: 'Low risk',
    badge: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
    text: 'text-sky-300',
    bar: 'bg-sky-400',
  },
  medium: {
    label: 'Medium risk',
    badge: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
    text: 'text-amber-300',
    bar: 'bg-amber-400',
  },
  high: {
    label: 'High risk',
    badge: 'bg-orange-500/10 text-orange-300 ring-orange-500/30',
    text: 'text-orange-300',
    bar: 'bg-orange-400',
  },
  critical: {
    label: 'Critical',
    badge: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
    text: 'text-rose-300',
    bar: 'bg-rose-400',
  },
};

export function shortenAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
