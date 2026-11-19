# MEBOARD — brainstorm and follow-ups

Not a spec. A list of things worth doing, in the order I would do them, with the
reason each one is worth the time. Anything blocked on a decision is marked.

Actionable items move to `TODO.md` (the queue), `QRD.md` §11.5 (agent work) and
`MRD.txt` (rigging). This file keeps the reasoning and the ideas.

---

## Where we are, in one screen

Latch works: a device enrols with six characters, holds its own token, polls the
bus, prints what arrives, and can be revoked without touching the others. The
CLI is one dependency-free file that runs on node anywhere. The page that mints
codes exists but has never been seen by a human. The backend has never been
deployed.

That last sentence is the whole risk. Everything else on this page is optional
until it is false.

---

## Finishing the lint

`bun run lint` exits 0 — no errors, 17 warnings. All four sites are closed:

- **`carousel.tsx:96` and `sidebar.tsx:611`** — `src/components/ui/**` is exempt
  from the React Compiler rules, as an explicit allowlist of compiler rules
  only. `rules-of-hooks` and `exhaustive-deps` still apply there. Do not widen
  the exemption; do not fork the shadcn components.
- **`use-mobile.ts:14`** — reads the viewport through `useSyncExternalStore`,
  which also removes a first-paint flash of the desktop layout on a phone.
- **`KeyboardSurface.tsx:52`** — refused words are state rather than a ref. The
  ref could not be a memo dependency, so pressing "No" never re-rendered and the
  offer stayed on screen until the word changed. Selftest 45/45 before and
  after; no other behaviour touched.

The `no-control-regex` disables in `bus.ts`, `engine.ts` and `Auth.tsx` are
documented — the regexes are the guard, not the bug.

Warnings are a separate conversation: 17 `react-refresh/only-export-components`
across `ui/`, `main.tsx` and the toolbar, plus 4 unused disable directives in
`src/convex/_generated`. None of them fail `bun run lint` today. If you ever
want them gone, the honest move is `--max-warnings 0` **after** fixing them, not
before.

---

## Follow-ups, in order

**1. Look at `/devices` (blocked on a human).**
Every layout decision on that page is a guess. Countdown, strikethrough, the
collapsed token section — none of it has been rendered for a person.

**2. Pairing polish (small, worth it).**
- A copy button for the code itself, not just the command.
- When a code expires, offer **New code** in place instead of making the user
  scroll back to the form.
- Say "case and spaces don't matter" somewhere visible. The CLI already
  normalises `4k7 q2m`, and nobody will guess that.
- Show which device name the code is for in the big block, not just above it.

**3. Device tokens that expire (small, security).**
An `expiresAt`, refused in `lookupToken` the same way `revoked` is. `/devices`
shows "expires in 6 days" instead of a dot. Backups and sync services are the
threat, not other users on the box.

**4. Tap suppression (blocked on a decision).**
Proposal on the table: pointer-down to pointer-up over ~180 ms, movement past
~12 px, or a scroll-cancelled gesture, and no marker is dropped. Long-press is
not a tap. Needs your yes before it is code.

**5. Mirror pause / battery (blocked on a decision).**
Paused raster or frozen frame? That is a product question about honesty, not a
technical one.

**6. GRIMOIRE adapter (small, unblocked).**
`LATCH_CONFIG` and `LATCH_URL` already exist. The adapter is argv removed and
errors with a `status` field kept.

**7. Latch survives a reboot.**
"Pre-installed" currently means "installed". The next step is a user service:
`systemd --user` on Linux and Crostini, a LaunchAgent on macOS, `Termux:Boot` on
Android. Without it, the device is only reachable while somebody remembers to
run it — which defeats the point for the machine with the broken screen.

**8. Unify the two six-character codes.**
`/live` join codes and Latch pairing codes are the same primitive — same
alphabet, same collision check, same shape. One `codes.ts`, one expiry policy,
one place to reason about brute force. Right now they are twins that will drift.

---

## Ideas worth arguing about

**A "support session" object.** Today a support call is: a room, a device, and a
log, loosely related by the same account. Tie them together — one row that says
"this session, this machine, these events" — and the audit trail stops being
three lists you have to mentally join.

**The rail as the phone shell.** `/live?rail=1` already exists for this. With
Latch running on the host, the phone could be a genuine companion: text both
ways, markers, and a "what is it doing" feed, without ever opening a laptop.

**Pairing codes that carry a URL.** Tempting, and I would not do it. `latch
enroll https://meboard.example/4K7Q2M` is one character away from a
credential-phishing shape, and it puts the deployment in the hands of whoever
mints the code. Keep the endpoint baked in the binary.

**Keyhole commenting on device events.** No. The mascot does not narrate a
security decision, and a pairing code is a security decision. It would also need
a format bump.

---

## Things I would refuse to build without an explicit decision

- **Any input injection.** `latch type`, `latch key`, `latch run`. A device that
  can be typed into is a different product with a different threat model.
- **An agent that updates itself.** Silent capability change on a machine
  somebody is trying to rescue.
- **Telemetry.** The pitch is "the room we borrowed", not "phone home".
- **Emailing or messaging a token.** They go in a config file on the device, or
  they go nowhere.

---

## Open questions for you

1. Is **Latch** the name, or is it still **Doorway**?
2. Should device tokens expire by default, and after how long?
3. Does GRIMOIRE share Meboard's deployment, or run its own?
4. Should `/live` join codes move onto the same pairing table, or stay separate?
5. Is the Crostini experience of typing six characters at a terminal acceptable,
   or does it need something else?
