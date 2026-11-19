# QRD.md — Context Integrity Contract (model/agent → model/agent)

**Read this before touching code, docs, or infrastructure.**
If a claim in another document conflicts with this file *and* with the code,
the code wins, then this file, then everything else.

| | |
| --- | --- |
| Project | Meboard |
| Revision | v0.1 |
| Contract date | 2026-11-03 |
| Verified against | `src/convex/live.ts`, `src/convex/schema.ts`, `src/pages/Live.tsx`, `src/main.tsx` |
| Verification state | `bunx convex dev --once` exit 0; `bunx tsc -b --noEmit` exit 0. **No browser or hardware verification was performed.** |

---

## 1. What this document is for

Meboard is maintained by more than one agent/human, across sessions that do not
share memory. This file is the shared memory. It exists to stop three specific
failures:

1. **Drift** — a doc claims a feature the code does not have.
2. **Rework** — an agent re-decides something already decided, differently.
3. **False completion** — an agent reports a capability it never exercised.

Rules for any agent reading this:

- **R1.** Do not claim verified behaviour you have not observed. Typechecking is
  not behaviour.
- **R2.** If you change an invariant (section 4) or a contract (section 5),
  update this file in the same change. A code change plus a stale QRD is a bug.
- **R3.** Do not add capability to section 3 (facts) that is only planned.
  Planned things live in `ROADMAP.ROADMAP.md` and are labelled as planned.
- **R4.** When you contradict an earlier decision, do it explicitly: add a new
  decision record that supersedes the old one. Never silently reverse a decision.

---

## 2. Source-of-truth map

| Question | Authoritative file |
| --- | --- |
| What does the app do? | `src/pages/Landing.tsx` (public claims) + this file |
| What is stored? | `src/convex/schema.ts` |
| What can each role do? | `src/convex/live.ts` |
| What is the handshake protocol? | `src/pages/Live.tsx` (`connectToViewer`, `answerOffer`, `adoptChannel`) |
| What routes exist / what is protected? | `src/main.tsx` |
| Auth state + shape | `src/hooks/use-auth.ts`, `src/convex/users.ts` |
| Framework conventions | `README.md` (the build-instruction file, not the product readme) |
| Mark, palette, voice, mascot | `BRAND.BRAND.md` |
| How to rig the A9 and the Chromebook | `MRD.txt` |
| Plan | `ROADMAP.ROADMAP.md` |
| Procedure | `runbook.runbook.txt` |
| Product overview | `README.README.md` |

Naming trap: **`README.md` is the framework/agent convention file.
`README.README.md` is the human-facing product readme.** Do not merge them.

---

## 3. Current facts (verified against code on 2026-11-03)

**Verification legend:** `[C]` confirmed by reading code · `[R]` confirmed by
running a command · `[A]` assumed / not exercised · `[P]` planned, not built.

### Runtime

- `[C]` Vite + React 19 + TypeScript, Tailwind v4, shadcn/ui, Framer Motion, Bun.
- `[C]` Convex is the database and the only backend.
- `[C]` Auth is Convex Auth, email OTP; the signed-in user is `Doc<"users">`.
- `[C]` Host capture uses `navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: false })`.
- `[C]` Media and the data channel are peer to peer (WebRTC).
- `[C]` `iceServers` is exactly one STUN server: `stun:stun.l.google.com:19302`. No TURN.
- `[C]` ICE gathering is completed before sending SDP, capped at **2500 ms**, no trickle.
- `[C]` Data channel label is `meboard`.
- `[C]` Data channel messages are JSON, exactly two shapes:
  - `{ "t": "text", "body": string }`
  - `{ "t": "ping", "x": number, "y": number }` with `x`,`y` in `0..1`.
- `[C]` One viewer per board. A second join by a *different* user is refused
  (`joinRoom` throws); the same viewer may rejoin, which replaces the token and
  clears stale signals. This closed a viewer-takeover hole on 2026-11-03.
