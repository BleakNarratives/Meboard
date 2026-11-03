# Meboard — Roadmap to Deployment

**Status:** v0.1 — working end-to-end on one network, single viewer, no relay.
**Last updated:** 2026-11-03
**Owner:** project owner (Samsung Tab A9 + Samsung Moto G 5G 2024 as viewer
devices; HP Chromebook with a failing panel as the host device).

This file is the plan. `runbook.runbook.txt` is the procedure. `QRD.md` is the
context contract for any agent or model picking this up.

---

## Where it stands today

| Capability | State | Notes |
| --- | --- | --- |
| Host captures its own screen | ✅ shipped | `getDisplayMedia`, whole screen or one window |
| Six-character join code | ✅ shipped | ambiguity-free alphabet, no 0/O/1/I/L |
| Second device watches live | ✅ shipped | direct WebRTC, STUN only |
| Two-way text sheet | ✅ shipped | data channel, real DOM text, copy buttons |
| Tap-to-point marker | ✅ shipped | normalized coordinates, approximate |
| Same account on both devices | ✅ shipped | Convex Auth, email OTP |
| Works across different networks | ❌ | no TURN relay yet; see Phase 2 |
| More than one viewer | ❌ | one board = one viewer, by design for now |
| Cursor / keyboard control of the host | ❌ | impossible from a web page; see DR-1 |
| Terminal relay (read a TUI without pixels) | ❌ | Phase 3, this is the real accessibility win |
| Android Chrome as a viewer (Tab A9, Moto G) | ⚠️ | expected to work, not yet exercised on hardware |
| Keyboard-only host operation | ⚠️ | UI is real DOM, but the capture picker needs testing |
| Reductive typo repair (`,y` → `my`) | ✅ shipped | `src/lib/keyboard/repair.ts` — rules ranked by key-width cost, `explainToken()` audit trail, 45 checks |
| Hit targets that move, slowly | ✅ shipped | `src/lib/keyboard/adapt.ts` — 3 distinct sessions + 4-session cooldown, capped at 12% of a key |
| Adaptive key surface | ⚠️ in `/lab` | `components/KeyboardSurface.tsx` — real hit targets and offers, but not an Android IME; cannot replace the system keyboard |
| Keyhole (the voice) | ✅ shipped on `/live` | `src/lib/persona/**` — budget, escalation, mute, three one-shot eggs, 35 checks |

**Field note:** until Phase 3 lands, the working combo for the broken-screen
Chromebook is *Chrome Remote Desktop support code (control)* + *Meboard
(viewing + moving the code)*. Phase 3 is what removes the need for CRD.

---

## Phase 0 — Use it, don't build it (today)

Goal: the broken Chromebook stops being a blocker.

- [ ] Confirm the app opens in its own browser tab on the Chromebook (not the
      embedded preview frame — `getDisplayMedia` is often blocked in an iframe).
- [ ] Confirm the capture picker is reachable with Tab/Enter and "Entire screen"
      is the default selection.
- [ ] Dry run: Chromebook shares, Tab A9 enters the code, text sheet moves a
      string both ways.
- [ ] Repeat with the Moto G 5G 2024 as the viewer.

**Exit criteria:** two full sessions completed, one per viewer device.

## Phase 1 — Make v0.1 trustworthy (before daily dependence)

- [ ] **Room lifecycle.** Rooms never expire today; `createRoom` closes the
      previous board but a closed tab leaves a `live` row forever. Add a
      `lastSeen` heartbeat, a Convex scheduled function that ends abandoned
      boards after N minutes, and a `by_status` index.
- [ ] **Viewer state on host end.** When the host stops, the viewer keeps a
      black `<video>`. Subscribe the viewer to `roomState.status` and show
      "the host stopped sharing" instead.
- [ ] **Reconnect.** One ICE failure kills the session until both sides stop and
      start again. Add a retry button that re-runs the offer/answer for the
      current `viewerToken`.
- [ ] **Join throttling.** A 31^6 (~887M) code space is safe from casual
      guessing, but record failed joins per user and add a soft limit.
- [ ] **Error copy.** Every failure path says what to do next, not just what
      broke. Existing `ConvexError` messages are the pattern.
- [ ] **Accessibility pass, screen-reader-only.** Full keyboard traversal of
      `/live` with ChromeVox and with TalkBack on Android: status region
      announces connection changes, log region announces new text, no focus
      traps, marker has a text equivalent.
- [ ] **Docs truth check.** `README.README.md`, this file, and `QRD.md` must
      match the code exactly at the end of the phase.

**Exit criteria:** a week of use with no stuck rooms, no silent black video,
and every error message actionable.

