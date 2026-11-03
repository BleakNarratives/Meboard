import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

// ambiguity-free alphabet: no 0/O, 1/I/L
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError("Sign in to use live boards.");
  }
  return userId;
}

async function clearSignals(ctx: MutationCtx, roomId: Id<"rooms">) {
  const rows = await ctx.db
    .query("signals")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(50);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/** The board this user is currently hosting, if any. */
export const myRoom = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .order("desc")
      .take(5);
    const active = rooms.find((room) => room.status !== "ended");
    if (!active) return null;

    return {
      roomId: active._id,
      code: active.code,
      status: active.status,
      viewerName: active.viewerName ?? null,
      viewerToken: active.viewerToken ?? null,
    };
  },
});

/** State of a board, only for its host or its attached viewer. */
export const roomState = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const room = await ctx.db.get(roomId);
    if (room === null) return null;

    const role =
      room.hostId === userId
        ? ("host" as const)
        : room.viewerId === userId
          ? ("viewer" as const)
          : null;
    if (role === null) return null;

    return {
      role,
      code: room.code,
      status: room.status,
      hostName: room.hostName ?? null,
      viewerName: room.viewerName ?? null,
      // a fresh token every time someone joins, so the host renegotiates
      viewerToken: room.viewerToken ?? null,
      viewerAttached: room.viewerId !== undefined,
    };
  },
});

/** Sdp messages for a board, subscribed to by both sides. */
export const signals = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const room = await ctx.db.get(roomId);
    if (room === null) return [];
    if (room.hostId !== userId && room.viewerId !== userId) return [];

    const rows = await ctx.db
      .query("signals")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(20);

    return rows.map((row) => ({
      id: row._id,
      from: row.from,
      kind: row.kind,
      payload: row.payload,
    }));
  },
});

/** Host a new board and get a join code. Any older board is closed out. */
export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const previous = await ctx.db
      .query("rooms")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .order("desc")
      .take(5);
    for (const room of previous) {
      if (room.status !== "ended") {
        await ctx.db.patch(room._id, { status: "ended" });
        await clearSignals(ctx, room._id);
      }
    }

    const user = await ctx.db.get(userId);

    let code = randomCode(6);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .take(5);
      if (!clash.some((room) => room.status !== "ended")) break;
      code = randomCode(6);
    }

    const roomId = await ctx.db.insert("rooms", {
      code,
      hostId: userId,
      hostName: user?.name ?? user?.email,
      status: "waiting" as const,
    });

    return { roomId, code };
  },
});

/** Attach to someone else's board by code. */
export const joinRoom = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await requireUserId(ctx);
    const normalized = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");

    const matches = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .order("desc")
      .take(5);
    const room = matches.find((candidate) => candidate.status !== "ended");
    if (room === undefined) {
      throw new ConvexError(
        "That code isn't live. Ask the other device for a fresh one.",
      );
    }
    if (room.hostId === userId) {
      throw new ConvexError(
        "That's your own board — open it on the other device.",
      );
    }

    // clear stale handshake messages before the host renegotiates
    await clearSignals(ctx, room._id);
    const user = await ctx.db.get(userId);

    await ctx.db.patch(room._id, {
      viewerId: userId,
      viewerName: user?.name ?? user?.email,
      viewerToken: randomCode(10),
      status: "live" as const,
    });

    return { roomId: room._id, hostName: room.hostName ?? null };
  },
});

/** Publish this side's sdp offer/answer. */
export const postSignal = mutation({
  args: {
    roomId: v.id("rooms"),
    kind: v.union(v.literal("offer"), v.literal("answer")),
    payload: v.string(),
  },
  handler: async (ctx, { roomId, kind, payload }) => {
    const userId = await requireUserId(ctx);
    const room = await ctx.db.get(roomId);
    if (room === null || room.status === "ended") return;

    const from =
      room.hostId === userId
        ? ("host" as const)
        : room.viewerId === userId
          ? ("viewer" as const)
          : null;
    if (from === null) {
      throw new ConvexError("You're not part of this board.");
    }

    // only the newest message of each kind matters
    const existing = await ctx.db
      .query("signals")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(20);
    for (const row of existing) {
      if (row.from === from && row.kind === kind) {
        await ctx.db.delete(row._id);
      }
    }

    await ctx.db.insert("signals", { roomId, from, kind, payload });
  },
});

/** Close the board (host only) so the code can't be reused. */
export const endRoom = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;

    const room = await ctx.db.get(roomId);
    if (room === null || room.hostId !== userId) return;

    await ctx.db.patch(roomId, {
      status: "ended" as const,
      viewerId: undefined,
      viewerName: undefined,
      viewerToken: undefined,
    });
    await clearSignals(ctx, roomId);
  },
});
