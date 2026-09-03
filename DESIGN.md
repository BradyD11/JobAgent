# JobAgent — design

One surface: the triage dashboard at `web/`. Mode is **Operate** — the reader is
completing a task, not being persuaded. Brand lives in precise details, not
expression.

## The world

An instrument, not a consumer job site: the register of a well-made mail client
or a trading terminal. Cool neutral ink on paper, one saturated accent reserved
for the two things that matter (apply, and unseen-since-last-visit), drawn SVG
icons at one stroke weight, tabular numerals for every date and term.

Light and dark are both first-class, selected from the viewer's system setting.
Every color is defined as a token on `:root`; the dark block redefines only the
tokens.

## The row is the unit

The list is read for minutes at a time, so the row gets vertical room while the
cell inset stays tight — the grid still reads as a grid.

| Token | Value | Role |
|---|---|---|
| `--row-h` | 46px | Row floor; two-line rows grow to ~51px |
| `--cell-x` | 14px | Horizontal cell inset |
| `--gutter` | 22px | Page edge — header, filters, table, footer share it |

Type: 13.5px/1.5 body, company at 14px/600, metadata at 12.5px. Contrast measured
in both themes: company 15.6:1, role and location 8.3:1, dates 5.6:1.

## Column widths are declared, not negotiated

`table-layout: fixed`. Every metadata column carries an explicit width sized from
its widest *real* content; the role title is the one auto column and absorbs all
leftover space.

| Token | Value | Sized for |
|---|---|---|
| `--w-company` | 248px | "Cadence Design Systems" without wrapping |
| `--w-location` | 176px | Two metros; three wrap to a second line |
| `--w-source` | 112px | "Simplify+LinkedIn" |
| `--w-term` | 124px | "Winter 2027" |
| `--w-date` | 92px | ISO date in tabular mono |
| `--w-actions` | 190px | Three triage icons plus Apply |

**Why fixed:** under `auto`, leftover width drifted to whichever column asked
last — Term took 171px for an 11-character string while 65 role titles
truncated. Declaring the widths moved ~100px into the role column and cut
truncation to 3 cells in 541.

Company, role, and location wrap to **two lines** (`-webkit-line-clamp`) rather
than truncating: a long name stays readable, and the row height stays
predictable enough to scan. A `width` alone collapses under a wrapping cell, so
these columns also carry `min-width`.

## Scan order

Company leads (largest, heaviest, darkest). Role supports at body weight in
secondary ink. Everything right of Location is metadata and recedes. Row actions
and the Apply button stay invisible until the row is hovered, so 20 identical
blue buttons never compete with the company names for attention.

An unseen listing carries a 5px accent dot in the left gutter — the only
decoration in the table.

## Adaptation

Below 860px the Term and Posted columns drop. Below 620px the table stops being
a table: each listing becomes a stacked block with the title on its own line and
Apply pinned top-right, so nothing truncates and the page never scrolls
sideways. Triage icons are desktop-only; touch keeps Apply.

## Browser surfaces

Selection, scrollbars, focus rings, and caret are themed from the palette.
`prefers-reduced-motion` collapses every transition.
