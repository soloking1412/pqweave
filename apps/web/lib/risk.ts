import type { RiskLevel } from '@pqweave/sdk/scanner';

export interface RiskStyle {
  label: string;
  badge: string;
  text: string;
  bar: string;
}

/**
 * A monotonic ramp: neutral → steel → sodium → ember → vermilion.
 *
 * The previous scale ran emerald → sky → amber → orange → rose, which reads
 * wrong because it is not perceptually ordered — sky is calmer than emerald, so
 * "low risk" looked safer than "safe". Here severity rises with both warmth and
 * saturation, and `safe` is deliberately colourless: nothing to report should
 * not compete for attention with something to report.
 */
export const RISK_STYLES: Record<RiskLevel, RiskStyle> = {
  safe: {
    label: 'Safe',
    badge: 'bg-risk-safe/10 text-risk-safe ring-risk-safe/25',
    text: 'text-risk-safe',
    bar: 'bg-risk-safe',
  },
  low: {
    label: 'Low risk',
    badge: 'bg-risk-low/10 text-risk-low ring-risk-low/25',
    text: 'text-risk-low',
    bar: 'bg-risk-low',
  },
  medium: {
    label: 'Medium risk',
    badge: 'bg-risk-medium/10 text-risk-medium ring-risk-medium/30',
    text: 'text-risk-medium',
    bar: 'bg-risk-medium',
  },
  high: {
    label: 'High risk',
    badge: 'bg-risk-high/10 text-risk-high ring-risk-high/30',
    text: 'text-risk-high',
    bar: 'bg-risk-high',
  },
  critical: {
    label: 'Critical',
    badge: 'bg-risk-critical/12 text-risk-critical ring-risk-critical/35',
    text: 'text-risk-critical',
    bar: 'bg-risk-critical',
  },
};

export function shortenAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
