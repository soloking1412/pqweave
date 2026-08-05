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

## Palette: cyanotype (dark-first; the product is dark-only by design)

Named for the blueprint process — iron-blue lines on warm paper. It replaced a
violet-and-cyan-on-blue-black scheme, which is the single most recognisable
generated-UI palette in crypto. Two rules hold the system together:

1. **The chrome is one cool hue family. Risk is the only warm.** Nothing in the
   interface competes with a risk reading, so when something turns warm it means
   something. An instrument that is colourful when idle cannot signal.
2. **The base is warm-neutral graphite, not blue-black.** With warm bone ink it
   reads like printed technical paper rather than a dark-mode dashboard.

| Token        | Value                   | Use                                              |
| ------------ | ----------------------- | ------------------------------------------------ |
| Base         | `#0a0a0b`               | Page background — neutral graphite, no blue cast |
| Panel        | `#111113`               | Instrument panels, tiles                         |
| Panel raised | `#17181b`               | Panels sitting on top of panels                  |
| Rule         | `rgba(233,231,226,.10)` | Hairline dividers — the main structural device   |
| Brand        | `#3f7fbf`               | Primary actions                                  |
| Brand bright | `#6aa6dd`               | Hovers, links, "recomputed by the verifier"      |
| Accent       | `#93c5e0`               | **Measured / live / shipped**                    |
| Ink          | `#e9e7e2`               | Warm bone body text                              |
| Ink dim      | `#9d9a94`               | Secondary text                                   |

**The neutral ramp is warmed at the source.** `zinc` is used ~290 times for text
and borders; Tailwind's zinc is cool blue-grey and fights the bone ink, so
`globals.css` redefines `--color-zinc-*` to warm neutrals. Same for the semantic
hues (`emerald`, `amber`, `orange`, `rose`, `sky`) — retuned to the same warmth,
meanings unchanged. Never reach for a raw Tailwind default colour; it will be
cooler than everything around it.

### Risk ramp

`lib/risk.ts` runs neutral → steel → sodium → ember → vermilion. Severity rises
with both warmth and saturation, and `safe` is deliberately colourless —
"nothing to report" should not compete with "something to report".

| Level    | Token                   | Value     |
| -------- | ----------------------- | --------- |
| safe     | `--color-risk-safe`     | `#8d918c` |
| low      | `--color-risk-low`      | `#b9c3cc` |
| medium   | `--color-risk-medium`   | `#d9a441` |
| high     | `--color-risk-high`     | `#e8763c` |
| critical | `--color-risk-critical` | `#e0484f` |

The previous scale (emerald → sky → amber → orange → rose) was not perceptually
ordered: sky reads calmer than emerald, so "low risk" looked safer than "safe".

Migration semantics: emerald = quantum-safe, amber = transitional, zinc = none.
Status semantics: accent = shipped, **warm grey = building**, amber = blocked.
Building is grey on purpose — colour means a signal, and work in progress is not
yet one. It carries a slow pulse instead.

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