- `[C]` No recording, no TURN, no file transfer, no input control.

### Routes

- `[C]` `/` public · `/auth` public (honours `?returnTo=`) · `/dashboard` protected · `/live` protected · `/lab` protected · `/rail` protected → redirects to `/live?rail=1` · `*` → NotFound.
- `[C]` Rail mode is a layout switch inside `Live.tsx` driven by the `rail` query
  param, not a second page, so the peer connection survives the toggle.
- `[C]` Protection is `RequireAuth`, which redirects to `/auth?returnTo=<path>`.
- `[C]` `Auth.tsx`'s `resolveRedirectAfterAuth` only accepts `returnTo` starting
  with `/` and not `//`, falling back to `redirectAfterAuth` (`/dashboard`).

### Convex surface (`src/convex/live.ts`)

Queries:

| Name | Args | Returns | Authorisation |
| --- | --- | --- | --- |
| `myRoom` | — | active board of this host, or `null` | signed in |
| `roomState` | `{ roomId }` | role, code, status, names, `viewerToken`, `viewerAttached` | host or attached viewer |
| `signals` | `{ roomId }` | `{ id, from, kind, payload }[]`, max 20 | host or attached viewer |

Mutations:

| Name | Args | Behaviour |
| --- | --- | --- |
| `createRoom` | — | ends the caller's open boards, generates a unique 6-char code (max 5 collision retries), inserts `status: "waiting"` |
| `joinRoom` | `{ code }` | normalises the code, rejects unknown/ended boards, **deletes existing signals**, sets viewer + a fresh 10-char `viewerToken` + `status: "live"` |
| `postSignal` | `{ roomId, kind: offer\|answer, payload }` | deletes the previous message with the same `from`+`kind`, inserts the new one; no-ops on ended boards |
| `endRoom` | `{ roomId }` | host only; `status: "ended"`, clears viewer fields, deletes signals |

