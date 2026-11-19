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
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

/** Retention, not a quota: an agent left in a loop must not grow the table forever. */
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

/* Enrolled devices — the terminal end of Latch. A device is a capability, not a
 * session: it holds its own bearer token, proves itself by polling, and revoking
 * one leaves every other machine alone. One token per user makes revocation
 * all-or-nothing, which is exactly wrong when the machine being revoked is the
 * one that got stolen. What a device may do here is read the log and publish
 * plain text; there is no verb table and no injection path, on purpose. */

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

/**
 * Enrol a device and return its token exactly once. There is no "show token"
 * query on purpose: a credential that can be read back out of the database is a
 * credential with a second copy in the UI. Lose it, revoke, mint again.
 */
export const mintDevice = mutation({
  args: { name: v.string(), platform: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const name = label(args.name, "", MAX_DEVICE_NAME);
    if (name.length === 0) {
      throw new ConvexError("Give the device a name, e.g. chromebook.");
    }
    const platform = label(args.platform, "", MAX_DEVICE_NAME);

    const rows = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_DEVICES * 2);
    const live = rows.filter((device) => device.revoked !== true);

    if (live.length >= MAX_DEVICES) {
      throw new ConvexError(
        `That's ${MAX_DEVICES} live devices. Revoke one before adding another.`,
      );
    }
    if (live.some((device) => device.name === name)) {
      throw new ConvexError(
        `"${name}" is already enrolled. Revoke it first, or pick another name.`,
      );
    }

    const token = randomToken();
    const deviceId = await ctx.db.insert("devices", {
      userId,
      name,
      platform: platform.length > 0 ? platform : undefined,
      token,
      createdAt: Date.now(),
      revoked: false,
    });

    return { deviceId: deviceId as string, name, token };
  },
});

/**
 * Kill one device's token. Deliberately not a delete: the log keeps saying
 * which machine reported something, and a revoked row is a receipt that the
 * device existed rather than a hole where it used to be.
 */
export const revokeDevice = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, { deviceId }) => {
    const userId = await requireUserId(ctx);
    const device = await ctx.db.get(deviceId);
    if (device === null || device.userId !== userId) {
      throw new ConvexError("No such device.");
    }
    if (device.revoked !== true) {
      await ctx.db.patch(deviceId, { revoked: true });
    }
  },
});

/**
 * Presence, driven by polling. Called from the poll route, so "live" in the UI
 * means "this machine asked for work recently" rather than "someone once pasted
 * a token".
 */
export const touchDevice = internalMutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, { deviceId }) => {
    const device = await ctx.db.get(deviceId);
    if (device === null || device.revoked === true) return;
    const now = Date.now();
    if (
      device.lastSeen !== undefined &&
      now - device.lastSeen < TOUCH_INTERVAL_MS
    ) {
      return;
    }
    await ctx.db.patch(deviceId, { lastSeen: now });
  },
});

/* Pairing: the primary enrolment path. A device token is 48 hex characters,
 * fine to store and miserable to type on a machine with a broken keyboard, so
 * the page mints six instead and the device repeats them once. The code is a
 * claim ticket, not a credential: it buys a device token and dies when used.
 * The three-minute window is what makes six characters enough — 31^6 is about
 * 887 million, an attacker gets roughly 180 seconds of guesses, and a wrong
 * guess is indistinguishable from an expired one. */

const PAIRING_TTL_MS = 3 * 60_000;
const PAIRING_LENGTH = 6;
/** Open codes are cheap to mint; the cap is so the list stays readable. */
const MAX_PAIRINGS = 5;

/** Same alphabet the join codes use: no 0/O, no 1/I/L, no ambiguity. */
function normaliseCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Mint a short code for a device the page has already named. */
export const createPairing = mutation({
  args: { name: v.string(), platform: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const name = label(args.name, "", MAX_DEVICE_NAME);
    if (name.length === 0) {
      throw new ConvexError("Give the device a name, e.g. chromebook.");
    }
    const platform = label(args.platform, "", MAX_DEVICE_NAME);
    const now = Date.now();

    // Expired codes are deleted on sight: there is no cron here, and a table
    // that only grows is a table nobody notices until it is large.
    const open = await ctx.db
      .query("pairings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_PAIRINGS * 2);
    let live = 0;
    for (const row of open) {
      if (row.claimedAt === undefined && row.expiresAt <= now) {
        await ctx.db.delete(row._id);
        continue;
      }
      if (row.claimedAt === undefined) live += 1;
    }
    if (live >= MAX_PAIRINGS) {
      throw new ConvexError(
        "You already have several codes open. Use one, or wait three minutes for them to expire.",
      );
    }

    // Refuse now rather than mint a code that cannot be redeemed: a dead end
    // that looks like a working ticket is worse than an error at the start.
    const enrolled = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_DEVICES * 2);
    const active = enrolled.filter((device) => device.revoked !== true);
    if (active.length >= MAX_DEVICES) {
      throw new ConvexError(
        `That's ${MAX_DEVICES} live devices. Revoke one before adding another.`,
      );
    }
    if (active.some((device) => device.name === name)) {
      throw new ConvexError(
        `"${name}" is already enrolled. Revoke it first, or pick another name.`,
      );
    }

    // Never hand out a code that collides with a live one: two devices on the
    // same code means one silently gets the other's token.
    let code = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = randomCode(PAIRING_LENGTH);
      const clash = await ctx.db
        .query("pairings")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .take(3);
      if (
        !clash.some((row) => row.claimedAt === undefined && row.expiresAt > now)
      ) {
        code = candidate;
        break;
      }
    }
    if (code.length === 0) {
      throw new ConvexError("Couldn't allocate a code. Try again in a moment.");
    }

    const expiresAt = now + PAIRING_TTL_MS;
    await ctx.db.insert("pairings", {
      userId,
      code,
      name,
      platform: platform.length > 0 ? platform : undefined,
      createdAt: now,
      expiresAt,
    });

    return { code, name, expiresAt };
  },
});

