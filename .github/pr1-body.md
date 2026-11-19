Latch: enrol a machine, give it one token, let it read and write plain text on the bus. Observe only — it reports, it does not type, click or run anything.

Pairing is six characters, 3-minute TTL, single use, claimed before a token is minted; expired, used and unknown all return the same 401. Device tokens are revoked by receipt. The CLI is `latch enroll | status | listen` with `--once`, `--interval`, `--url`, `--clip`, config at `~/.latch/config.json` mode 0600, written only after the token verifies. The endpoint is baked in at build from `VITE_CONVEX_URL`.

## Verified on a clean clone (HEAD 20eaa22)

```
bunx tsc -b        -> exit 0
bun run lint       -> exit 0, 17 warnings, 0 errors
bun run latch:test -> 15 checks passed
```

## The five non-Latch fixes live in #2

`KeyboardSurface.tsx`, `engine.ts`, `Auth.tsx`, `use-mobile.ts`, `eslint.config.js`. Three of them are what makes `lint` pass at all. They are extracted into #2 so they can be reviewed and merged on their own merit, and they stay in this branch's diff until #2 lands and this branch is rebased. **Review #2 first.**

## What running /devices found (2026-11-18)

Clean clone, `bun install`, `VITE_CONVEX_URL=https://standing-sockeye-398.convex.cloud`, real browser:

- `/devices` redirects to `/auth?returnTo=/devices`; `RequireAuth` works.
- **Guest sign-in fails server-side**: `auth:signIn` returns `Missing environment variable JWT_PRIVATE_KEY` from `@convex-dev/auth`. No session can be minted, so no authenticated page can render.
- **None of this branch's functions are deployed.** `bus:devices`, `bus:createPairing`, `bus:mintDevice`, `bus:revokeDevice` all return `Could not find public function`, while `bus:post` and `bus:feed` exist. `/latch/pair` 404s on `.convex.site`, so `http.ts` is not deployed either.

That deployment runs a build from before Latch. Re-run `npx convex dev` from this branch and confirm with a `bus:devices` query; `Could not find public function` means the push did not land, whatever the schema says.

## Pairing throttle: there is not one

No counter, no limiter, in either `/latch/pair` or `redeemPairing`. The defence is 31^6 codes and a 180-second window — exactly what the code comment claims and all it delivers. Untestable live because the route is not deployed; the absence is read, not inferred. An unauthenticated caller can drive unlimited `redeemPairing` mutations at the owner's expense.

## Left before mergeable

1. The deployment must receive this branch, with `JWT_PRIVATE_KEY` / `JWKS` set, or `/devices` stays behind a door nobody can open.
2. `/devices` has never rendered signed-in.
3. `install-latch.ps1` has never been parsed.
4. No real enrolment has happened against any deployment.
5. No rate limit on pairing, and no test asserts one.

No input injection. A device can read the wire and write text to it; it cannot type, click, or run anything.
