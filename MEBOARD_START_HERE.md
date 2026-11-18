# Start here

This branch is `feat/latch-devices`. It adds **Latch**: a way to enrol a
machine, give it one token, and let it read and write plain text on the bus.
Everything is already committed — you do not need to paste anything from a chat
window.

## The thirty-second version

```
git clone --branch feat/latch-devices https://github.com/BleakNarratives/Meboard.git
cd Meboard
bun install
bunx tsc -b          # types
bun run lint         # 0 errors, 17 react-refresh warnings
bun run latch:test   # 15 checks, builds the CLI and exercises it over a socket
```

That is the whole verification. All four exit 0 on this branch, cloned fresh.

## What Latch actually does

1. Open `/devices` in the app and name a machine — `chromebook`, `build-runner`,
   whatever you will recognise later.
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
| `src/pages/Devices.tsx` | the `/devices` page |
| `scripts/build-latch.ts` | bundles the CLI to `dist-latch/latch.mjs` |
| `scripts/latch-e2e.mjs` | the 15-check suite, against a stub over a real socket |
| `scripts/install-latch.sh` / `.ps1` | per-user install, no admin |

## What is not done yet

- **Convex codegen has not been run against a deployment.** The new tables and
  functions typecheck because Convex's generated types are module-level, but
  push the schema before trusting the site in production:

  ```
  bunx convex dev --once
  ```

  That needs your Convex login. It cannot be run from an automated environment.

- **The `/devices` page has never been rendered in a browser** by whoever wrote
  it. It typechecks and lints; nobody has looked at it.
- **No PR is open.** The branch is pushed and buildable.
- The bundle built without `VITE_CONVEX_URL` prints
  `no VITE_CONVEX_URL at build time — the bundle needs --url to enrol`. Build it
  in an environment that has the variable and that line disappears.

## Installing the CLI on a machine

```
bun run latch:build
sh scripts/install-latch.sh                 # macOS, Linux, Crostini, Termux
powershell -ExecutionPolicy Bypass -File scripts\install-latch.ps1   # Windows
```

No dependencies at runtime beyond Node 18+. The output is one ES module.
