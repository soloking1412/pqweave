# Brand: PQWeave

The brand lives in `apps/web/app/globals.css` (`@theme`), the fonts loaded in
`apps/web/app/layout.tsx`, and the mark in `apps/web/components/logo.tsx`. This
file is the written record.

## Direction: a technical sheet

The product reports measurements: qubit counts, byte sizes, gas, exposure,
proposal status. So the site is drawn like a printed technical sheet, not a
landing page. Dark ink on warm paper, hairline rules, a graph-paper ground.

What that rules out matters as much as what it asks for:

- **No dark neon.** Blue-black with a violet or cyan glow is the default look of
  crypto sites. Paper is the opposite and prints cleanly.
- **No gradients, no blur, no glow.** Structure comes from rules and frames.
- **No decorative figures.** A chart or bar must show a measured value at its
  real ratio. If a visual cannot be traced to a number, it does not ship.
- **No uniform radius.** Sheets are near-sharp (2px), controls are softer (5px),
  only status chips are pills.

## Palette: blueprint paper (light only)

| Token        | Value                | Use                                  |
| ------------ | -------------------- | ------------------------------------ |
| Base         | `#f3f0e8`            | Page ground, with a 24px dot lattice |
| Panel        | `#faf8f3`            | Sheets laid on the page              |
| Panel raised | `#ece8dc`            | Bands and footnotes inside a sheet   |
| Well         | `#e9e4d7`            | Bar tracks, inset areas              |
| Ink          | `#14202e`            | Headlines and primary text           |
| Ink 2        | `#36424f`            | Body text                            |
| Ink dim      | `#586371`            | Secondary text, labels               |
| Ink faint    | `#6d7680`            | Captions and separators only         |
| Rule         | `rgba(20,32,46,.14)` | Hairlines                            |
| Rule strong  | `rgba(20,32,46,.30)` | Sheet borders, section rules         |
| Brand        | `#1d4b7d`            | Actions and links (Prussian blue)    |
| Brand strong | `#153a62`            | Hover and pressed                    |
| Accent       | `#1f6788`            | Measured values, small kickers       |

Meaning colours: `ok #2c6a49`, `caution #8a5a0a`, `danger #a8281f`,
`note #56468a`. Pages use these names and never a raw palette step, so the whole
site can be re-inked from one file.

### Risk ramp

Graphite, steel, ochre, rust, vermilion. Severity rises with warmth, and `safe`
is colourless so "nothing to report" never competes with "something to report".

`safe #6d7680` · `low #3f6f8f` · `medium #a06c0c` · `high #bd5417` ·
`critical #b3261e`

## Type

IBM Plex, three cuts, self-hosted by `next/font`.

- **Plex Serif 500** for `h1` and `h2`. Set like a report title.
- **Plex Sans** for everything else.
- **Plex Mono** for every measured value (`.tabular`) and for the small
  uppercase labels (`.label`).

## Components

- **`.panel`** is a sheet: hairline border with two ink corner ticks. The ticks
  make a rectangle read as a drawing frame.
- **`.label`** is the small mono caption above a section or a reading.
- Tables are preferred over card grids when the content is a comparison.
- The one dark block on a page is the closing call to action, in solid ink.

## Mark

Two threads crossing inside a square frame, single ink, `currentColor`.

## Motion

Sections fade and rise 16px once on entry (0.4s, ease-out). Bars grow from zero
to their measured ratio. Nothing loops. Everything honours
`prefers-reduced-motion`.

## Voice

Plain, short, specific. State the limit before the feature. Say "not audited"
where it applies. Never "audited", "perfect", "unbreakable" or "quantum-proof".
A number always carries its source or the command that reproduces it.
