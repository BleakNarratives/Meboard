# PERSONA — the voice-pack format and the family bus

Keyhole, AskHole, Snarkie, QuipBoard's mouth, the Devil's Advocate from the
Boardroom: one engine, one bus, one JSON format. Each character is **data**.

The rule that makes this portable: **the engine owns behaviour, a voice pack
owns words.** Budgets, escalation, decay, muting, the safety gate and the
Easter-egg triggers live in `src/lib/persona/engine.ts` and are written once.
A sibling app contributes a file of lines and inherits every guardrail.

---

## 1. The format — `persona.voice/1`

Filename convention: `<voice>.turd.json` (the turd-merger-ready format). The
`format` field is what actually matters; the extension is a joke that costs
nothing.

```json
{
  "format": "persona.voice/1",
  "id": "askhole",
  "name": "AskHole",
  "lines": {
    "typo.repeated": {
      "1": ["again with {detail}. bold."],
      "3": ["{detail} four times. we're not doing this again."]
    }
  },
  "sealed": {
    "muteflip": ["you muted me {detail} times and came back. i'm not crying."]
  }
}
```

Limits are enforced by `parseVoicePack()`, not by review:

| Field | Rule |
|---|---|
| `format` | must be `persona.voice/1` |
| `id` | lowercase, 2–24 chars, starts with a letter |
| `name` | 1–32 chars |
| `lines` | keys must be known event kinds; tiers only `1`, `2`, `3` |
| a line | 1–240 chars, no `<` or `>`, at most one `{detail}` |
| per tier | ≤ 12 lines |
| `sealed` | keys only `muteflip`, `markerspam`, `break.character`; ≤ 4 lines each |

Why so strict: the consumer of a line is an `aria-live` region. A 900-character
monologue or a stray `<` is a real cost to a screen-reader user, and a pack is
loaded from a repository nobody reviewed. Unknown events are **refused**, not
ignored — a typo in a key should fail at load, not silently silence a voice
forever. Adding a new event kind is therefore a format bump, deliberately.

## 2. Adopting a sibling

1. Put the `.turd.json` in the sibling's own public repo (root is fine).
2. Fetch it, then `registerVoiceJson(raw)` — validation happens there.
3. Look it up with `getVoice("askhole")`.
4. Pass it to `createPersona({ voice, store })`.
5. Nothing else. No imports from the other app, no shared build, no monorepo.

A voice that fails to parse is refused whole. Half-adopting a broken pack means
throwing mid-sentence, which is worse than never loading.

## 3. The bus

```ts
const bus = createPersonaBus({ persona, onQuip: (q) => setLine(q) });

bus.emit({ kind: "text.sent" });          // app tells the voice
bus.bridge(systemEvents);                  // or an existing bus forwards in
```

`bridge()` takes anything with `subscribe(handler) => unsubscribe`. A Convex
subscription, a `window` event wrapper, a WebSocket fan-out, a Redux store — all
qualify without the persona knowing what any of them are. `createSource()` is an
in-memory stand-in so an app can wire the seam today and swap the real bus in
later without touching voices.

**The persona must never become the place two systems get coupled.** It only
watches events and emits lines; it has no authority to mutate anything.

## 4. Growth: what "self-perfecting" may and may not mean

A skill document that rewrites itself toward "mastery" with no external judge is
a hallucination with better formatting. The working version:

| Allowed without review | Needs a human or a test |
|---|---|
| adding lines to an existing tier | changing tiers, budget, decay, cooldowns |
| adding a new `sealed` line | adding or renaming an event kind (format bump) |
| rewording within the length limits | deleting the safety gate |
| adding a sibling voice pack | changing what counts as sensitive |

Growth rule: **every change cites an incident** — a date, an event, and what was
wrong with the old line. A line nobody can trace to a moment is a vibe, and vibes
are how a persona becomes a bully with a build pipeline.

Failure log lives beside the voice. If a line lands badly, it is deleted and the
deletion recorded; nothing is "tuned" silently. The engine's own behaviour is
pinned by `bun src/lib/persona/selftest.ts` (35 checks) — if a growth step
breaks silence-on-error, the budget, or the one-shot eggs, that command fails.

## 5. Non-negotiables (inherited from `QRD.md`)

1. Nothing is spoken by us. Text in a polite region, coalesced, never mid-word.
2. Never comment on environment failures — the engine blocklists them.
3. Never quip on a false positive. Only confirmed events.
4. Mute is one tap, and it survives reloads and updates.
5. Escalation caps at tier 3 and resets on improvement.

## 6. Status: what is wired and what is not

**Real, in this repo:** engine, format + validator, registry, bus, six UI events
on `/live`, three sealed eggs, 35-check spec.

**Not real yet, and not faked:** MotherBrain, ModMind, the Vertical AI Boardroom,
Oracle/Spark, and any "wide system event bus" outside this app. Those need a URL
or exported types before an adapter can be written — an adapter against a system
I cannot see is a guess with imports. The `bridge()` seam is the whole integration
surface; once the real bus exists, wiring it is one call.
