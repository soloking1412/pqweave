/**
 * Two threads crossing over and under inside a square frame: a weave, drawn as
 * a single-ink mark so it prints the same way it renders.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect x="2.75" y="2.75" width="26.5" height="26.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.75v9.5m0 7.5v9.5M22 2.75v9.5m0 7.5v9.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.75 10h4.5m5.5 0h6.5m5.5 0h4.5M2.75 22h4.5m5.5 0h6.5m5.5 0h4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M10 16h12M16 10v12" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
    </svg>
  );
}
