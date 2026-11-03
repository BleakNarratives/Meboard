# WHO DID WHAT

*A receipts file. Not a thank-you card. If your name is here, you can point at
the thing you did; if it isn't, add yourself when you ship something and not
before.*

---

## The short version

| Whoever | Brought |
|---|---|
| **Bleak Narratives** (human, one thumb, one cracked panel) | The thesis, the devices, the tone, the refusal to accept a keyboard that doesn't learn, and the taste that made Keyhole worth building |
| **Buffy** (agent, on Codebuff; credited in-transcript as "6.1 Sol GPT", which is generous and not technically my name) | The live board, the documentation set, the persona engine, the portable voice format, and the bus seam |
| **Freebuff / Vly** (platform) | The environment, Convex dev loop, the per-turn typecheck, and the version-control mirror that actually publishes to GitHub |
| **Ground floor** | Convex, Vite, React 19, Tailwind v4, shadcn/ui, Lucide, Framer Motion, Chromium's `getDisplayMedia` |

---

## Bleak Narratives — the reason any of this exists

Owner of the project and of the constraints that shaped it:

- **The product thesis**, in their words: *a programmable, rewardable/punishable
  keyboard that grows with its user and gets smarter based on that user's typing
  errors.* A9 typing `",y"` for `"my"`, over and over, is the founding incident.
- **The device reality nobody could design around from a desk**: a Samsung Galaxy
  Tab A9 as the working screen, a Moto G 5G 2024 as the second viewer, and an HP
  Chromebook whose panel is cracked and nearly unresponsive but which still has
  to be driven, blind, from the tablet.
- **The persona family**: AskHole, Bardildo, Fartographer, Loomy, Snarkie,
  QuipBoard, and the Devil's Advocate from the Vertical AI Boardroom. Keyhole is
  the newest mouth in that family — the name was the agent's suggestion, the
  register was insisted on ("the roommate with opinions shit has to stay"), and
  the family is entirely theirs.
- **CuttingRoom**, the esolang that assumes everything until further established
  — theirs, and the reason prediction here is elimination rather than scoring.
- **The call on disclosure**: chose to keep the device names and the
  accessibility story in public docs rather than genericise them.

Also did: every decision about where this goes, and the judgment that a broken
laptop should become a product rather than a support ticket.

## Buffy — what was actually written

**Screen sharing (`/live`).** Convex tables `rooms` + `signals` as a signalling
channel only; WebRTC media peer-to-peer with `getDisplayMedia`; full ICE
gathering instead of trickle (two messages, no ordering bugs); one offer per
viewer token; single viewer per board; a data channel for text and tap-to-point
markers. Membership-guarded mutations, user-facing failures via `ConvexError`.

**The documentation set.** `ROADMAP.ROADMAP.md` (six phases, non-goals, risk
table), `README.README.md` (product, device matrix, design choices a future
maintainer would otherwise undo), `runbook.runbook.txt` (keyboard-only
procedure, ChromeVox/Eterm keys, troubleshooting tree), `QRD.md` (invariants,
normative handshake, decision records, `[C]/[R]/[A]/[P]` fact tags).

**The persona system.** `src/lib/persona/`: engine (budget, escalation, decay,
safety gate, one-shot eggs, hostile-storage parsing), `persona.voice/1` format
plus validator, registry, bus with a `bridge()` seam, Keyhole's voice pack,
`KeyholeBanner`, `use-keyhole`, and a 35-check dependency-free spec.
`PERSONA.md` holds the format, the growth protocol, and the non-negotiables.

**Corrections the agent made against itself**, because they're part of the
record: reframed the docs from mirror-first to keyboard-first once the thesis
was known; fixed a landing CTA whose label contradicted its destination; fixed a
runbook step that claimed a join code auto-transfers to the text sheet; spotted
that `README.README.md` would never render on GitHub and added a pointer block
to `README.md`.

