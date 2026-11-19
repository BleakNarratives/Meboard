# TODO.md — what is left, and who does it

The queue. `QRD.md` is the contract (what is true and why), `MRD.txt` is the
rigging procedure, `MEBOARD_START_HERE.md` is the onboarding, `STANK.md` is the
list of things that are wrong or unproven, and this is the list of work.

**[you]** — needs an account, hardware, or a judgement call. Nobody else can.
**[agent]** — safe to delegate: no decisions, no secrets, no accounts.
**[blocked]** — starts with a [you] in front of it; do not start.

Every command here is literal and complete. Nothing needs filling in.

---

## 0. The backend — pushed 2026-11-18

- [x] `convex dev` against `bleaknarratives:meboard` / `standing-sockeye-398`
      added 16 indexes and reported `Convex functions ready! (13.7s)`.

Three things came out of that and are still open.

- [ ] **[you]** Commit `src/convex/_generated/*`. Codegen ran on the tablet; the
      branch still carries the previous generated types, so what is checked in
      and what the deployment knows can disagree until this lands.
- [ ] **[you]** Set `VLY_CONVEX_AUTH_ISSUER` (and `SITE_URL`) on the deployment.
      Without the first, `convex dev` refuses to push at all — the code has a
      fallback, but Convex scans `auth.config.ts` and stops. Value it already
      defaults to: `https://auth.freebuff.app`.
- [ ] **[blocked]** Email sign-in — needs `VLY_INTEGRATION_KEY`, issued only
      when a project is created through freebuff's own flow. Guest sign-in
      works and Latch needs neither. See `STANK.md`.

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

## 3. The platforms

Each proves one specific claim. All **[you]**.

- [ ] **Crostini / the Chromebook.** Type the code by hand at the terminal. This
      is the path that replaced the clipboard. If typing six characters here is
      unpleasant, that is a design problem and it needs fixing.
- [ ] **Termux.** `pkg install nodejs`, then check that `latch listen` survives
      the Android app going to the background, and note what happens to polling.
- [ ] **Windows, both shells.** Install with the `.ps1`, then run `latch help`
      and `latch enroll` from `cmd.exe` *and* from PowerShell. The `.cmd` shim
      is supposed to serve both; that claim is untested.
- [ ] **macOS.** Untested entirely, including the `--clip` path that only exists
      for it.
- [ ] **Placeholders nobody has touched:** arm64 Linux (Pi) and x86_64 desktop.
      The table in `MEBOARD_START_HERE.md` says so; keep it saying so.

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
- [ ] **[blocked]** Email sign-in — needs `VLY_INTEGRATION_KEY` (see §0).

---

## 7. Done, so nobody re-opens it

- [x] `devices` + `pairings` schema, per-device tokens, revoke as receipt
- [x] Schema pushed and codegen run against a live deployment (2026-11-18)
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
- [x] Fresh-deployment env table, Termux section and environments matrix
- [x] `emailOtp` refuses cleanly when `VLY_INTEGRATION_KEY` is unset
- [x] `MRD.txt` operator notes: missing OTP key, demo material
- [x] Five unrelated lint/behaviour fixes split onto `fix/incidental` (PR #2)
- [x] Hidden `latch ghost`, typechecked on the runner before it landed

---

## 8. Caveats, written down so they stop being folklore

These are the things I have said out loud in review and that were not
anywhere in the repo. None of them are disasters; all of them are
"unproven" rather than "false".

- [ ] **[agent]** `bun run latch:test` is a **stub, not a deployment**. The 15
      checks run the built CLI against a local socket; no request reaches
      Convex. It proves the CLI's own logic and nothing about the backend
      contract. Stub constants are `GOOD_TOKEN = "a".repeat(48)` and
      `GOOD_CODE = "4K7Q2M"`.
- [ ] **[you]** Every "verified" claim in these docs is a person remembering to
      run a command. There is no CI for `tsc`, `lint` or `latch:test` — the only
      automation on this repo is GitGuardian. A regression in types or lint
      will not be announced by anything.
- [ ] **[agent]** `lint` exits 0 with **17 warnings** (`react-refresh` in UI
      primitives). Warnings are tolerated, not baselined. The count drifts
      silently; treat a change in it as a signal.
- [ ] **[agent]** `MRD.txt` still opens with "Last verified: 2026-11-04 against
      the code. Not yet verified on glass." The Latch sections were added
      2026-11-18 and **nobody has been on glass since**. The header is honest;
      the added content has never been through it.
- [ ] **[agent]** `MRD.txt` has broken line wrapping from successive edits — a
      `ChromeOS` fragment on its own line, bullets that lost their indent, a
      sentence split mid-clause. Cosmetic, but it makes the one procedural
      document look untrustworthy exactly where it needs to look reliable.
- [ ] **[agent]** `scripts/install-latch.ps1` has never been **parsed**, let
      alone run. It is shipped code with zero evidence behind it.
- [ ] **[you]** `--clip` is documented for Windows and macOS. Neither has ever
      tried it. That is why pairing is the front door and the clipboard is a
      convenience.
- [ ] **[agent]** `latch ghost` is a hidden code path with **no test**. A runner
      typechecked it before commit; that is the entire body of evidence.
- [ ] **[you]** No sign-in code has ever been delivered from this deployment.
      The missing-key path is now clear, but the working path has not run.
- [ ] **[agent]** `npm audit` reports 10 vulnerabilities (4 moderate, 4 high,
      2 critical) in the template's dependency tree. Untriaged, not shown to be
      reachable, deliberately not "fixed" with `--force`. See `STANK.md`.
- [ ] **[you]** The CLI help text claims more than anyone has tested: `node 18+
      · bun · deno` and `windows powershell · cmd · macos · linux · crostini ·
      termux`. Deno has never run it; neither has macOS or cmd.exe.
- [ ] **[agent]** If the docs and the environments table disagree, the table in
      `MEBOARD_START_HERE.md` is the newer claim.
