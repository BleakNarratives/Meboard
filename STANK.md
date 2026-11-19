# STANK.md — what makes the room smell

Audit date: **2026-11-18**. Branch `feat/latch-devices` at `b8125ee`.

The point of this file is to be unpleasant now so that nobody is surprised
later. It is organised by the strength of the evidence, because "I think this
is broken" and "this is broken" cause different amounts of trouble.

- **§1 Is wrong now** — provable, in the repo, today.
- **§2 Sold as fact, never tested** — the docs assert it, nothing backs it.
- **§3 Placeholders, stubs, hardcoded** — fine as scaffolding, dangerous when
  forgotten.
- **§4 Deliberate, will still look like a bug** — decisions, not oversights.
- **§5 Suspected, not verified** — needs one person and ten minutes.
- **§6 Judgement: I would have done it differently.**

When an entry stops being true, delete it. A stale stink list is its own smell.

---

## 1. Is wrong now

**1.1 `MRD.txt` opens with a verification claim that does not cover its own
contents.** Line 3 says *"Last verified: 2026-11-04 against the code. Not yet
verified on glass."* The Latch sections were appended 2026-11-18 and have never
been near a device. The header is technically honest and practically
misleading: a reader takes the date to cover the whole file.

**1.2 `MRD.txt` has corrupted formatting.** Successive appends left a
`ChromeOS` fragment starting its own line, bullets that lost their indent, and
sentences split mid-clause. The content is right; it reads like it was typed by
two people who never met. This is the one document that has to look reliable.

**1.3 The checked-in types and the deployment can disagree.** Codegen ran on a
tablet and the resulting `src/convex/_generated/*` was never committed. The
schema on `standing-sockeye-398` has 16 indexes the branch's generated types
do not know about. `tsc` passes today because Convex's types are
module-level — that is luck, not agreement.