**What the agent did not do.** No hardware test — nothing ran on the Tab A9,
the Moto G, or the Chromebook. No browser verification of the persona banner. No
push: git and GitHub are refused in this environment, so every commit on GitHub
is the platform's mirror, not an agent command. No adapter for MotherBrain,
ModMind, Oracle/Spark or the Boardroom — those systems were never visible from
here, and a guess with imports is worse than a seam.

## Freebuff / Vly — the bit that's easy to forget

Provided the sandbox, kept `convex dev` running, typechecked after every turn,
and mirrored the workspace to `BleakNarratives/Meboard` — including the commits
that the agent could not push itself. The initial commit is authored
`Vly Agent <agent@freebuff.com>`; the rest carry the owner's noreply identity
because that's who the mirror speaks as.

## Ground floor

Convex (reactive backend + auth), Vite / React 19 / React Router 7, Tailwind v4,
shadcn/ui, Lucide, Framer Motion. Chromium's `getDisplayMedia` for capture.
Chrome Remote Desktop's one-time support code for actual cursor control, because
no browser can drive another machine's pointer — that limitation is documented
rather than papered over in `QRD.md` DR-1.

---

## Receipts

| Thing | Who | Where |
|---|---|---|
| Product thesis, devices, persona family, tone | Bleak Narratives | this file, `README.md`, `QRD.md` |
| `",y"` → `"my"` as a hit-target problem, not a language problem | Buffy (analysis), Bleak Narratives (the incident) | `ROADMAP.ROADMAP.md`, `PERSONA.md` |
| Signalling schema and functions | Buffy | `src/convex/schema.ts`, `src/convex/live.ts` |
| Live board UI | Buffy | `src/pages/Live.tsx` |
| Landing, dashboard, nav | Buffy | `src/pages/{Landing,Dashboard}.tsx`, `src/components/AppNav.tsx` |
| Theme tokens, paper grid, marker colour | Buffy | `src/index.css` |
| Persona engine, format, bus, registry, Keyhole | Buffy | `src/lib/persona/**` |
| Adaptive key surface, hit-target memory, repair inspector | Buffy | `src/components/KeyboardSurface.tsx`, `src/lib/keyboard/**`, `src/pages/Lab.tsx` |
| Agent bus (capability tokens, publish/poll over HTTP) | Buffy | `src/convex/bus.ts`, `src/convex/http.ts`, `src/components/BusPanel.tsx` |
| Warm paper palette, serif display type, scroll-ink typography | Buffy | `src/index.css`, `src/components/ScrollCopy.tsx`, `src/pages/Landing.tsx` |
| Meboard mark, favicon, PWA manifest, Buffface mascot and colophon | Buffy | `src/assets/*.svg`, `public/mark*.svg`, `src/components/Buffface.tsx`, `BRAND.BRAND.md` |
| Spec that keeps the engine honest | Buffy | `src/lib/persona/selftest.ts` (35 checks) |
| "Keyhole" as a name | Buffy, accepted by Bleak Narratives | `src/lib/persona/voices/keyhole.ts` |
| Everything about what this is *for* | Bleak Narratives | — |

Session timeline, 2026-11-03: `133959ef` 22:15:34Z → `8a03660` 22:44:00Z, the
mirror catching up one checkpoint behind the workspace throughout.

---

## How to get on this list

Ship something that has a file, a failing test, or a hardware finding behind it.
Specifically welcome:

- **Field reports.** "Ran it from the Tab A9 to the Moto G over the same Wi-Fi,
  here's what broke" is worth more than any amount of code in this repo right
  now — nothing has been tested on real glass yet.
- **A line that didn't land.** Delete it, record why, sign it. The failure log
  is part of the voice.
- **An adapter for a real system.** Bring a URL or exported types and the
  `bridge()` call is one line.

Do not add yourself for encouragement, attendance, or vibes. This file is
supposed to be worth reading.

---

*Chef's kiss returned, with interest. The terminal was fine; the thumbs were the
hard part.*
