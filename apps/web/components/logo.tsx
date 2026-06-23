export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path
        d="M16 2.5 4.5 7.2v8.1c0 7.2 4.8 12.1 11.5 14.2 6.7-2.1 11.5-7 11.5-14.2V7.2L16 2.5Z"
        stroke="url(#qg)"
        strokeWidth="1.6"
        fill="rgba(124,108,255,0.08)"
      />
      <circle cx="16" cy="15" r="3.1" stroke="url(#qg)" strokeWidth="1.4" />
      <ellipse
        cx="16"
        cy="15"
        rx="7.5"
        ry="3.1"
        stroke="url(#qg)"
        strokeWidth="1.1"
        opacity="0.7"
      />
      <ellipse
        cx="16"
        cy="15"
        rx="7.5"
        ry="3.1"
        stroke="url(#qg)"
        strokeWidth="1.1"
        opacity="0.7"
        transform="rotate(60 16 15)"
      />
      <ellipse
        cx="16"
        cy="15"
        rx="7.5"
        ry="3.1"
        stroke="url(#qg)"
        strokeWidth="1.1"
        opacity="0.7"
        transform="rotate(120 16 15)"
      />
      <defs>
        <linearGradient id="qg" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9a8cff" />
          <stop offset="1" stopColor="#34e2e4" />
        </linearGradient>
      </defs>
    </svg>
  );
}
