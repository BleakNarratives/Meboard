# QRD §11 — Latch, device enrolment

> **Read this as `QRD.md` §11.** It is a separate file only because `QRD.md` is
> already 26 kB and a single commit of that file cannot be delivered intact from
> the environment this was written in — a truncated contract document is worse
> than a correctly-named one. Fold it into `QRD.md` after §10 when a full-file
> commit is available, and delete this note. The numbering, invariants and
> decision records below are the normative ones; nothing here is provisional.

Added 2026-11-18.

Appended rather than inserted so this file stays a pure addition; §7's debt
table gains the rows in §11.4, listed there rather than moved.

Latch is the pre-installed, per-device, same-account agent: a program on a
machine that keeps a line open to the owner's Meboard account so the machine can
report in without a screen share being started. **Observe only. It reports. It
does not type, click, or run anything** — see INV-11 and DR-12.

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