**1.4 PR #1's description is partly stale.** It still lists the five unrelated
fixes as "riding along, worth their own PR". That PR exists now (#2), so the
text describes a problem that is already solved.

**1.5 The numbers in the docs will rot.** "17 warnings", "15 checks", "485
lines", "~19 kB", "16 indexes". Every one was true on the day it was typed and
none are generated. They are claims with no owner.

---

## 2. Sold as fact, never tested

**2.1 The CLI help text advertises environments nobody has run.** It claims
`node 18+ · bun · deno (with --allow-read --allow-env --allow-run)` and
`windows powershell · cmd · macos · linux · crostini · termux`. Evidence
exists for: node on Android arm64 (Termux), node in a Linux sandbox, and the
stub suite. There is **no** evidence for deno, macOS, `cmd.exe`, or Crostini.
A help string is a promise; this one outruns the proof.

**2.2 `scripts/install-latch.ps1` has never been parsed**, let alone executed.
It ships. It is the documented Windows path. Nothing has ever read it.

**2.3 `--clip` is documented for Windows and macOS.** Neither has been tried.
The code path exists, is marked non-primary, and is the one place where a
failure would look like "the feature is broken" rather than "the platform
refuses".

**2.4 `/devices` has never been rendered.** It typechecks, lints, and its
queries are pushed. Nobody has seen it. Every layout claim about it — readable
at a glance, countdown greys out, disabled copy — is a hope.

**2.5 No sign-in code has ever been delivered** from this deployment. The
failure path is now clear and explicit; the success path is untested.

**2.6 No device has ever been enrolled.** No `devices` or `pairings` row exists
anywhere. Pair → mint → poll → revoke has never executed end to end.

---

## 3. Placeholders, stubs, hardcoded

**3.1 `latch:test` is a simulation.** `scripts/latch-e2e.mjs` stands up a stub
HTTP server on a local socket and points the built CLI at it. Fifteen checks
pass against that stub. Not one request reaches Convex. The suite proves the
CLI's parsing, storage and rendering, and says nothing about the backend's
behaviour. Constants: `GOOD_TOKEN = "a".repeat(48)`, `GOOD_CODE = "4K7Q2M"`.

**3.2 `4K7Q2M` is hardcoded across help text and docs.** It is an example and
it is labelled as one, but it appears in `cli.ts`, `MEBOARD_START_HERE.md`,
`MRD.txt` and `TODO.md`. Somebody will eventually paste it and wonder why it
fails.

**3.3 `http://localhost:5173` is baked into the onboarding** as the `SITE_URL`
value. Fine for Vite's default; wrong the moment the port changes or anything
is served over https.

**3.4 `https://integrations.vly.ai` is a hardcoded fallback** for
`VLY_INTEGRATION_BASE_URL`. If that host moves, nothing fails loudly — codes
just stop arriving, and the error will read like a network problem.

**3.5 Two rows of the environments table are explicitly placeholders** (arm64
Linux, x86_64 desktop). And one whole environment — the cloud browser — has
been used for other work but never for this app.

**3.6 `latch ghost` is shipped, hidden and untested.** A runner typechecked it
before committing. That is all. No check exercises the command, and because it
is absent from the help text, nobody will discover a regression by accident.

---

## 4. Deliberate, will still look like a bug

**4.1 Every pairing failure returns the same 401.** Expired, used, unknown and
mistyped are indistinguishable by design. This is correct for security and
infuriating for debugging; the CLI compensates with one hint ("codes last
three minutes").

**4.2 Presence is polling.** A device is "online" because it polled within the
window. Kill the process and it goes grey in ~90 s; leave it running but idle
and it still looks alive. There is no heartbeat and no distinction between
"running" and "reachable". The docs say this; the UI just shows a dot.

**4.3 Revoke is a receipt, not a delete.** Rows accumulate forever, greyed,
with token tails. Intentional — you can tell which machine you killed — but it
means the list only ever grows.

**4.4 `bus.ts` does two jobs.** Concepts and devices live in one file because a
new module would change `_generated/api.d.ts` and break `internal.*` typing
without codegen. A structural compromise, documented in the decision record,
and still 18 kB of one file holding two concerns.

**4.5 `emailOtp` throws rather than returning.** Returning normally would make
Convex Auth report a successful send and leave a person waiting for an email
that will never come. The throw is the honest option, and it is still a throw.

**4.6 The issuer value exists twice.** `auth.config.ts` defaults
`VLY_CONVEX_AUTH_ISSUER` to `https://auth.freebuff.app`, and the deployment
must also be told the same value or nothing pushes. Two sources of truth, one
of them invisible until `convex dev` refuses.

**4.7 Observe only, forever, by decision.** No `type`, no `key`, no `run`. Looks
like a missing feature to anyone who wants remote control. It is the product.

---

## 5. Suspected, not verified

These need one person and a few minutes in `src/convex/http.ts` and
`src/convex/bus.ts`. They are listed because the *shape* is suspicious, not
because a defect has been found. Do not repeat them as fact.

**5.1 Is `/latch/pair` rate limited?** Six characters over a small alphabet, a
three-minute window and single use is a good design — against guessing, only if
attempts are throttled. `authRateLimits` exists for Convex Auth; nothing seen so
far suggests the bus pairing route is covered by it. If nothing throttles it,
the credential is short enough that volume matters. **Check before claiming
anything either way.**

**5.2 Does `busEvents` ever get pruned?** It reads like an append-only log per
user with a feed query. Append-only plus no retention equals growth forever.
No sweeper was seen.

**5.3 Do expired `pairings` rows get cleaned up?** TTL is enforced at
redemption. That stops the code working; it does not stop the row existing.

**5.4 What does presence cost idle?** A device polling every 2 s with a 20 s
developer-presence write throttle is one write per 20 s per idle device — about
4,300 writes a day for a machine whose entire contribution is "still here".
Cheap, not free, and it argues for a longer interval than the default.

**5.5 CORS on the `.convex.site` HTTP routes.** The CLI does not care. A browser
would. Nobody has asked.

---

## 6. Judgement: I would have done it differently

**6.1 The test suite should hit a real deployment.** A local `convex dev`
deployment and the same 15 checks would have proven the pairing contract
instead of the CLI's opinion of it. The stub was the fast path and it bought a
false sense of coverage.

**6.2 Types and schema should move in one commit.** `_generated` committed
separately from the schema change guarantees a window where the repo lies about
the deployment.

**6.3 CI should exist.** `tsc`, `lint`, `latch:test` on every push is perhaps
forty lines of YAML. Its absence means every "it passes" in these documents is
a memory, and the only automated check on this repo is a third-party secret
scanner.

**6.4 Numbers in prose should be generated.** "15 checks", "17 warnings", "485
lines" are all derivable. Typed by hand, they rot silently and make the honest
paragraphs around them look careless.

**6.5 A hidden command should have a test.** `ghost` has none. Either it is part
of the product and gets checked, or it should not have been added.

---

## 7. What this audit does not cover

`MEBOARD_BRAINSTORM.md`, `ROADMAP.ROADMAP.md`, `WHO_DID_WHAT.WHO_DID_WHAT.md`,
`PERSONA.md`, `BRAND.BRAND.md` and `integrations.md` were **not** read for this
file. They may contain claims that outrun the code, and if they do, this
section is where they belong.

`QRD.md` §11 was read when it was folded in, not audited afterwards.

The `/devices` page, `BusPanel.tsx` and the React tree were not reviewed for
behaviour — only compiled.

---

## 8. The single thing that would make this file shorter

**One real enrolment.** Pair a device, watch it appear, revoke it, watch the
poll fail. That one walk collapses §2.4, §2.5, §2.6, most of §3.1 and the
entire reason this document feels heavy. Everything else here is clutter
around that gap.
