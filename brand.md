# Brand — PQWeave

_Status: active_

The brand lives in `apps/web/app/globals.css` (`@theme`) and the logo
(`apps/web/components/logo.tsx`). This file documents it as the source of truth.

## Direction: cryptographic instrument

The product is a **measurement instrument**, not a marketing page. It reports
qubit counts, byte sizes, gas, exposure percentages and phase dates — so the
interface is built like a panel that displays readings, not like a landing page
that decorates claims.

This is a deliberate commitment, and the things it rules out matter as much as
the things it asks for:

- **No gradient text on headings.** Violet-to-cyan gradient type is the single
  most recognizable generated-UI tell. The headline carries meaning through
  contrast (white statement, grey consequence) instead.
- **No radial blur blobs.** The background is a real point lattice — lattices
  are the other half of post-quantum cryptography, and a regular grid reads as
  measurement.
- **No uniform radius.** Radius carries role: panels are near-sharp (3px),
  controls are softer (7px), only status chips are pills. Uniform `rounded-2xl`
  everywhere is what makes an interface read as generated.
- **No decorative diagrams.** The hero diagram is the Winternitz verifier
  actually drawn — filled nodes are what the signature carries, hollow ones are
  what the verifier recomputes. If a visual cannot be traced to real behaviour,
  it does not ship.

## Palette (dark-first; the product is dark-only by design)

| Token          | Value                   | Use                                                     |
| -------------- | ----------------------- | ------------------------------------------------------- |
| Base           | `#06060a`               | Page background (near-black, slight blue)               |
| Panel          | `#0a0a11`               | Instrument panels, tiles                                |
| Panel raised   | `#101019`               | Panels sitting on top of panels                         |
| Rule           | `rgba(255,255,255,.09)` | Hairline dividers — the main structural device          |
| Brand (violet) | `#7c6cff`               | Primary actions and brand only                          |
| Brand bright   | `#9a8cff`               | Hovers; "carried in the signature" in diagrams          |
| Accent (cyan)  | `#34e2e4`               | **Measured / live / shipped** — one meaning, held to it |
| Text           | `#e7e7ee`               | Body                                                    |
| Muted          | `zinc-400 / zinc-500`   | Secondary text                                          |

Accent discipline: cyan means _this is measured or shipped_. Violet means
_this is us, or an action_. A colour that means two things means nothing.

Risk semantics (`lib/risk.ts`): emerald = safe, sky = low, amber = medium,
orange = high, rose = critical. Migration semantics: emerald = quantum-safe,
amber = transitional, zinc = none. Status semantics: cyan = shipped, violet =
building, amber = blocked.

## Typography

System sans for prose, system mono (`--font-mono`) for **every measured value** —
addresses, hashes, byte counts, gas, percentages, dates, source attributions.
The `.tabular` utility adds `tabular-nums` so columns of figures align and a
changing value never reflows its row.

Tight tracking on large headings. Wide tracking (`0.14em`) on small uppercase
labels, which is what makes them read as instrument legends rather than badges.
No display font — the restraint is intentional.

## Motion

Mechanical, not decorative. Things **resolve and lock into place**; they never
float, bounce or drift. Easing is `cubic-bezier(0.16, 0.84, 0.44, 1)` — entry
decelerates hard, like a measurement settling.

Motion must carry information:

- Bars animate to their real ratio, so magnitude is felt before it is read.
- The verifier diagram walks its chains in sequence, because that is the order
  the contract computes them in.
- "Building" pulses; "shipped" is static. The pulse means work in progress.

Always honour `prefers-reduced-motion` — every animated component takes the
static branch, and `globals.css` carries a global fallback.

## Voice

Technical, honest, precise. We state limitations plainly (see `SECURITY.md`,
`CHAINS.md`, `LANDSCAPE.md`). No hype, no emoji in product copy.

Two rules that keep the copy specific:

1. **Use the real number.** "~1,200 logical qubits, Google Quantum AI Mar 2026",
   not "quantum computers are coming". Every figure carries its source.
2. **Name the ceiling.** Where a fix is transitional or impossible, the UI says
   so next to the thing it is describing — not in a footnote. "Blocked" is a
   valid status and appears on the roadmap.

"Quantum-safe migration available" — not "Protect your crypto from the quantum
apocalypse!"
