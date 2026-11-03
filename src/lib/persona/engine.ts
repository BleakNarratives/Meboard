import type {
  PersistedPersona,
  PersonaEvent,
  PersonaStore,
  Quip,
  SealedKey,
  Tier,
  VoicePack,
} from "./types";

/**
 * Events the persona never comments on. These are environment failures: the
 * user is already getting a toast about them, and a second announcement
 * through `aria-live` costs a screen-reader user real time to get through.
 * Silence here is a feature, not an oversight.
 */
const SENSITIVE: ReadonlySet<PersonaEvent["kind"]> = new Set([
  "capture.blocked",
  "join.failed",
  "text.blocked",
]);

const SEALED_KEYS: readonly SealedKey[] = [
  "muteflip",
  "markerspam",
  "break.character",
];

/** Escalation memory is bounded: a long-lived profile must not grow forever. */
const MAX_KEYS = 64;
const MAX_COUNT = 12;
/** How much of the recent past `markerspam` looks at. */
const MARK_WINDOW_MS = 20_000;
const MARK_THRESHOLD = 8;

export interface PersonaConfig {
  voice: VoicePack;
  store?: PersonaStore;
  now?: () => number;
  /** Injectable for deterministic tests; never used to pick *whether* to speak. */
  random?: () => number;
  /** Minimum silence between two lines. Silence is the default state. */
  minGapMs?: number;
  /** Hard cap per page session, so one chatty event can't own the page. */
  sessionCap?: number;
  /** After this long, escalation halves. A punishing loop has to forgive. */
  decayMs?: number;
}

export interface Persona {
  note(event: PersonaEvent): Quip | null;
  isMuted(): boolean;
  /** Returns a quip when unmuting unlocks sealed material. */
  setMuted(muted: boolean): Quip | null;
  /** Forget escalation for one event key — used when the user improves. */
  forgive(event: PersonaEvent): void;
}

const DEFAULTS = {
  minGapMs: 45_000,
  sessionCap: 6,
  decayMs: 10 * 60_000,
};

export function createPersona(config: PersonaConfig): Persona {
  const { voice, store } = config;
  const clock = config.now ?? (() => Date.now());
  const random = config.random ?? Math.random;
  const minGapMs = config.minGapMs ?? DEFAULTS.minGapMs;
  const sessionCap = config.sessionCap ?? DEFAULTS.sessionCap;
  const decayMs = config.decayMs ?? DEFAULTS.decayMs;

  const runtime = load(store);
  let linesThisSession = 0;
  let lastLineAt = Number.NEGATIVE_INFINITY;
  let recentMarks: number[] = [];
  let lastKeys: string[] = [];

  const now = () => {
    const t = clock();
    return Number.isFinite(t) ? t : 0;
  };

  function persist() {
    if (!store) return;
    store.write({
      v: 1,
      muted: runtime.muted,
      muteFlips: runtime.muteFlips,
      counts: Object.fromEntries(
        [...runtime.counts.entries()].slice(-MAX_KEYS),
      ),
      spent: [...runtime.spent],
    });
  }

  function seal(key: SealedKey, kind: PersonaEvent["kind"], detail: string) {
    const pool = voice.sealed?.[key];
    if (!pool || pool.length === 0) return null;
    const body = interpolate(pool[Math.floor(safeRandom(random) * pool.length)], detail);
    runtime.spent.add(key);
    persist();
    linesThisSession += 1;
    lastLineAt = now();
    return { key: `sealed:${key}`, body, kind, tier: "sealed" } satisfies Quip;
  }

  function note(event: PersonaEvent): Quip | null {
    // Never throw at a user interface. Unknown shapes and blocklisted events
    // both simply produce silence.
    if (!event || typeof event.kind !== "string") return null;
    if (SENSITIVE.has(event.kind)) return null;
    if (runtime.muted) return null;

    const t = now();
    const detail = detailOf(event);

    const egg = checkSealed(event, t, detail);
    if (egg) return egg;

    if (t - lastLineAt < minGapMs) return null;
    if (linesThisSession >= sessionCap) return null;

    const key = `${event.kind}:${detail}`;
    const tier = tierFor(remember(key, t));
    persist();

    for (let candidate = tier; candidate >= 1; candidate -= 1) {
      const pool = voice.lines[event.kind]?.[candidate as Tier];
      if (!pool || pool.length === 0) continue;
      const choice = pick(pool, lastKeys, `${event.kind}:${candidate}`, random);
      if (!choice) continue;

      linesThisSession += 1;
      lastLineAt = t;
      lastKeys = [...lastKeys, choice.key].slice(-2);
      return {
        key: choice.key,
        body: interpolate(choice.body, detail),
        kind: event.kind,
        tier: candidate as Tier,
      };
    }

    return null;
  }

  function checkSealed(
    event: PersonaEvent,
    t: number,
    detail: string,
  ): Quip | null {
    if (event.kind === "marker.sent") {
      if (runtime.spent.has("markerspam")) return null;
      recentMarks = [...recentMarks.filter((at) => t - at <= MARK_WINDOW_MS), t];
      if (recentMarks.length >= MARK_THRESHOLD) {
        recentMarks = [];
        return seal("markerspam", event.kind, String(MARK_THRESHOLD));
      }
      return null;
    }

    if (event.kind === "correction.rejected") {
      if (runtime.spent.has("break.character")) return null;
      const key = `correction.rejected:${detail}`;
      const memory = runtime.counts.get(key);
      if (memory && memory.n >= 4) {
        return seal("break.character", event.kind, detail);
      }
    }

    return null;
  }

  /**
   * Hysteresis, in six lines. Each repeat of the same event raises the tier,
   * and a long enough gap halves it again — so a keyboard that has been good
   * for a week stops being punished for last week.
   */
  function remember(key: string, t: number): number {
    const previous = runtime.counts.get(key);
    let n = previous?.n ?? 0;
    if (previous && t - previous.at > decayMs) n = Math.floor(n / 2);
    n = Math.min(n + 1, MAX_COUNT);
    runtime.counts.delete(key);
    runtime.counts.set(key, { n, at: t });

    if (runtime.counts.size > MAX_KEYS) {
      const oldest = runtime.counts.keys().next();
      if (!oldest.done) runtime.counts.delete(oldest.value);
    }
    return n;
  }

  return {
    note,
    isMuted: () => runtime.muted,
    setMuted(muted: boolean) {
      if (muted === runtime.muted) return null;
      if (muted) {
        runtime.muted = true;
        persist();
        return null;
      }
      runtime.muted = false;
      runtime.muteFlips = Math.min(runtime.muteFlips + 1, 99);
      persist();
      if (runtime.muteFlips >= 3 && !runtime.spent.has("muteflip")) {
        return seal("muteflip", "session.started", String(runtime.muteFlips));
      }
      return null;
    },
    forgive(event: PersonaEvent) {
      runtime.counts.delete(`${event.kind}:${detailOf(event)}`);
      persist();
    },
  };
}

