import { unitVector } from "./layout";

/**
 * Hit-target adaptation, with the part everyone skips: hysteresis.
 *
 * The naive version moves a key the instant you miss it, which guarantees
 * oscillation — the move changes the error distribution that justified it, so
 * the key drifts back and forth forever while your thumbs relearn nothing.
 *
 * So: evidence must arrive in **distinct sessions** (three of them), a key may
 * move at most once every four sessions, displacement is capped at 12% of a key
 * width, and a reversal needs *double* the evidence because it contradicts a
 * decision already paid for in muscle memory.
 *
 * Direction is derived from geometry, not configured: a key's target grows
 * toward the key you actually hit.
 */
export interface KeyMove {
  dx: number;
  dy: number;
}

export interface KeyMemory {
  offset: KeyMove;
  strikes: number;
  lastSession: number;
  movedAt: number;
}

export interface TargetMemory {
  keys: Record<string, KeyMemory>;
}

export const STEP = 0.04;
export const MIN_STRIKES = 3;
export const COOLDOWN_SESSIONS = 4;
export const MAX_OFFSET = 0.12;

const ZERO: KeyMove = { dx: 0, dy: 0 };

export function emptyMemory(): TargetMemory {
  return { keys: {} };
}

export function offsetFor(memory: TargetMemory, key: string): KeyMove {
  return memory.keys[key.toLowerCase()]?.offset ?? ZERO;
}

/**
 * Record one miss. `session` is any monotonic integer for the sitting — the
 * point is not the number, it's that two misses in the same sitting count once.
 */
export function recordMiss(
  memory: TargetMemory,
  miss: { intended: string; hit: string; session: number },
): TargetMemory {
  const direction = unitVector(miss.intended, miss.hit);
  if (!direction) return memory;

  const key = miss.intended.toLowerCase();
  const previous: KeyMemory = memory.keys[key] ?? {
    offset: ZERO,
    strikes: 0,
    lastSession: miss.session - 1,
    movedAt: -COOLDOWN_SESSIONS,
  };

  // One strike per session. Five fat-fingered minutes is one bad sitting, not
  // five pieces of evidence.
  if (previous.lastSession === miss.session) return memory;

  const strikes = previous.strikes + 1;
  const agrees =
    previous.offset.dx * direction.dx + previous.offset.dy * direction.dy >= 0;
  const required = agrees ? MIN_STRIKES : MIN_STRIKES * 2;
  const cooled = miss.session - previous.movedAt >= COOLDOWN_SESSIONS;

  if (strikes < required || !cooled) {
    return {
      keys: {
        ...memory.keys,
        [key]: { ...previous, strikes, lastSession: miss.session },
      },
    };
  }

  const offset: KeyMove = {
    dx: clamp(previous.offset.dx + direction.dx * STEP),
    dy: clamp(previous.offset.dy + direction.dy * STEP),
  };

  return {
    keys: {
      ...memory.keys,
      [key]: { offset, strikes: 0, lastSession: miss.session, movedAt: miss.session },
    },
  };
}

function clamp(value: number): number {
  return Math.min(Math.max(value, -MAX_OFFSET), MAX_OFFSET);
}
