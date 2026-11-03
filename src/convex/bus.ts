import { getAuthUserId } from "@convex-dev/auth/server";
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

function clean(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : fallback;
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

/** Send a message from the app — the human side of the conversation. */
export const post = mutation({
  args: { from: v.optional(v.string()), kind: v.optional(v.string()), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const body = args.body.trim();
    if (body.length === 0) {
      throw new ConvexError("Say something first.");
    }
    if (body.length > MAX_BODY) {
      throw new ConvexError(`Keep it under ${MAX_BODY} characters.`);
    }
    const now = Date.now();
    await ctx.db.insert("busEvents", {
      userId,
      from: clean(args.from, "human", MAX_FROM),
      kind: clean(args.kind, "note", MAX_KIND),
      body,
      createdAt: now,
    });
    return { ok: true, createdAt: now };
  },
});

/** The last 40 events, oldest first, for the app's log. */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("busEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(40);

    return rows.reverse().map((row) => ({
      id: row._id as string,
      from: row.from,
      kind: row.kind,
      body: row.body,
      createdAt: row.createdAt,
    }));
  },
});

/* ------------------------------------------------------------------ *
 * HTTP-facing. These are internal: an outside agent cannot call them
 * directly, only through the authenticated routes in http.ts.
 * ------------------------------------------------------------------ */

export const lookupToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    // Cheap shape check before touching the database.
    if (!/^[0-9a-f]{40,64}$/.test(token)) return null;
    const row = await ctx.db
      .query("busTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!row || row.revoked) return null;
    return { userId: row.userId as Id<"users"> };
  },
});

export const append = internalMutation({
  args: {
    userId: v.id("users"),
    from: v.string(),
    kind: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("busEvents", {
      userId: args.userId,
      from: args.from,
      kind: args.kind,
      body: args.body,
      createdAt: now,
    });
    return { id: id as string, createdAt: now };
  },
});

export const listAfter = internalQuery({
  args: { userId: v.id("users"), after: v.number() },
  handler: async (ctx, { userId, after }) => {
    const rows = await ctx.db
      .query("busEvents")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).gt("createdAt", after),
      )
      .take(MAX_POLL);

    return rows.map((row) => ({
      id: row._id as string,
      from: row.from,
      kind: row.kind,
      body: row.body,
      createdAt: row.createdAt,
    }));
  },
});
