/**
 * Executable spec for the persona engine, with no test framework and no
 * dependencies: `bun src/lib/persona/selftest.ts`.
 *
 * These are the properties that are easy to break while "improving" the voice
 * and expensive to discover in front of a screen-reader user: silence on
 * environment failures, a hard budget, escalation that forgives, one-shot
 * Easter eggs, and never exploding on tampered storage.
 */
import { createPersonaBus, createSource } from "./bus";
import { createPersona } from "./engine";
import {
  MAX_LINE,
  parseVoicePack,
  serializeVoicePack,
  VOICE_FORMAT,
} from "./format";
import type { PersonaEvent, PersonaStore, Tier } from "./types";
import { keyhole } from "./voices/keyhole";

const failures: string[] = [];
let checks = 0;

function check(name: string, condition: boolean) {
  checks += 1;
  if (!condition) failures.push(name);
}

function equal<T>(name: string, actual: T, expected: T) {
  checks += 1;
  if (actual !== expected) {
    failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

/** A clock the test drives by hand; determinism beats realism here. */
function harness(
  options: { store?: PersonaStore; random?: () => number; startAt?: number } = {},
) {
  let clock = options.startAt ?? 1_000_000;
  const persona = createPersona({
    voice: keyhole,
    store: options.store,
    now: () => clock,
    random: options.random ?? (() => 0.5),
    minGapMs: 45_000,
    sessionCap: 6,
    decayMs: 600_000,
  });
  return {
    persona,
    advance: (ms: number) => {
      clock += ms;
    },
    at: () => clock,
  };
}

function memoryStore(initial: unknown = null): PersonaStore & { value: unknown } {
  const store = {
    value: initial,
    read() {
      return store.value;
    },
    write(state: unknown) {
      store.value = state;
    },
  };
  return store;
}

// --- silence is the default -------------------------------------------------

{
  const { persona } = harness();
  const loud: PersonaEvent["kind"][] = [
    "capture.blocked",
    "join.failed",
    "text.blocked",
  ];
  for (const kind of loud) {
    check(`silent on ${kind}`, persona.note({ kind } as PersonaEvent) === null);
  }

  persona.setMuted(true);
  check("muted stays quiet", persona.note({ kind: "session.started" }) === null);
  persona.setMuted(false);
}

// --- budget ----------------------------------------------------------------

{
  const { persona, advance } = harness();
  check("first line lands", persona.note({ kind: "session.started" }) !== null);
  check("immediate repeat is gated", persona.note({ kind: "session.started" }) === null);
  advance(46_000);
  const second = persona.note({ kind: "session.started" });
  check("after the gap it speaks again", second !== null);
  check("no immediate repeat", second !== null && second.body.length > 0);
}

{
  const { persona, advance } = harness();
  const kinds: PersonaEvent[] = [
    { kind: "session.started" },
    { kind: "viewer.joined" },
    { kind: "text.sent" },
    { kind: "marker.sent" },
    { kind: "correction.accepted" },
    { kind: "streak.reached", words: 100 },
    { kind: "returned.after.absence", days: 3 },
  ];
  let spoken = 0;
  for (const event of kinds) {
    advance(60_000);
    if (persona.note(event)) spoken += 1;
  }
  equal("session cap holds", spoken, 6);
}

// --- escalation and forgiveness --------------------------------------------

{
  const { persona, advance } = harness();
  const tiers: (Tier | "sealed")[] = [];
  for (let i = 0; i < 6; i += 1) {
    advance(60_000);
    const quip = persona.note({ kind: "typo.repeated", grapheme: "my" });
    if (quip) tiers.push(quip.tier);
  }
  equal("escalates to open contempt", tiers[tiers.length - 1], 3);
  check("starts polite", tiers[0] === 1);
}

{
  const store = memoryStore();
  const first = harness({ store });
  for (let i = 0; i < 6; i += 1) {
    first.advance(60_000);
    first.persona.note({ kind: "typo.repeated", grapheme: "my" });
  }
  const saved = store.value as { counts: Record<string, { n: number }> };
  equal("remembers across sessions", saved.counts["typo.repeated:my"]?.n, 6);

  const later = harness({ store, startAt: first.at() });
  later.advance(600_001);
  const after = later.persona.note({ kind: "typo.repeated", grapheme: "my" });
  equal("a quiet week halves the grudge", after?.tier, 2);
}

// --- sealed material --------------------------------------------------------

{
  const { persona, advance } = harness();
  let sealed = 0;
  for (let i = 0; i < 9; i += 1) {
    advance(1_000);
    const quip = persona.note({ kind: "marker.sent" });
    if (quip?.tier === "sealed") sealed += 1;
  }
  equal("marker spam unlocks once", sealed, 1);
}

{
  const { persona } = harness();
  persona.setMuted(true);
  equal("first unmute is quiet", persona.setMuted(false), null);
  persona.setMuted(true);
  persona.setMuted(false);
  persona.setMuted(true);
  const third = persona.setMuted(false);
  equal("third unmute unlocks the egg", third?.tier, "sealed");
  persona.setMuted(true);
  equal("egg does not repeat", persona.setMuted(false), null);
}

{
  const { persona, advance } = harness({ random: () => 0 });
  let broke = false;
  for (let i = 0; i < 6; i += 1) {
    advance(60_000);
    const quip = persona.note({ kind: "correction.rejected", pair: "teh" });
    if (quip?.tier === "sealed") broke = true;
  }
  check("repeated rejections break character", broke);
}

// --- hostile details --------------------------------------------------------

{
  const { persona, advance } = harness();
  advance(60_000);
  const bomb = persona.note({
    kind: "correction.rejected",
    pair: "x".repeat(5_000),
  });
  check("a huge detail is spoken, not shouted", !!bomb && bomb.body.length <= 240);

  advance(60_000);
  const spoof = persona.note({
    kind: "correction.rejected",
    pair: "\u202Eevil\u202C",
  });
  check(
    "bidi overrides are stripped",
    !!spoof && !/[\u202a-\u202e\u2066-\u2069]/.test(spoof.body),
  );
}

// --- hostile storage --------------------------------------------------------

{
  const garbage = memoryStore({
    v: 1,
    muted: "yes",
    muteFlips: Number.NaN,
    counts: { evil: { n: "many", at: "soon" }, ok: { n: 3, at: 5 } },
    spent: [1, "muteflip", null],
  });
  let threw = false;
  try {
    const { persona } = harness({ store: garbage });
    check("survives a tampered profile", persona.note({ kind: "session.started" }) !== null);
  } catch {
    threw = true;
  }
  check("never throws on bad storage", !threw);

  for (const junk of [null, 42, "nope", [], { v: 99 }]) {
    try {
      const { persona } = harness({ store: memoryStore(junk) });
      persona.note({ kind: "session.started" });
    } catch {
      failures.push(`threw on stored value ${JSON.stringify(junk)}`);
    }
    checks += 1;
  }
}

// --- the portable format ----------------------------------------------------

{
  const round = parseVoicePack(
    JSON.parse(serializeVoicePack(keyhole)) as unknown,
  );
  check("keyhole survives a round trip", round.ok);

  const withMarkup = parseVoicePack({
    format: VOICE_FORMAT,
    id: "troll",
    name: "Troll",
    lines: { "text.sent": { 1: ["<script>alert(1)</script>"] } },
  });
  check("markup is refused", !withMarkup.ok);

  const unknownEvent = parseVoicePack({
    format: VOICE_FORMAT,
    id: "troll",
    name: "Troll",
    lines: { "user.deleted": { 1: ["hi"] } },
  });
  check("unknown events are refused", !unknownEvent.ok);

  const badTier = parseVoicePack({
    format: VOICE_FORMAT,
    id: "troll",
    name: "Troll",
    lines: { "text.sent": { 4: ["hi"] } },
  });
  check("tier 4 is refused", !badTier.ok);

  const noFormat = parseVoicePack({ id: "troll", name: "Troll", lines: {} });
  check("missing format is refused", !noFormat.ok);

  const shouting = parseVoicePack({
    format: VOICE_FORMAT,
    id: "Troll",
    name: "Troll",
    lines: {},
  });
  check("uppercase ids are refused", !shouting.ok);

  const longLine = parseVoicePack({
    format: VOICE_FORMAT,
    id: "troll",
    name: "Troll",
    lines: { "text.sent": { 1: ["x".repeat(MAX_LINE + 1)] } },
  });
  check("overlong lines are refused", !longLine.ok);
}

// --- the bus seam -----------------------------------------------------------

{
  const { persona } = harness();
  const heard: string[] = [];
  const bus = createPersonaBus({ persona, onQuip: (quip) => heard.push(quip.body) });

  const source = createSource();
  const detach = bus.bridge(source);
  source.publish({ kind: "session.started" });
  equal("a bridged event reaches the voice", heard.length, 1);

  source.publish({ kind: "session.started" });
  equal("the budget still applies through the bridge", heard.length, 1);

  detach();
  source.publish({ kind: "viewer.joined" });
  equal("detaching stops delivery", heard.length, 1);
}

// --- report ----------------------------------------------------------------

if (failures.length === 0) {
  console.log(`keyhole: ${checks} checks passed`);
} else {
  console.error(`keyhole: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
}
