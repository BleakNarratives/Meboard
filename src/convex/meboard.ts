// convex/meboard.ts — the whole Meboard backend in one file.
//
// WHY ONE FILE:
// Every operation here touches the same four columns and the same two
// rules (own it, clamp it). Splitting queries and mutations across files
// would spread those rules out, and the first thing to rot when rules are
// spread out is the ownership check. One file, one place to read.
//
// THE TWO RULES:
//   1. A user may only see and touch their own bits. Enforced in every
//      handler, not just in the query — a query that filters and a
//      mutation that trusts the id is a data breach with extra steps.
//   2. weight is clamped to [MIN_WEIGHT, MAX_WEIGHT]. Unbounded weights
//      turn a moodboard into a leaderboard: one beloved bit dominates the
//      mood dial forever and the board stops being yours.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { bitKindValidator } from "./schema";
import { mutation, query } from "./_generated/server";

const MIN_WEIGHT = 0;
const MAX_WEIGHT = 5;

// Clamp in one helper so reward and discipline can never disagree about
// the ceiling. If this ever changes, it changes in exactly one place.
function clampWeight(weight: number): number {
  return Math.max(MIN_WEIGHT, Math.min(weight, MAX_WEIGHT));
}

// ---------------------------------------------------------------------------
// QUERY
// ---------------------------------------------------------------------------

/**
 * Every bit on the current user's board, oldest first.
 *
 * Returns [] for signed-out visitors instead of throwing. That is a
 * deliberate choice: the landing page renders a board preview, and a
 * preview that explodes for logged-out visitors is worse than an empty
 * preview. The client does not need to know whether the emptiness came
 * from "no bits" or "no user" to render correctly.
 *
 * Sorting happens in JS rather than a compound index scan with ordering
 * because a board is tens of rows, not millions. If it ever grows past
 * that, this is the line to change.
 */
export const listBits = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const bits = await ctx.db
      .query("bits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return bits.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// ---------------------------------------------------------------------------
// MUTATIONS
// ---------------------------------------------------------------------------

/**
 * Drop a bit on the board.
 *
 * Trims the label server-side. The client also trims, but the client is
 * not a security boundary and whitespace-only bits are a real thing that
 * shows up as invisible rows on a moodboard.
 *
 * New bits start at weight 1 and raised. Nothing starts at zero: a bit
 * the user just thought of is already worth something.
 */
export const addBit = mutation({
  args: {
    label: v.string(),
    kind: bitKindValidator,
  },
  handler: async (ctx, { label, kind }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to drop a bit.");

    const trimmed = label.trim();
    if (trimmed.length === 0) throw new Error("A blank bit is not a bit.");
    // Cap runaway paste-bombs; long enough for a real thought, short
    // enough that the board layout survives.
    if (trimmed.length > 280) throw new Error("Keep it under 280 characters.");

    return await ctx.db.insert("bits", {
      userId,
      label: trimmed,
      kind,
      weight: 1,
      raised: true,
      createdAt: Date.now(),
    });
  },
});

/**
 * "Hell yeah." Raise the weight, and raise the bit with it.
 *
 * Rewarding a sunken bit brings it back up — that is the "rises again"
 * half of the product promise, and it is the reason `raised` is forced
 * true here rather than merely inherited.
 */
export const rewardBit = mutation({
  args: { bitId: v.id("bits") },
  handler: async (ctx, { bitId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to reward a bit.");

    const bit = await ctx.db.get(bitId);
    // Ownership is checked explicitly. `db.get` does not know who is
    // asking, so without this line any signed-in user could reward
    // anyone else's bit by guessing an id.
    if (bit === null || bit.userId !== userId) {
      throw new Error("That bit is not yours.");
    }

    const nextWeight = clampWeight(bit.weight + 1);
    // No-op when already maxed: avoids pointless writes that would
    // invalidate every subscriber for nothing.
    if (nextWeight === bit.weight && bit.raised) return;

    await ctx.db.patch(bitId, { weight: nextWeight, raised: true });
  },
});

/**
 * "No, wrong." Lower the weight, and let the bit sink when it hits zero.
 *
 * The bit is never deleted here. Deleting on discipline would mean a user
 * who punished a bad idea loses the record of having had it — which is
 * exactly the history a learning board should keep. Explicit removal is
 * a separate mutation, so it can never happen by accident.
 */
export const disciplineBit = mutation({
  args: { bitId: v.id("bits") },
  handler: async (ctx, { bitId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to discipline a bit.");

    const bit = await ctx.db.get(bitId);
    if (bit === null || bit.userId !== userId) {
      throw new Error("That bit is not yours.");
    }

    const nextWeight = clampWeight(bit.weight - 1);

    await ctx.db.patch(bitId, {
      weight: nextWeight,
      // Weight zero means the board has stopped believing this bit.
      raised: nextWeight > 0,
    });
  },
});

/**
 * Manually drop or lift a bit without changing its weight.
 *
 * This exists because "collapse the board" and "this idea is bad" are
 * different statements, and collapsing a good idea should not cost it
 * any standing. Keeping them separate is why the UI can offer a neutral
 * drop button without it reading as punishment.
 */
export const toggleRaised = mutation({
  args: { bitId: v.id("bits") },
  handler: async (ctx, { bitId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to move a bit.");

    const bit = await ctx.db.get(bitId);
    if (bit === null || bit.userId !== userId) {
      throw new Error("That bit is not yours.");
    }

    await ctx.db.patch(bitId, { raised: !bit.raised });
  },
});

/**
 * Forget a bit permanently. The only destructive operation, on purpose.
 */
export const removeBit = mutation({
  args: { bitId: v.id("bits") },
  handler: async (ctx, { bitId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to remove a bit.");

    const bit = await ctx.db.get(bitId);
    if (bit === null || bit.userId !== userId) {
      throw new Error("That bit is not yours.");
    }

    await ctx.db.delete(bitId);
  },
});

/**
 * Put the starter bits on a brand-new board.
 *
 * Seeding is a mutation rather than something the client fakes, because a
 * client-side seed would have no real ids and the first reward would then
 * fail. It also means the seeds are identical across devices instead of
 * being re-invented per browser.
 *
 * Guarded on "zero bits exist" so a double-fire (strict mode, two tabs,
 * an impatient double click) cannot stack two copies of the same board.
 * The check and the insert are not atomic across the whole write, but a
 * duplicate seed on a brand-new empty board is a cosmetic problem at
 * worst — the alternative is a transaction we do not need.
 */
export const seedBoard = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;

    const existing = await ctx.db
      .query("bits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing !== null) return;

    const now = Date.now();
    // Jokes with a spine: they teach the tone and the kinds in one glance,
    // and the user is expected to overwrite them immediately.
    const seeds: Array<{ label: string; kind: "idea" | "file" | "audio" | "terminal" | "agent" | "other" }> = [
      { label: "something I almost said out loud", kind: "idea" },
      { label: "a command I still do not trust", kind: "terminal" },
      { label: "a clip that keeps coming back", kind: "audio" },
      { label: "an agent I am still judging", kind: "agent" },
      { label: "one thing I was confidently wrong about", kind: "idea" },
    ];

    for (const [index, seed] of seeds.entries()) {
      await ctx.db.insert("bits", {
        userId,
        label: seed.label,
        kind: seed.kind,
        weight: 1,
        raised: true,
        // Offset so ordering is stable instead of five identical stamps.
        createdAt: now + index,
      });
    }
  },
});
