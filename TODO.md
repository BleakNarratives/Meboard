# TODO.md — what is left, and who does it

The queue. `QRD.md` is the contract (what is true and why), `MRD.txt` is the
rigging procedure, `MEBOARD_START_HERE.md` is the onboarding, and this is the
list of work.

**[you]** — needs an account, hardware, or a judgement call. Nobody else can.
**[agent]** — safe to delegate: no decisions, no secrets, no accounts.
**[blocked]** — starts with a [you] in front of it; do not start.

Every command here is literal and complete. Nothing needs filling in.

---

## 0. The one thing that unblocks everything

- [ ] **[you]** Push the backend to your Convex deployment.

      bunx convex dev --once

  This is what creates the `devices` and `pairings` tables and uploads
  `createPairing`, `redeemPairing` and the `/latch/pair` route. Until it runs,
  `/devices` cannot mint a code and no device can enrol. It needs your Convex
  login; it cannot be done from a sandbox. See `MEBOARD_START_HERE.md` for what
  it does line by line.

---

## 1. First real device

- [ ] **[you]** Build and install the program.

      bun run latch:build
      sh scripts/install-latch.sh

  Windows instead of the second line:

      powershell -ExecutionPolicy Bypass -File scripts\install-latch.ps1

- [ ] **[you]** Open `/devices`, sign in, name the device, press **Get a code**.
      Six characters, three minutes, one use.
- [ ] **[you]** On the device:

      latch enroll 4K7Q2M
      latch status

  `4K7Q2M` is an example — use the code on your screen, not that one.

**Done when** `status` says `auth ok` and `/devices` shows a green dot within
90 seconds. That single result validates every line of the Latch work. Nothing
below it matters until it is true.

---

## 2. Look at the page

- [ ] **[you]** `/devices` has never been rendered for a human. Check, in order:
      the code is readable at a glance; the countdown counts and greys out at
      0:00; copy is disabled once the code is dead; the device list shows name,
      platform, token tail and last-seen; revoke kills one token and leaves the
      others alive; light and dark both look deliberate.

  Any mismatch with what you expect is a bug, not a taste question.

---

## 3. The three platforms

Each proves one specific claim. All **[you]**.

- [ ] **Crostini / the Chromebook.** Type the code by hand at the terminal. This
      is the path that replaced the clipboard. If typing six characters here is
      unpleasant, that is a design problem and it needs fixing.
- [ ] **Termux.** `pkg install nodejs`, then check that `latch listen` survives
      the Android app going to the background, and note what happens to polling.
- [ ] **Windows, both shells.** Install with the `.ps1`, then run `latch help`
      and `latch enroll` from `cmd.exe` *and* from PowerShell. The `.cmd` shim is
      supposed to serve both; that claim is untested.

Do not test `--clip` on Crostini. ChromeOS blocks programmatic clipboard reads
inside the Linux container by design, which is why pairing is the front door.

---

## 4. Decisions only you can make

These block real work. Answer them before asking for the next slice.

- [ ] **Phantom taps.** What counts as one? The proposal on the table: suppress a
      tap when press-to-release exceeds ~180 ms, when the pointer moved more than
      ~12 px, or when a scroll cancelled the gesture. Long-press is not a tap.
- [ ] **Mimic screen going dark.** Paused raster with a live stream, or a frozen
      last frame? Battery versus honesty about whether it is still working.
- [ ] **Input injection, ever.** Latch cannot type, click or run, and that is a
      decision, not a gap. If that ever changes, the consent surface is yours to
      specify: what the far side sees, how they stop it, what gets logged.
- [ ] **Latch or Doorway** as the name.
- [ ] **Does GRIMOIRE** share Meboard's deployment or run its own?

---

## 5. Delegated — detail in `QRD.md` §11.5

- [ ] **[agent]** Device token TTL (`expiresAt`, refused in `lookupToken`).
- [ ] **[agent]** Accessibility pass on `/devices` (announce the code, quiet
      countdown, full keyboard path, 200% zoom, 360 px).
- [ ] **[agent]** Document Latch in `README.README.md` and
      `runbook.runbook.txt`.
- [ ] **[agent]** Parse `scripts/install-latch.ps1` with the PowerShell parser.
- [ ] **[agent]** GRIMOIRE sidecar adapter (callable, no argv).
- [ ] **[agent]** Boot persistence: `systemd --user`, LaunchAgent, `Termux:Boot`.
- [ ] **[agent]** Unify the two six-character code systems (`/live` join codes
      and pairing codes are the same primitive).

---

## 6. Blocked

- [ ] **[blocked]** Phantom-tap suppression — needs the definition in §4.
- [ ] **[blocked]** Mirror pause / battery mode — needs the decision in §4.
- [ ] **[blocked]** Any input injection — needs the consent surface in §4.
- [ ] **[blocked]** Publishing anything that depends on a deployed backend —
      needs §0.

---

## 7. Done, so nobody re-opens it

- [x] `devices` + `pairings` schema, per-device tokens, revoke as receipt
- [x] `POST /latch/pair`, single-use codes, 3-minute TTL, uniform 401
- [x] `latch enroll | status | listen`, `--once`, `--interval`, `--url`
- [x] ~19 kB dependency-free bundle at `dist-latch/latch.mjs`, node 18+
- [x] POSIX and Windows installers
- [x] `/devices` page: pairing primary, token demoted, `--clip` marked
      Windows/macOS only
- [x] `scripts/latch-e2e.mjs` wired to `bun run latch:test` — 15 checks
- [x] `bun run lint` exits 0 (17 warnings, all `react-refresh` in primitives)
- [x] Keyboard: refusing a repair actually removes it; selftest 45/45
- [x] `MEBOARD_START_HERE.md` onboarding + `MEBOARD_BRAINSTORM.md`