- `[C]` Code alphabet is `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31 chars, no `0/O/1/I/L`).
- `[C]` User-facing failures throw `ConvexError` with a plain sentence; the client
  surfaces `error.data` through `reasonOf()`.
- `[C]` `getAuthUserId` is used in `live.ts` (not `getCurrentUser`) to avoid
  `MutationCtx` → `QueryCtx` variance issues.
- `[C]` Signal reads are capped at 20 rows; deletes at 50 (`clearSignals`).

### Schema (`src/convex/schema.ts`)

- `[C]` `rooms`: `code`, `hostId`, `hostName?`, `status` (`waiting|live|ended`),
  `viewerId?`, `viewerName?`, `viewerToken?`; indexes `by_code`, `by_host`.
- `[C]` `signals`: `roomId`, `from` (`host|viewer`), `kind` (`offer|answer`),
  `payload` (SDP JSON string); index `by_room`.
- `[C]` `schemaValidation: false` (deliberate, template default).

### The bus (`src/convex/bus.ts`, `src/convex/http.ts`)

- `[R]` `POST /bus/publish` and `GET /bus/poll?after=<ms>` are deployed on the
  `.convex.site` host; an unauthenticated request returns `401` with a JSON
  error body (verified by curl against the live deployment).
- `[C]` Capability model: a signed-in user mints a token (`bus.issueToken`),
  48 hex chars from `crypto.getRandomValues`, stored in `busTokens`.
  `rotateToken` revokes every old token and mints one new one.
- `[C]` `publish` needs a non-empty `body` (≤4000 chars); `from` ≤32 and `kind`
  ≤24 are whitelisted to `[\w .:_-]`; body control characters are stripped.
- `[C]` One append-only log per user: `feed` returns the last 40, `poll` up to
  100 after a cursor. 7-day retention, pruned 20 rows per write.
- `[A]` No per-user rate limit, and anonymous auth is enabled — the largest
  remaining abuse surface. Internal functions are not client-callable.

### The keyboard engine (`src/lib/keyboard/*`)

- `[C]` `layout.ts` derives adjacency from QWERTY coordinates; `,` is a
  neighbour of `m`, which is why `,y` → `my` is a rule, not a special case.
- `[C]` `repair.ts` ranks four rules by cost in key widths: transposition 0.9,
  punctuation 1.0, collapsed double 1.0, adjacent slip 1.0 + 0.1×distance.
  A known word is never rewritten; no viable candidate returns `null`.
- `[C]` `explainToken()` returns verdict, losers and reason; `bun run keyboard
  <token>` prints it.
- `[C]` `adapt.ts` moves a target after 3 distinct-session strikes, at most once
  per 4 sessions, capped at 12% of a key width; reversal needs 6 strikes.
- `[C]` `parseMemory()` treats stored offsets as hostile input and clamps them.
- `[C]` Surface lives in `/lab` (`components/KeyboardSurface.tsx`); it offers
  repairs and never applies them without a tap. It is **not** an Android IME and
  cannot replace the system keyboard.

### Persona (`src/lib/persona/*`)

- `[C]` One engine, many voices. Packs are `persona.voice/1` data; unknown
  events, markup and overlong lines are refused by `parseVoicePack`.
- `[C]` Budget 45 s between lines / 6 per session; tiers 1–3; a grudge halves
  after 10 quiet minutes; environment failures are always silent.
- `[C]` Three one-shot sealed eggs: mute flip, marker spam, repeated rejection.
- `[C]` `createPersonaBus({ persona, onQuip }).bridge(source)` is the integration
  seam for any external event bus.

### Design system

- `[C]` Warm paper / pine ink / persimmon tokens in `src/index.css`; display type
  is a serif stack (`--font-display`), body sans, mono only for micro-labels.
- `[C]` `components/ScrollCopy.tsx` renders type twice — a stroke-only outline
  and a clipped fill driven by `crawl(t) = t^7`; reduced motion renders flat text.
- `[C]` App mark is a pine keycap with a paper keyhole
  (`src/assets/meboard-mark.svg`); favicon and manifest use `public/mark.svg` and
  `public/mark-maskable.svg`. The Freebuff template logo is gone from the chrome.
- `[C]` `components/Buffface.tsx` is the only Freebuff door: an in-house mascot
  chip in the landing footer and app nav that opens a colophon with an optional
  `VITE_VLY_APP_ID` project link. Buffface is **not** an official Freebuff mark.
- `[A]` No raster assets: no PNG icons, no Open Graph card. The environment has
  no SVG rasteriser, browser, or font stack; the SVGs are the source of truth.

### Environment / tooling

- `[R]` Verification is `bunx convex dev --once && bunx tsc -b --noEmit`.
- `[C]` `vite.config.ts` must keep `server.hmr: false`; the platform owns the dev server.
- `[C]` Do not edit `.env*`; secrets come from the platform UI.
- `[C]` Never hand-edit `src/convex/_generated/*`.
- `[R]` **`git` and GitHub commands are blocked in this environment**; version
  control is platform-managed. Do not promise a push, branch, or commit.
- `[C]` Terminal commands are synchronous with a hard timeout; no background
  processes, no `bun run dev`, no killing ports.
- `[A]` An embedded preview iframe may block `getDisplayMedia`; the app handles
  the error and tells the user to open a real tab. Not reproduced (no browser).

### Devices

- `[A]` HP Chromebook (ChromeOS, near-unresponsive panel) as host — UI is
  keyboard-operable by construction; capture picker not verified.
- `[A]` Samsung Galaxy Tab A9 as viewer — not exercised on hardware.
- `[A]` Motorola Moto G 5G 2024 as viewer — not exercised on hardware. New target
  as of this revision; treat as unverified until a session is logged.

---

## 4. Invariants (do not break)

| ID | Invariant | Why |
| --- | --- | --- |
| INV-1 | Convex stores only `code`, membership, status, and SDP payloads. No media, no text sheet persistence. | Privacy claim on the landing page |
| INV-2 | The text sheet is real DOM text (no canvas) in a `role="log"` + `aria-live="polite"` region. | This is the accessibility product |
| INV-3 | Every query/mutation checks auth **and** board membership server-side. | Client checks are cosmetic |
| INV-4 | `signals` rows are transient: deleted on `joinRoom`, `endRoom`, and superseded on `postSignal`. | Prevents stale-SDP handshakes |
| INV-5 | Only the host can offer; only the viewer can answer. | Single-writer, no glare |
| INV-6 | One offer per `viewerToken` change (the host effect keys on it). | Reloaded viewer gets a fresh handshake |
| INV-7 | UI copy never promises cursor/keyboard control. | DR-1; a lie here breaks trust |
| INV-8 | Doc claims match code; unverified claims are labelled `[A]`/`[P]`. | R1, R3 |
| INV-9 | Auth files (`auth.ts`, `auth.config.ts`, `auth/emailOtp.ts`) and `_generated/*` are not edited by hand. | Template contract |
| INV-10 | A label must match its destination (e.g. "Open dashboard" → `/dashboard`). | Fixed once; do not regress |

---

## 5. Contracts

### 5.1 Handshake sequence (normative)

1. Host: capture → `createRoom` → `roomId` + `code`, `status: "waiting"`.
2. Viewer: `joinRoom(code)` → signals cleared → `viewerToken` regenerated → `status: "live"`.
3. Host: observes new `viewerToken` → closes any old peer → new `RTCPeerConnection`
   → adds tracks → creates `meboard` data channel → offer → gather → `postSignal("offer")`.
4. Viewer: sees an offer from `host` → closes old peer → `setRemoteDescription`
   → answer → gather → `postSignal("answer")`.
5. Host: applies answer only when `signalingState === "have-local-offer"`.

Any agent changing this sequence must update steps 1–5 here and re-run the
runbook smoke test.

### 5.2 Change protocol

1. Read this file, then `README.md` conventions.
2. Make the smallest change that satisfies the request.
3. `bunx convex dev --once && bunx tsc -b --noEmit` — both must exit 0.
4. Update `QRD.md` if facts, invariants, or contracts moved.
5. Update `README.README.md` / `ROADMAP.ROADMAP.md` if user-facing truth moved.
6. Do not report a capability as working unless observed (R1).

---

## 6. Decision records

**DR-1 — No desktop control from the browser.** *Accepted.*
A web page cannot inject pointer/keyboard events into an OS, and Crostini cannot
inject into ChromeOS's input stack. Remote control requires a native host agent.
Product stance: Meboard shows and carries text; Chrome Remote Desktop's one-time
support code does control. Revisit only via the pty-scoped path in Phase 3.

**DR-2 — Convex is the signalling channel, not a media server.** *Accepted.*
Reactive queries give offer/answer delivery for free, with auth and audit already
present. Media stays peer to peer. Consequence: no TURN, so cross-network
sessions fail until Phase 2.

**DR-3 — Full ICE gathering, no trickle.** *Accepted.*
Two messages instead of many, no candidate-ordering bugs, simpler client. Cost:
up to 2.5 s slower connect and slightly larger payloads.

**DR-4 — One viewer per board.** *Accepted for v0.1.*
Multi-viewer needs either per-viewer peer connections on the host or an SFU. Not
worth it before a second-viewer demand exists. A new join replaces the old viewer.

**DR-5 — `viewerToken` as the renegotiation trigger.** *Accepted.*
Cheap (one string per join) and makes reload-idempotent. Chosen over time-based
or socket-presence heuristics, which Convex queries cannot observe.

**DR-6 — `ConvexError` for user-facing failures.** *Accepted.*
Keeps stack traces out of the UI while letting the client show `error.data`
verbatim.

**DR-7 — Documentation set is four files with these exact names.** *Accepted.*
`ROADMAP.ROADMAP.md`, `README.README.md`, `runbook.runbook.txt`, `QRD.md`.
The doubled extensions are intentional owner convention; do not "tidy" them.

---

## 7. Known debt and inconsistencies

| Item | Status | Where it is tracked |
| --- | --- | --- |
| No room TTL; a closed host tab leaves `status: "live"` | open | Roadmap Phase 1 |
| Viewer keeps a black video when the host stops | open | Roadmap Phase 1 |
| No TURN → cross-network sessions fail | open (by design) | Roadmap Phase 2, DR-2 |
| Marker position drifts with aspect-ratio mismatch | accepted limitation | runbook §5 |
| `myRoom` can surface a stale board from a previous session | open | Roadmap Phase 1 |
| Single viewer only | accepted limitation | DR-4 |
| No automated tests; smoke test is manual | open | runbook §8 |
| Android host vs viewer paths untested on Tab A9 / Moto G 5G 2024 | open | Roadmap Phase 0 |
| Pixel-only output does not solve TUI accessibility | open | Roadmap Phase 3 |

If an agent finds a **new** inconsistency, add it here with the date rather than
silently fixing the doc to match a buggy implementation.

---

## 8. Glossary

- **Board** — one room row: a host, an optional viewer, a code, a status.
- **Signal** — one SDP offer or answer stored in `signals`.
- **Host** — the device capturing its own screen (`rooms.hostId`).
- **Viewer** — the device watching (`rooms.viewerId`), one per board.
- **Text sheet** — the data-channel panel; the accessibility surface.
- **Marker / ping** — a tap on the viewer's video, drawn as a ring on the host.
- **`viewerToken`** — random string regenerated per join; the host's renegotiation key.

---

## 9. Handoff checklist (for the next agent)

- [ ] Re-read section 3; re-verify anything you rely on with `[C]`/`[R]`.
- [ ] Confirm the code still matches sections 4 and 5. If not, stop and reconcile.
- [ ] Know the environment limits: no `git`, no dev-server control, no background jobs.
- [ ] Do not promise a push; say version control is platform-managed.
- [ ] Before reporting completion, state what you ran, what passed, and what you
      could not verify.

---

## 10. Revision log

| Date | Change |
| --- | --- |
| 2026-11-03 | Initial contract: v0.1 facts, INV-1..10, DR-1..7, debt table |

## 11. Latch — device enrolment (added 2026-11-18)

## 11.1 Facts

Legend as in §3: `[C]` read from code · `[R]` confirmed by running it ·
`[A]` assumed / not exercised · `[P]` planned.

- `[C]` Two tables. `devices`: `ownerId`, `name`, `platform`, `token`,
  `tokenTail`, `createdAt`, `lastSeenAt?`, `revokedAt?`; index `by_token`,
  `by_owner`. `pairings`: `ownerId`, `code`, `name`, `platform`, `createdAt`,
  `expiresAt`, `claimedAt?`, `deviceId?`; index `by_code`, `by_owner`.
- `[C]` `busEvents` gained an optional `deviceId`, so a device's traffic is
  distinguishable from a browser session's in the same log.
- `[C]` Pairing code: 6 characters, the same alphabet as room codes
  (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), **3-minute TTL, single use**. The code is
  claimed (`claimedAt` set) *before* a token is minted, so two simultaneous
  redemptions cannot both succeed.
- `[C]` Expired, already-used, and unknown codes are indistinguishable to the
  caller: one uniform `401`. Never a different message per failure mode.
- `[C]` `POST /latch/pair` on the `.convex.site` host takes the code and returns
  the token once. `lookupToken` resolves device tokens first, then the existing
  user bus tokens, so device traffic rides the same publish/poll paths.
- `[C]` Presence is a side effect of polling: `touchDevice` throttles to one
  write per 20 s, and `/devices` reads `lastSeenAt` rather than a socket.
- `[C]` `revoke` sets `revokedAt` and keeps the row. Revocation is a receipt, not
  a delete — the token tail stays visible so a person can tell *which* device
  they killed.
- `[C]` CLI surface: `latch enroll [CODE] | status | listen`, plus `--once`,
  `--interval`, `--url`, `--clip`. Config at `~/.latch/config.json`, mode `0600`.
  `LATCH_TOKEN`, `LATCH_NAME`, `LATCH_URL`, `LATCH_CONFIG` override.
- `[C]` The default endpoint is baked in at build time from `VITE_CONVEX_URL`
  (rewritten to `.convex.site`), so an installed binary needs no flag.
- `[R]` `bun run latch:test` (`scripts/latch-e2e.mjs`) runs 15 checks against a
  stub: 0 exit on success, and it fails loudly (exit 1) when the client is
  deliberately broken.
- `[R]` `bun run latch:build` emits one ~19 kB ESM file at `dist-latch/latch.mjs`
  with zero runtime dependencies, node 18+. Output lives in `dist-latch/` and not
  `dist/` because `vite build` empties `dist/`.
- `[R]` Cloned fresh from the branch, `bunx tsc -b` exits 0 and `bun run lint`
  exits 0 with 17 `react-refresh` warnings and no errors (2026-11-18).
- `[A]` **Never deployed.** No `devices` or `pairings` row exists on any real
  deployment. `[A]` **`/devices` has never been rendered in a browser.**
  `[A]` No device has enrolled against a real backend on any OS.
- `[A]` `scripts/install-latch.ps1` has never been parsed, let alone run on
  Windows.

## 11.2 Invariants

| ID | Invariant | Why |
| --- | --- | --- |
| INV-11 | Latch observes only. No input injection, no remote execution, no file push. | DR-1 and DR-12; a device that can be typed into is a different product with a different threat model |
| INV-12 | A pairing code is single-use, ≤3 min, claimed before minting, and every failure is one uniform 401. | Codes are the only credential path that crosses a terminal by hand |
| INV-13 | Device tokens are per-device and revoked by receipt, never by deletion. | You must be able to tell which machine you killed |
| INV-14 | `--clip` is never the primary enrolment path and never advertised as one. | ChromeOS refuses programmatic clipboard reads inside Crostini (DR-13) |

## 11.3 Decision records

**DR-12 — No input injection in Latch.** *Accepted.*
Same reasoning as DR-1, one layer down: a native agent *could* inject, which
makes it a product decision rather than a browser limitation. Shipping it
without a consent surface would change the product silently. Blocked pending
that surface (see §11.5).

**DR-13 — Clipboard demoted to a Windows/macOS shortcut.** *Accepted, supersedes
any earlier clipboard-first plan.*
ChromeOS blocks programmatic clipboard reads inside the Linux container by
design. A path that works on two platforms and fails silently on the third is
worse than one that is honest about being a shortcut.

**DR-14 — Device functions live in `bus.ts`, not a new module.** *Accepted.*
`src/convex/_generated/*` is never hand-edited (INV-9), and codegen cannot run
without an authenticated deployment. Co-locating the device functions with the
bus keeps `api.bus.*` resolving for the app before the next push.

**DR-15 — Pairing codes never carry an endpoint.** *Accepted.*
`latch enroll https://host/CODE` would put the deployment in the hands of whoever
mints the code and is one step from a credential-phishing shape. The endpoint is
baked into the binary at build time or passed explicitly with `--url`.

**DR-16 — React Compiler rules are scoped off `src/components/ui/**` only.**
*Accepted.*
Vendored shadcn primitives predate those rules and fixing them means forking the
components. The exemption is an explicit allowlist of compiler rules;
`rules-of-hooks` and `exhaustive-deps` still apply there. App code is never
exempt.

## 11.4 Known debt (additions to §7)

| Item | Status | Where it is tracked |
| --- | --- | --- |
| Latch has never been deployed; no real enrolment has happened | open | `TODO.md` §0 |
| `/devices` never rendered for a human | open | `TODO.md` §2 |
| Device tokens never expire — they live until revoked, and `~/.latch/config.json` travels in any home-directory backup | open | `TODO.md` §5 |
| `install-latch.ps1` unparsed; the `.cmd` shim claim untested | open | `TODO.md` §3 |
| No boot persistence — a rebooted machine stops reporting | open | `TODO.md` §5 |
| Two separate six-character code systems (`/live` join, Latch pairing) that will drift | open | `TODO.md` §5 |
| Phantom-tap definition unresolved | blocked | `TODO.md` §4 |

## 11.5 Delegated work (agent-takeable)

Each item states what "done" means so the agent can stop. All are
decision-free and account-free.

1. **Device token TTL.** `expiresAt` on `devices`, set at redemption from a
   named constant; `lookupToken` refuses an expired device through the same path
   as revoked; `/devices` shows "expires soon"/"expired" instead of a green dot;
   `latch status` says *why* it was rejected. Do not change bus token behaviour.
   *Done when* an expired device gets a 401 and the page names the device.
2. **Accessibility pass on `/devices`.** The code must be announced, not just
   drawn (`aria-live` on creation, readable digits, a copy control usable without
   sight); the countdown must not announce every second; full keyboard path from
   name field to code; nothing clipped at 200% zoom or 360 px; the token
   `details` opens and closes from the keyboard. *Done when* enrolment can be
   completed with the screen off.
3. **Document Latch where people look.** A short section in `README.README.md`
   (what it is, the four commands, observe-only) and a section in
   `runbook.runbook.txt` after the Chrome Remote Desktop pairing one (minting,
   the three-minute window, what to do when a code will not redeem). Say plainly
   in both that `--clip` is Windows/macOS only and why. *Done when* someone who
   has never seen the project can enrol from the docs alone.
4. **Parse the Windows installer.** Run `scripts/install-latch.ps1` through the
   PowerShell language parser and fix anything it reports. If a Windows runner
   exists, assert `latch help` from `cmd.exe` and PowerShell and that the
   generated `.cmd` quotes a path containing a space. If no Windows environment
   exists, say so and stop — do not claim it works.
5. **GRIMOIRE sidecar adapter.** `config.ts` already honours `LATCH_CONFIG` and
   `LATCH_URL`. Expose `enroll`, `status`, `listen` as callable functions rather
   than argv, keeping exit-code semantics as thrown errors with a `status` field.
   No new dependencies.
6. **Boot persistence.** `systemd --user` on Linux/Crostini, a LaunchAgent on
   macOS, `Termux:Boot` on Android. Without it, "pre-installed" only means
   "installed".
7. **Unify the code systems.** `/live` join codes and pairing codes are the same
   primitive — same alphabet, same collision retry, same shape. One module, one
   expiry policy, one place to reason about brute force.

## 11.6 Environment note for the next agent

The verification available in this environment is `bunx tsc -b`,
`bun run lint`, `bun run latch:test`, `bun src/lib/keyboard/selftest.ts` and
`bun src/lib/persona/selftest.ts`. It is **not** a deployment: `bunx convex
dev --once` needs an authenticated account, and `bunx convex codegen` fails with
`MissingAccessToken` without one. Do not report the backend as working on the
strength of a typecheck — R1 applies exactly here.

Build with `bun`, and keep `bun.lock`. Do not upgrade dependencies to make
something compile.

## 11.7 Revision log (append)

| Date | Change |
| --- | --- |
| 2026-11-18 | §11 added: Latch facts, INV-11..14, DR-12..16, debt rows, delegated work |