function tierFor(n: number): Tier {
  if (n >= 6) return 3;
  if (n >= 3) return 2;
  return 1;
}

function pick(
  pool: readonly string[],
  avoid: readonly string[],
  namespace: string,
  random: () => number,
): { key: string; body: string } | null {
  if (pool.length === 0) return null;
  const avoidSet = new Set(avoid);
  const tagged = pool.map((body, index) => ({
    key: `${namespace}#${index}`,
    body,
  }));
  const fresh = tagged.filter((entry) => !avoidSet.has(entry.key));
  const source = fresh.length > 0 ? fresh : tagged;
  return source[Math.floor(safeRandom(random) * source.length)] ?? null;
}

function safeRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 0.999_999);
}

/**
 * A detail is attacker-shaped: it arrives from an event, which means user text.
 * It goes into an `aria-live` region, so an unbounded string is a way to make a
 * screen reader read for a minute, and bidi controls are a way to make the line
 * say something it doesn't say. Both are stripped, and the result is short.
 */
const MAX_DETAIL = 48;
const MAX_LINE = 240;

function sanitizeDetail(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .trim()
    .slice(0, MAX_DETAIL);
}

/** Lines are static; the only substitution is a plain string, never markup. */
function interpolate(template: string, detail: string): string {
  return template.split("{detail}").join(sanitizeDetail(detail)).slice(0, MAX_LINE);
}

function detailOf(event: PersonaEvent): string {
  switch (event.kind) {
    case "correction.accepted":
    case "correction.rejected":
      return event.pair ?? "";
    case "typo.repeated":
      return event.grapheme ?? "";
    case "streak.reached":
      return event.words === undefined ? "" : String(event.words);
    case "returned.after.absence":
      return event.days === undefined ? "" : String(event.days);
    case "session.ended":
      return event.reason ?? "";
    default:
      return "";
  }
}

/**
 * Everything below treats storage as hostile input: it is user-writable, it
 * survives version changes, and a malformed blob must degrade to defaults
 * rather than take the page down.
 */
function emptyRuntime() {
  return {
    muted: false,
    muteFlips: 0,
    counts: new Map<string, { n: number; at: number }>(),
    spent: new Set<SealedKey>(),
  };
}

function load(store?: PersonaStore) {
  const fallback = emptyRuntime();
  if (!store) return fallback;

  let raw: unknown;
  try {
    raw = store.read();
  } catch {
    return fallback;
  }
  if (!isRecord(raw) || raw.v !== 1) return fallback;

  const counts = new Map<string, { n: number; at: number }>();
  if (isRecord(raw.counts)) {
    for (const [key, value] of Object.entries(raw.counts)) {
      if (!isRecord(value)) continue;
      const n = clampInt(value.n, 0, MAX_COUNT, 0);
      const at = clampInt(value.at, 0, Number.MAX_SAFE_INTEGER, 0);
      if (n > 0) counts.set(key, { n, at });
      if (counts.size >= MAX_KEYS) break;
    }
  }

  const spent = new Set<SealedKey>();
  if (Array.isArray(raw.spent)) {
    for (const key of raw.spent) {
      if (isSealedKey(key)) spent.add(key);
    }
  }

  return {
    muted: raw.muted === true,
    muteFlips: clampInt(raw.muteFlips, 0, 99, 0),
    counts,
    spent,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSealedKey(value: unknown): value is SealedKey {
  return typeof value === "string" && (SEALED_KEYS as readonly string[]).includes(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export type { PersistedPersona };
