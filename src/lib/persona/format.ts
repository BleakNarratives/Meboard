import type { PersonaEvent, SealedKey, Tier, VoicePack } from "./types";

/**
 * `persona.voice/1` — the portable voice-pack contract.
 *
 * A voice pack is **data**, not code: a JSON file with a format tag, an id and
 * some lines. That is the whole point — AskHole can live in its own public
 * repo, Snarkie in another, and Meboard only needs `parseVoicePack()` to adopt
 * either one. No import graph, no build step, no "merge" in the git sense.
 *
 * Parsing is strict on purpose. A pack arrives over the network from a
 * repository nobody has reviewed, and its sister field is an `aria-live`
 * region: one oversized line or one pasted `<script>` is a real cost to a
 * screen-reader user even though React would escape it.
 */
export const VOICE_FORMAT = "persona.voice/1";

/** Exhaustive by construction: extra or missing kind = compile error. */
const KIND_TABLE: Record<PersonaEvent["kind"], true> = {
  "session.started": true,
  "session.ended": true,
  "viewer.joined": true,
  "text.sent": true,
  "marker.sent": true,
  "correction.accepted": true,
  "correction.rejected": true,
  "typo.repeated": true,
  "streak.reached": true,
  "returned.after.absence": true,
  "capture.blocked": true,
  "join.failed": true,
  "text.blocked": true,
};

export const EVENT_KINDS = Object.keys(KIND_TABLE) as PersonaEvent["kind"][];

export const MAX_LINE = 240;
export const MAX_LINES_PER_TIER = 12;
export const MAX_SEALED_LINES = 4;

const ID_PATTERN = /^[a-z][a-z0-9-]{1,23}$/;
const TIERS: readonly Tier[] = [1, 2, 3];

export type ParseResult =
  | { ok: true; pack: VoicePack }
  | { ok: false; errors: string[] };

export function parseVoicePack(raw: unknown): ParseResult {
  const errors: string[] = [];

  if (!isRecord(raw)) return { ok: false, errors: ["pack must be an object"] };
  if (raw.format !== VOICE_FORMAT) {
    errors.push(`format must be "${VOICE_FORMAT}"`);
  }

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!ID_PATTERN.test(id)) {
    errors.push("id must be lowercase, 2-24 chars, starting with a letter");
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length === 0 || name.length > 32) {
    errors.push("name must be 1-32 chars");
  }

  const lines: VoicePack["lines"] = {};
  if (!isRecord(raw.lines)) {
    errors.push("lines must be an object");
  } else {
    for (const [kind, tiers] of Object.entries(raw.lines)) {
      if (!EVENT_KINDS.includes(kind as PersonaEvent["kind"])) {
        errors.push(`unknown event "${kind}"`);
        continue;
      }
      if (!isRecord(tiers)) {
        errors.push(`lines.${kind} must be an object of tiers`);
        continue;
      }
      for (const [tierKey, pool] of Object.entries(tiers)) {
        const tier = Number(tierKey) as Tier;
        if (!TIERS.includes(tier)) {
          errors.push(`lines.${kind}.${tierKey} is not tier 1, 2 or 3`);
          continue;
        }
        const clean = readLines(pool, `lines.${kind}.${tierKey}`, MAX_LINES_PER_TIER, errors);
        if (clean.length > 0) {
          lines[kind as PersonaEvent["kind"]] = {
            ...lines[kind as PersonaEvent["kind"]],
            [tier]: clean,
          };
        }
      }
    }
  }

  const sealed: VoicePack["sealed"] = {};
  if (raw.sealed !== undefined) {
    if (!isRecord(raw.sealed)) {
      errors.push("sealed must be an object");
    } else {
      for (const [key, pool] of Object.entries(raw.sealed)) {
        if (!isSealedKey(key)) {
          errors.push(`unknown sealed key "${key}"`);
          continue;
        }
        const clean = readLines(pool, `sealed.${key}`, MAX_SEALED_LINES, errors);
        if (clean.length > 0) sealed[key] = clean;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pack: { id, name, lines, sealed } };
}

/** Thrown-free helper for packs bundled in the repo: fail loudly at import. */
export function assertVoicePack(raw: unknown): VoicePack {
  const result = parseVoicePack(raw);
  if (!result.ok) {
    throw new Error(`invalid voice pack: ${result.errors.join("; ")}`);
  }
  return result.pack;
}

export function serializeVoicePack(pack: VoicePack): string {
  return JSON.stringify({ format: VOICE_FORMAT, ...pack }, null, 2);
}

/**
 * A line is a plain sentence: no markup, no control characters, and at most
 * one `{detail}` hole. Anything else is a pack bug, not a style choice.
 */
function readLines(
  pool: unknown,
  where: string,
  limit: number,
  errors: string[],
): string[] {
  if (!Array.isArray(pool)) {
    errors.push(`${where} must be an array`);
    return [];
  }
  if (pool.length > limit) {
    errors.push(`${where} has ${pool.length} lines, limit is ${limit}`);
  }
  const clean: string[] = [];
  for (const entry of pool.slice(0, limit)) {
    if (typeof entry !== "string") {
      errors.push(`${where} contains a non-string line`);
      continue;
    }
    const line = entry.trim();
    if (line.length === 0) {
      errors.push(`${where} contains an empty line`);
      continue;
    }
    if (line.length > MAX_LINE) {
      errors.push(`${where} has a line over ${MAX_LINE} chars`);
      continue;
    }
    if (/[<>]/.test(line)) {
      errors.push(`${where} contains markup characters`);
      continue;
    }
    if (line.split("{detail}").length > 2) {
      errors.push(`${where} uses {detail} more than once per line`);
      continue;
    }
    clean.push(line);
  }
  return clean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSealedKey(value: string): value is SealedKey {
  return value === "muteflip" || value === "markerspam" || value === "break.character";
}
