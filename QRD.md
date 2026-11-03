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

- `[C]` `/` public · `/auth` public (honours `?returnTo=`) · `/dashboard` protected · `/live` protected · `/lab` protected · `*` → NotFound.
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