## Phase 2 — Make it work off your own Wi-Fi

- [ ] **TURN.** Add a relay so carrier NAT and guest networks work:
      `iceServers` from env (`VITE_TURN_URL`, `VITE_TURN_USER`,
      `VITE_TURN_CREDENTIAL`). Prefer managed TURN (Metered/Twilio-style) for
      launch over self-hosted coturn; self-hosting is a bandwidth-and-uptime
      liability for a two-person product.
- [ ] **Adaptive quality.** 20 fps fixed today. Add `RTCRtpSender.setParameters`
      bitrate ceiling and let resolution drop before frame rate on weak links.
- [ ] **Connection diagnostics.** Show candidate pair type (`host`/`srflx`/
      `relay`) in a collapsible "connection" panel. This is the single most
      useful support signal and costs one `getStats()` call.
- [ ] **Feature detection.** Explicit message for browsers without
      `getDisplayMedia` (and for iOS Safari, which cannot capture).

**Exit criteria:** a session between two devices on different networks,
verified with a `relay` candidate pair.

## Phase 3 — The accessibility unlock: terminal relay

The current product shows pixels. For a screen-reader user on a Chromebook, a
curses TUI is still a black hole — the terminal's speech layer announces printed
lines, not screen contents. Mirroring does not fix that; relaying text does.

- [ ] **Design:** a small companion process in the host's Linux container that
      owns a pty, runs the user's command, and streams output as text to the
      board; keystrokes come back over the same channel.
- [ ] **Why a local process:** the pty must live where the project files and the
      tooling live. Convex actions are serverless and cannot hold a session.
- [ ] **Transport:** reuse the Convex signalling room for rendezvous, then a
      direct data channel or a WebSocket to the companion.
- [ ] **Rendering:** plain `<pre>` with real text and a copy button — linear,
      selectable, screen-reader-native. No canvas.
- [ ] **Fallback:** if the companion is absent, the board stays pixel-only;
      nothing about Phase 1–2 regresses.
- [ ] **Security:** the companion is a remote shell. It must bind to the board's
      authenticated session only, refuse unauthenticated connections, and log
      every attach.

**Exit criteria:** the CLI that got stuck at "loading the directory" is usable
from the tablet, with the picker navigable and output readable by speech.

## Phase 4 — Control (or an explicit decision not to build it)

- [ ] Write the decision record if we are not building it: browsers cannot
      inject input into an OS; Crostini cannot inject input into ChromeOS.
      A native ChromeOS host agent is the only path, and it is out of scope
      for a web product.
- [ ] If control is ever attempted: scope it to *the pty session only*
      (Phase 3), never to the desktop.

**Exit criteria:** a documented decision, referenced from `QRD.md`.

## Phase 5 — Production operations

- [ ] Separate Convex **production** deployment from dev; set `SITE_URL`,
      `JWKS`, `JWT_PRIVATE_KEY` per environment.
- [ ] Publish the frontend: build `dist` with Vite at deploy time (`dist/` is
      gitignored) and serve it with the repo's `main.ts` — a Hono app on Deno
      that static-serves `/assets/*`, then `dist/*`, then falls back to
      `index.html` for SPA routes. Point it at the production Convex
      deployment's `VITE_CONVEX_URL` at build time.
- [ ] Error tracking (Sentry or equivalent) on both client and Convex functions.
- [ ] Retention: `signals` rows are transient — delete on end and on schedule.
      Decide a `rooms` retention window and document it.
- [ ] Privacy page: video is peer-to-peer and not recorded; the text sheet is
      stored in Convex while the board is open. State this plainly.
- [ ] Smoke test after every deploy: create board, join, exchange text, stop.

**Exit criteria:** deploy → smoke test → rollback all documented in the runbook
and rehearsed once.

---

## Non-goals

- Video conferencing, recording, or broadcasting (that is restream.io /
  StreamYard territory, and they are the wrong tool for one viewer).
- File transfer as a feature (Bluetooth, FTP, and LAN shares already exist and
  are better at it).
- Desktop control from the browser (see DR-1).
- Multi-party SFU infrastructure before there is a second viewer demand.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| No TURN | Sessions fail on carrier NAT | Phase 2, env-driven relay |
| Single viewer | Two viewers collide on one board | Phase 2 multi-viewer or explicit "one viewer" copy |
| Pixel-only output | Accessibility goal unmet | Phase 3 pty relay |
| Silent room leak | Stale `live` rows, reused codes | Phase 1 heartbeat + TTL |
| Browser capture blocked in iframe | First-run failure | Open in own tab; explicit error copy (shipped) |
