/**
 * Shield over an orbital lattice. The stroke is a single blueprint blue rather
 * than a two-stop gradient — a gradient mark reads as decoration, and the point
 * of the orbits is that they are structure.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path
        d="M16 2.5 4.5 7.2v8.1c0 7.2 4.8 12.1 11.5 14.2 6.7-2.1 11.5-7 11.5-14.2V7.2L16 2.5Z"
        stroke="#6aa6dd"
        strokeWidth="1.6"
        fill="rgba(63,127,191,0.1)"
      />
      <circle cx="16" cy="15" r="3.1" stroke="#93c5e0" strokeWidth="1.4" />
      <ellipse
        cx="16"
        cy="15"
        rx="7.5"
        ry="3.1"
        stroke="#6aa6dd"
        strokeWidth="1.1"
        opacity="0.65"
      />
      <ellipse
        cx="16"
        cy="15"
        rx="7.5"
        ry="3.1"
        stroke="#6aa6dd"
        strokeWidth="1.1"
        opacity="0.65"
        transform="rotate(60 16 15)"
      />
      <ellipse
        cx="16"
        cy="15"
        rx="7.5"
        ry="3.1"
        stroke="#6aa6dd"
        strokeWidth="1.1"
        opacity="0.65"
        transform="rotate(120 16 15)"
      />
    </svg>
  );
}
