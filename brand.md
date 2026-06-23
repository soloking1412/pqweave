# Brand — PQWeave

_Status: active_

The brand is already established in `apps/web/app/globals.css` (`@theme`) and the
logo (`apps/web/components/logo.tsx`). This file documents it as the source of truth.

## Palette (dark-first; the product is dark-only by design)

| Token          | Value                 | Use                                                |
| -------------- | --------------------- | -------------------------------------------------- |
| Base           | `#06060a`             | Page background (near-black, slight blue)          |
| Surface        | `#0b0b12`             | Cards, panels                                      |
| Brand (violet) | `#7c6cff`             | Primary actions, brand accents                     |
| Brand bright   | `#9a8cff`             | Hovers, gradient start                             |
| Accent (cyan)  | `#34e2e4`             | Secondary highlights, gradient end, "live" signals |
| Text           | `#e7e7ee`             | Body                                               |
| Muted          | `zinc-400 / zinc-500` | Secondary text                                     |

Risk semantics (already in `lib/risk.ts`): emerald = safe, sky = low, amber =
medium, orange = high, rose = critical. Migration semantics: emerald =
quantum-safe, amber = transitional, zinc = none.

## Typography

System sans for UI, system mono (`--font-mono`) for addresses, hashes, and
numbers. Tight tracking on large headings (`tracking-tight`). No display font —
the restraint is intentional.

## Motion

Quantum/orbital theme. Entrances are choreographed (fade + small rise, staggered),
springs are gentle, micro-interactions are subtle. Always honor
`prefers-reduced-motion`. Motion should feel like a calm system coming online —
never bouncy or attention-seeking.

## Voice

Technical, honest, precise. We state limitations plainly (see `SECURITY.md`,
`CHAINS.md`). No hype, no emoji in product copy. "Quantum-safe migration
available" — not "Protect your crypto from the quantum apocalypse!"
