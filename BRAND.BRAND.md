# Meboard brand sheet

The short version: **Meboard is the board. Buffface is the door.**

This file is for anyone who has to draw, ship, or explain the thing without
reading the TypeScript. It is deliberately small. If a rule here is not enough
to make a decision, the answer is usually "less".

---

## 1. The name

**Meboard** — one word, capital M, no hyphen, no camel case. It is the board
that learns *me*: the screen you share, and the keyboard that remembers where
your thumb actually lands.

- In running text: `Meboard`.
- Never: `MeBoard`, `Me-Board`, `meboard` (except in a handle or hostname).
- The product is not "a keyboard app". It is a screen-sharing board whose
  keyboard is the part with opinions.

## 2. The mark

`src/assets/meboard-mark.svg` · `public/mark.svg` (favicon / PWA)

A keycap seen head-on, with a keyhole punched through the face. Three ideas in
one silhouette:

| Part | Reads as |
| --- | --- |
| The rounded tile | a board, a screen, a room |
| The lower lip | a keycap — this is a keyboard, not a padlock |
| The keyhole | the part of the product that looks back at you |

Construction, for anyone redrawing it:

- Canvas 512, tile inset 40, top radius 96, bottom radius 36.
- Two pine values only: face `#24463B`, lip `#17302A`.
- Keyhole in paper `#F7F2E8`, circle `r=64` at `(256, 196)`, stem widening
  from 60 to 88 and ending at `y=348`.
- No gradients, no strokes, no drop shadows, no letters. It must survive being
  16 px in a browser tab.

**Clear space:** one quarter of the tile width on every side (64 px at full
size). Nothing enters it, including the wordmark's descenders.

**Minimum size:** 16 px for the tile alone. Below 24 px, do not add the wordmark.

**Don'ts**

- Do not put the mark inside another rounded square or a circle.
- Do not recolour the keyhole persimmon for "energy". The paper hole is the
  contrast that makes it work.
- Do not tilt it, outline it, or add a cursor/pointer to it.
- Do not use the Freebuff mark as the app icon. That was the old template
  default and it was wrong: this board is not the platform.

## 3. The wordmark

Set live, not drawn: **`font-display`**, tracking tight, sentence case.
The serif is the product's voice — warm, editorial, a little old-fashioned. The
UI sits on `--font-display` for headings, the sans for body, and mono **only**
for micro-labels, codes, and key names. If a string looks like it belongs on a
label maker, it is mono; everything else is not.

## 4. Colour

The app tokens are OKLCH in `src/index.css`; the SVG assets use fixed hexes so a
favicon renders the same in an OS preview that has never heard of OKLCH. Keep
them close.

| Name | Hex | Token / use |
| --- | --- | --- |
| Paper | `#F7F2E8` | `--background`; the keyhole, the page |
| Pine | `#24463B` | mark face; primary ink on paper |
| Pine deep | `#17302A` | mark lip; dark surfaces |
| Persimmon | `#C45C33` | `--primary`; Buffface, actions |
| Rust | `#A5451F` | Buffface lip; `--marker` family |
| Ink | `#22352E` | `--foreground`; body text, eyes |

Rules: one accent per view. Persimmon is a marker, not a wash. Never put
persimmon text on pine at small sizes. The palette is warm on purpose — no
purple gradients, no neon, no glass.

## 5. Voice

The brand speaks like a person who has used the product and is not impressed by
it. Short sentences. Concrete nouns. No exclamation marks, no "supercharge", no
"seamless". Failure is described plainly, because the whole product is about
failure being information.

**Keyhole** is a character, not the brand. Keyhole may be rude; Meboard's own
copy may not. Do not put Keyhole's lines in marketing headers, and do not let
the mascot explain a security decision.

## 6. Buffface

`src/assets/buffface.svg` · `src/components/Buffface.tsx`

Buffface is the house mascot for the seam between Meboard and Freebuff: a
persimmon keycap with one eye winking and a keyhole for a mouth. It is named
after the Chromebook original that got there first, and it lives in exactly two
places — the landing footer and the bottom of the app nav. Both open the same
colophon.

What Buffface is allowed to say:

- "This is the room we borrowed." Credits, not advertising.
- "The board is ours; the scaffolding is theirs." Honest division of labour.

What Buffface is **not**:

- An official Freebuff mark. It is an in-house doodle. Never imply endorsement,
  partnership, or that Freebuff ships this app.
- A replacement logo. If a surface needs a logo, it gets the keycap.
- A tracking surface. The colophon has no pixels, no login wall, and no
  "continue with" anything.

The wink is a nod, not a promise. Keep it at 20–112 px, on paper or pine, never
on persimmon (the face disappears).

## 7. The Freebuff relationship, in one paragraph

Freebuff is the room, not the landlord. The board, the keyboard, the persona and
the words are Meboard's. The environment, the Convex backend, the per-turn
typecheck and the mirror that publishes to GitHub are Freebuff's. So the app
chrome carries **no Freebuff logo**; it carries one quiet Buffface chip that
opens a colophon and a link to the project. The sign-in card still says
"Secured by freebuff.com" because that sentence is true and removing it would be
a lie about who sends the code.

## 8. Asset inventory

| File | What it is | Where it goes |
| --- | --- | --- |
| `src/assets/meboard-mark.svg` | full-colour mark, 512 | app header, nav, auth card |
| `public/mark.svg` | favicon / PWA icon, 512 | `index.html`, manifest |
| `public/mark-maskable.svg` | full-bleed maskable icon | manifest `purpose: maskable` |
| `src/assets/buffface.svg` | mascot, 512, transparent | footer chip, colophon |
| `public/manifest.webmanifest` | name, colours, icons | PWA install |

**Known gaps.** There are no raster exports yet: no 192/512 PNG icons and no
Open Graph card, because this environment has no SVG rasteriser, no browser, and
no font stack to render one honestly. The SVGs are the source of truth; export
PNGs from them when a tool is available, and do not fake an OG image with a
screenshot of the dev server.