/**
 * Redeem a pairing code for a device token. Called from `/latch/pair`.
 *
 * Every rejection is collapsed into one reason by the route: "used", "expired"
 * and "never existed" are the same answer, so the endpoint cannot be asked
 * whether a code is real.
 */
export const redeemPairing = internalMutation({
  args: { code: v.string(), platform: v.optional(v.string()) },
  handler: async (ctx, { code, platform }) => {
    const now = Date.now();
    const normalized = normaliseCode(code);
    if (normalized.length !== PAIRING_LENGTH) {
      return { ok: false as const, reason: "invalid" as const };
    }

    const matches = await ctx.db
      .query("pairings")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("desc")
      .take(3);
    // Newest first: an old claimed row must not shadow a fresh code that drew
    // the same six characters weeks later.
    const pairing = matches.find(
      (row) => row.claimedAt === undefined && row.expiresAt > now,
    );
    if (!pairing) return { ok: false as const, reason: "invalid" as const };

    // Claim before minting. Convex mutations are transactional, so two devices
    // racing the same code cannot both get through this line.
    await ctx.db.patch(pairing._id, { claimedAt: now });

    const enrolled = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", pairing.userId))
      .take(MAX_DEVICES * 2);
    const active = enrolled.filter((device) => device.revoked !== true);
    if (active.length >= MAX_DEVICES) {
      return { ok: false as const, reason: "full" as const };
    }
    if (active.some((device) => device.name === pairing.name)) {
      return { ok: false as const, reason: "duplicate" as const };
    }

    const token = randomToken();
    const devicePlatform = label(platform, "", MAX_DEVICE_NAME);
    const deviceId = await ctx.db.insert("devices", {
      userId: pairing.userId,
      name: pairing.name,
      platform: devicePlatform.length > 0 ? devicePlatform : pairing.platform,
      token,
      createdAt: now,
      revoked: false,
      // the device is demonstrably alive: it just typed the code
      lastSeen: now,
    });

    return {
      ok: true as const,
      token,
      deviceId: deviceId as string,
      name: pairing.name,
    };
  },
});

/** Send a message from the app — the human side of the conversation. */
export const post = mutation({
  args: {
    from: v.optional(v.string()),
    kind: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const body = sanitizeBody(args.body);
    if (body.length === 0) {
      throw new ConvexError("Say something first.");
    }
    if (body.length > MAX_BODY) {
      throw new ConvexError(`Keep it under ${MAX_BODY} characters.`);
    }
    const now = Date.now();
    await ctx.db.insert("busEvents", {
      userId,
      from: label(args.from, "human", MAX_FROM),
      kind: label(args.kind, "note", MAX_KIND),
      body,
      createdAt: now,
    });
    await prune(ctx, userId);
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
      deviceId: (row.deviceId as string | undefined) ?? null,
      createdAt: row.createdAt,
    }));
  },
});

/* HTTP-facing. These are internal: an outside agent cannot call them directly,
 * only through the authenticated routes in http.ts. */

export const lookupToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    // Cheap shape check before touching the database. Both credential kinds are
    // 48 hex chars, so the check is shared rather than duplicated.
    if (!/^[0-9a-f]{40,64}$/.test(token)) return null;

    // A device token first: it is the narrower capability, and the only one
    // that can be revoked per machine. Returning which device spoke is what
    // lets the poll route stamp presence and the log name the machine.
    const device = await ctx.db
      .query("devices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (device !== null) {
      if (device.revoked === true) return null;
      return { userId: device.userId as Id<"users">, deviceId: device._id };
    }

    const row = await ctx.db
      .query("busTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!row || row.revoked) return null;
    return { userId: row.userId as Id<"users">, deviceId: null };
  },
});

export const append = internalMutation({
  args: {
    userId: v.id("users"),
    from: v.string(),
    kind: v.string(),
    body: v.string(),
    deviceId: v.optional(v.id("devices")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("busEvents", {
      userId: args.userId,
      from: label(args.from, "external", MAX_FROM),
      kind: label(args.kind, "note", MAX_KIND),
      body: sanitizeBody(args.body).slice(0, MAX_BODY),
      deviceId: args.deviceId,
      createdAt: now,
    });
    await prune(ctx, args.userId);
    return { id: id as string, createdAt: now };
  },
});

export const listAfter = internalQuery({
  args: { userId: v.id("users"), after: v.number() },
  handler: async (ctx, { userId, after }) => {
    const rows = await ctx.db
      .query("busEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId).gt("createdAt", after))
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
