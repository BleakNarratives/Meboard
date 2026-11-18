import { getAuthUserId } from "@convex-dev/auth/server";
import { randomCode } from "./live";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * The turd-merger wire.
 *
 * One append-only log per user. The app reads it reactively; an external agent
 * (a CLI, another model, a shell script) writes to it over HTTP with a bearer
 * token. That's the whole contract:
 *
 *   POST /bus/publish   {"from":"gemini","kind":"note","body":"..."}
 *   GET  /bus/poll?after=<ms>
 *
 * There is no shared secret in an env file and nothing to configure: the token
 * is a capability, minted by a signed-in user, revocable by rotating it. If the
 * token leaks, you rotate; if it never leaks, you never think about it again.
 */
export const MAX_BODY = 4000;
export const MAX_FROM = 32;
export const MAX_KIND = 24;
export const MAX_POLL = 100;

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError("Sign in to use the bus.");
  }
  return userId;
}

/**
 * 192 bits of randomness, hex-encoded. `crypto` is present in the Convex
 * runtime; a token is a bearer credential, so it does not come from
 * `Math.random` under any circumstances.
 */
function randomToken(): string {
  const buffer = new Uint8Array(24);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * `from` and `kind` are rendered as labels. Control characters and bidi
 * overrides let a sender make one agent's message look like another's, so the
 * character set is a whitelist rather than a trim.
 */
function label(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[^\w .:_-]/g, "")
    .trim()
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Bodies keep their line breaks and tabs, and nothing else invisible. */
function sanitizeBody(value: string): string {
  return value
    // Stripping control characters IS the job of this function. A body is
    // rendered in a terminal and in an aria-live region, where a stray escape
    // sequence or bidi override makes the text say something it does not say.
    // Tab and newline survive; everything else invisible does not. The rule is
    // disabled for this one expression, not for the file.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

/**
 * Retention, not a quota: an agent left in a loop must not be able to grow the
 * table forever. Pruning is batched so a write stays cheap, and it runs on the
 * write path so there is no cron to forget about.
 */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH = 20;

async function prune(ctx: MutationCtx, userId: Id<"users">) {
  const stale = await ctx.db
    .query("busEvents")
    .withIndex("by_user", (q) =>
      q.eq("userId", userId).lt("createdAt", Date.now() - RETENTION_MS),
    )
    .take(PRUNE_BATCH);
  for (const row of stale) {
    await ctx.db.delete(row._id);
  }
}

export const myToken = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const rows = await ctx.db
      .query("busTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10);
    return rows.find((row) => !row.revoked)?.token ?? null;
  },
});

export const issueToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("busTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10);
    const live = rows.find((row) => !row.revoked);
    if (live) return { token: live.token };

    const token = randomToken();
    await ctx.db.insert("busTokens", {
      userId,
      token,
      createdAt: Date.now(),
      revoked: false,
    });
    return { token };
  },
});

/** Revoke every token this user has and mint one new one. */
export const rotateToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("busTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(50);
    for (const row of rows) {
      if (!row.revoked) await ctx.db.patch(row._id, { revoked: true });
    }
    const token = randomToken();
    await ctx.db.insert("busTokens", {
      userId,
      token,
      createdAt: Date.now(),
      revoked: false,
    });
    return { token };
  },
});

/* ------------------------------------------------------------------ *
 * Enrolled devices — the terminal end of Latch.
 *
 * A device is a capability, not a session: it holds its own bearer token, it
 * proves itself by polling, and revoking one leaves every other machine alone.
 * That is the only reason this exists separately from `busTokens` — one token
 * per user makes revocation all-or-nothing, which is exactly wrong when the
 * thing you are revoking is the laptop that got stolen.
 *
 * What a device may do in this build: read the log, and publish plain text to
 * it. There is no verb table, no command column and no injection path here on
 * purpose. Escalating capability starts with adding a column, which is a
 * decision someone has to make out loud.
 * ------------------------------------------------------------------ */

/** Eight is already more machines than one person can keep track of. */
const MAX_DEVICES = 8;
const MAX_DEVICE_NAME = 32;
/** A poll every two seconds must not become a write every two seconds. */
const TOUCH_INTERVAL_MS = 20_000;

/** Only the tail is ever shown, so a list can't leak a working credential. */
function deviceSuffix(token: string): string {
  return token.slice(-6);
}

/** Every device this user has enrolled, newest first. Tokens stay server-side. */
export const devices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const rows = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_DEVICES * 2);

    return rows.map((device) => ({
      id: device._id,
      name: device.name,
      platform: device.platform ?? null,
      suffix: deviceSuffix(device.token),
      createdAt: device.createdAt,
      lastSeen: device.lastSeen ?? null,
      revoked: device.revoked === true,
    }));
  },
});
