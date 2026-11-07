/**
 * The persona contract shared by every voice in the family — Keyhole, AskHole,
 * Bardildo, Fartographer, Loomy, Snarkie.
 *
 * The split matters: the **engine** owns behaviour (budgets, escalation,
 * cooldowns, muting, the safety gate) and a **voice pack** owns nothing but
 * words. Six apps can share one attitude without sharing one implementation,
 * and the parts that are hard to get right are written and tested exactly once.
 */

/** Escalation tier. 1 is the first offence, 3 is open contempt. */
export type Tier = 1 | 2 | 3;

/**
 * Sealed material: the Easter eggs. Only the engine decides when these unlock,
 * never the caller, so an app can't accidentally give the joke away.
 */
export type SealedKey = "muteflip" | "markerspam" | "break.character";

export type PersonaEvent =
  | { kind: "session.started" }
  | { kind: "session.ended"; reason?: "user" | "track" | "error" }
  | { kind: "viewer.joined" }
  | { kind: "text.sent" }
  | { kind: "marker.sent" }
  | { kind: "correction.accepted"; pair?: string }
  | { kind: "correction.rejected"; pair?: string }
  | { kind: "typo.repeated"; grapheme?: string; count?: number }
  | { kind: "streak.reached"; words?: number }
  | { kind: "returned.after.absence"; days?: number }
  /*
   * Environment failures. Nobody is at fault for these, they already get a
   * toast, and doubling a message through `aria-live` taxes the screen-reader
   * user who is already mid-recovery. The engine keeps them silent; see
   * SENSITIVE in `engine.ts`.
   */
  | { kind: "capture.blocked" }
  | { kind: "join.failed" }
  | { kind: "text.blocked" };

export interface Quip {
  /** Stable id of the chosen line, used to avoid immediate repeats. */
  key: string;
  body: string;
  kind: PersonaEvent["kind"];
  tier: Tier | "sealed";
}

export interface VoicePack {
  id: string;
  /** Display name, e.g. "Keyhole". */
  name: string;
  /** Lines by event and tier. A missing tier falls back to a lower one. */
  lines: Partial<
    Record<PersonaEvent["kind"], Partial<Record<Tier, readonly string[]>>>
  >;
  /**
   * Unlockable material. `{detail}` is substituted with whatever the event
   * carried (a keypair, a day count, a word length) and is always a plain
   * string — lines are static, so there is no interpolation to abuse.
   */
  sealed?: Partial<Record<SealedKey, readonly string[]>>;
}

/**
 * Persistence seam. localStorage today; swap in a Convex mutation to make
 * muting and "I remember what you did" follow the user across devices.
 */
export interface PersonaStore {
  read(): unknown;
  write(state: PersistedPersona): void;
}

export interface PersistedPersona {
  /** Schema version. Unknown versions are discarded, never migrated blindly. */
  v: 1;
  muted: boolean;
  /** How many times the user has unmuted after muting. Egg fuel. */
  muteFlips: number;
  /** Escalation memory, capped by the engine. */
  counts: Record<string, { n: number; at: number }>;
  /** Sealed material already spent, so a joke never lands twice. */
  spent: SealedKey[];
}
