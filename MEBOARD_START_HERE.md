# Start here

This branch is `feat/latch-devices`. It adds **Latch**: a way to enrol a
machine, give it one token, and let it read and write plain text on the bus.
Everything is already committed — you do not need to paste anything from a chat
window.

**Last verified 2026-11-18** against deployment `standing-sockeye-398`
(`bleaknarratives:meboard`). Read [What a fresh deployment needs](#what-a-fresh-deployment-needs)
*before* your first `convex dev`, and [On Termux / Android](#on-termux--android)
if that is where you are working. Both sections exist because both bit us.

## The thirty-second version

```
git clone --branch feat/latch-devices https://github.com/BleakNarratives/Meboard.git
cd Meboard
bun install
bunx tsc -b          # types
bun run lint         # 0 errors, 17 react-refresh warnings
bun run latch:test   # 15 checks, builds the CLI and exercises it over a socket
```

That is the whole verification of the client and the CLI. All four exit 0 on
this branch, cloned fresh. It never touches a deployment — pushing functions is
the separate, slower half, and it needs the variables below.

## What a fresh deployment needs

`npx convex dev` creates the project, the deployment and `.env.local` for you.
It cannot invent the things only the project's owner has.

| Variable | Where it goes | Without it |
|---|---|---|
| `VLY_CONVEX_AUTH_ISSUER` | deployment env | **`convex dev` refuses to push at all** |
| `SITE_URL` | deployment env | no base URL for Convex Auth; sign-in does not land where it should |
| `VLY_INTEGRATION_KEY` | deployment env | email codes cannot be sent; guest sign-in and all of Latch still work |
| `VITE_CONVEX_URL` | `.env.local`, written for you | the CLI builds with no endpoint and refuses to enrol |

Only the first is a hard stop at push time. The rest bite later, at the moment
you need them, which is worse.

### VLY_CONVEX_AUTH_ISSUER — the push blocker

`src/convex/auth.config.ts` reads it for the freebuff federated-token entry:

```ts
const freebuffIssuer =
  process.env.VLY_CONVEX_AUTH_ISSUER ?? "https://auth.freebuff.app";
```

The `VLY_` prefix is the real name, not a typo — the provider's `applicationID`
is `vly-convex`. The fallback makes it optional to the code, but Convex scans
`auth.config.ts` for env references and will not push while a named variable is
unset. Set it to the value it already falls back to, so nothing changes:

```
npx convex env set VLY_CONVEX_AUTH_ISSUER https://auth.freebuff.app
```

What you see if you skip it:

```
✖ Environment variable VLY_CONVEX_AUTH_ISSUER is used in auth config file
  but its value was not set.
```

Nothing was pushed when that happens. The schema, the indexes and codegen all
wait behind it.

### SITE_URL

`@convex-dev/auth` wants the address the app is served from. In development:

```
npx convex env set SITE_URL http://localhost:5173
```

Use the real https origin in production. Getting this wrong does not fail
loudly.

### VLY_INTEGRATION_KEY

Sign-in codes are sent by the freebuff integrations gateway, which knows the
project by this key. `src/convex/auth/emailOtp.ts` refuses to send without it,
and says why:

```
Email sign-in is not configured on this deployment: VLY_INTEGRATION_KEY is
unset, so no sign-in code can be sent. Set it with `npx convex env set
VLY_INTEGRATION_KEY <key>`, or sign in as a guest instead — the bus, /devices
and Latch all work without email sign-in.
```

A deployment created with plain `npx convex dev` does **not** get one; the key
is issued when a project is created through freebuff's own flow. On a hand-made
deployment, expect email sign-in to be unavailable and use guest sign-in, which
is the `Anonymous` provider in `src/convex/auth.ts`. Everything Latch does works
without it. It is only the code-by-email path.

### Checking

```
npx convex env list
```

Every deployment variable above should be there. `VITE_CONVEX_URL` and
`VITE_CONVEX_SITE_URL` live in `.env.local` instead, because the browser needs
them too; `*.local` is gitignored, so they cannot be committed by accident.

## On Termux / Android

The tablet runs the CLI and, as of 2026-11-18, pushes functions too. Two things
to know first.

**There is no `bunx` package.** `bunx` is a subcommand inside `bun`, so
`pkg install bunx` fails, and `bun` itself is not dependable in Termux. Use npm:

```
pkg install nodejs        # 18 or newer; current Termux is well past it
cd ~/meboard
npm install
npx convex dev
```

**Run `npm install` first, not `npx` alone.** `npx convex dev` in a clone with no
`node_modules` bundles nothing and fails misleadingly:

```
✘ [ERROR] Could not resolve "convex/server"
  convex-virtual-config:./src/convex/convex.config.js:1:26
✖ esbuild failed: Error: Build failed with 1 error
```

That is not Convex being broken. It means the project's own dependencies are
missing and esbuild has nothing to resolve `convex/server` from.

**The esbuild install-scripts warning is expected:**

```
npm warn install-scripts 1 package had install scripts blocked ...
npm warn install-scripts   esbuild@0.27.0 (postinstall: node install.js)
```

Bundling still worked on this setup (arm64 Android). If it ever does not,
`pkg install esbuild` puts Termux's own native binary in place. Do not combine
`--ignore-scripts` with `--no-optional`: esbuild cannot install at all with both.

`npm audit` reports 10 vulnerabilities (4 moderate, 4 high, 2 critical) on a
fresh install. None are in code this branch adds; they are the template's
dependency tree. Do not run `npm audit fix --force` to make the number go away —
it crosses major versions for a cosmetic result.

Vite on the tablet is a separate question from the CLI. If `bun run dev` will not
serve there, that is a Termux limitation, not a project one.

## What Latch actually does

1. Open `/devices` in the app and name a machine — `chromebook`,
   `build-runner`, whatever you will recognise later.
2. The page shows six characters, e.g. `4K7Q2M`, and the exact command:

   ```
   latch enroll 4K7Q2M
   ```

3. On the machine, that one command redeems the code, stores a device token at
   `~/.latch/config.json` (mode 0600), checks the token actually works, and
   prints what it found. The code is dead the moment it is used.
4. `latch listen` then prints what arrives on the wire. It announces itself with
   `device.online` and says `device.offline` when you ctrl-c, so the page can
   show whether the machine is really there.

Codes last three minutes and work once. If one expires, make another — that is
cheaper than making the window longer.

## What it cannot do, on purpose

A device can **read the wire and write text to it**. It cannot type, click, or
run anything on the machine. There is no `latch type`, no `latch key`, no
`latch run` — not because they are unbuilt, but because a remote-controlled
keyboard is a different product with a different consent story. If that ever
exists it will be a decision, not a diff that appeared.

That is also why `--clip` is not the primary path: ChromeOS blocks programmatic
clipboard reads inside its Linux container, and Termux needs termux-api in the
foreground. Typing six characters works everywhere; the clipboard does not.

## Where things live

| Path | What |
|---|---|
| `src/latch/cli.ts` | `enroll`, `status`, `listen` |
| `src/latch/client.ts` | one GET, one POST — the entire client |
| `src/latch/config.ts` | `~/.latch/config.json`, 0600, written only after a token is verified |
| `src/convex/bus.ts` | token minting, device enrolment, pairing, the log |
| `src/convex/http.ts` | `/latch/pair`, `/bus/publish`, `/bus/poll` |
| `src/convex/auth.config.ts` | the two providers; reads `VLY_CONVEX_AUTH_ISSUER` |
| `src/convex/auth/emailOtp.ts` | the emailed code, and the missing-key refusal |
| `src/pages/Devices.tsx` | the `/devices` page |
| `scripts/build-latch.ts` | bundles the CLI to `dist-latch/latch.mjs` |
| `scripts/latch-e2e.mjs` | the 15-check suite, against a stub over a real socket |
| `scripts/install-latch.sh` / `.ps1` | per-user install, no admin |

## What is not done yet

- **The `/devices` page has never been rendered in a browser.** It typechecks,
  lints, and its queries are pushed, but nobody has looked at it.
- **`scripts/install-latch.ps1` has never been parsed**, let alone run on
  Windows.
- **No real enrolment has happened.** No `devices` or `pairings` row exists on
  any deployment, so pair → mint → poll → revoke has never run end to end
  against a live database.
- A bundle built without `VITE_CONVEX_URL` prints
  `no VITE_CONVEX_URL at build time — the bundle needs --url to enrol`.

**Done since the first draft of this file:** codegen and the schema push. On
2026-11-18 `convex dev` added the `auth*`, `busTokens`, `busEvents`, `rooms`,
`signals` and `users` indexes and generated `src/convex/_generated/*`. Email
sign-in on that deployment still needs `VLY_INTEGRATION_KEY`, as above.

## Installing the CLI on a machine

```
bun run latch:build
sh scripts/install-latch.sh                 # macOS, Linux, Crostini, Termux
powershell -ExecutionPolicy Bypass -File scripts\install-latch.ps1   # Windows
```

No dependencies at runtime beyond Node 18+. The output is one ES module.
