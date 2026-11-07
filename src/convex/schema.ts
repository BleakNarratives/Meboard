import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    // a live screen-share board. the host captures its own screen and
    // advertises a short join code; one viewer can attach at a time.
    rooms: defineTable({
      code: v.string(),
      hostId: v.id("users"),
      hostName: v.optional(v.string()),
      status: v.union(
        v.literal("waiting"),
        v.literal("live"),
        v.literal("ended"),
      ),
      viewerId: v.optional(v.id("users")),
      viewerName: v.optional(v.string()),
      // regenerated on every join so the host knows to renegotiate
      viewerToken: v.optional(v.string()),
    })
      .index("by_code", ["code"])
      .index("by_host", ["hostId"]),

    // capability tokens that let an external agent (a CLI, another model, a
    // script) talk to the bus over HTTP without a browser session. a token
    // belongs to exactly one user and is revocable by rotating it.
    busTokens: defineTable({
      userId: v.id("users"),
      token: v.string(),
      createdAt: v.number(),
      revoked: v.optional(v.boolean()),
    })
      .index("by_token", ["token"])
      .index("by_user", ["userId"]),

    // the turd-merger wire: one append-only log per user, readable from the
    // app (reactively) and from any agent that holds the token.
    busEvents: defineTable({
      userId: v.id("users"),
      from: v.string(),
      kind: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    // sdp handshake messages passed between the two peers
    signals: defineTable({
      roomId: v.id("rooms"),
      from: v.union(v.literal("host"), v.literal("viewer")),
      kind: v.union(v.literal("offer"), v.literal("answer")),
      payload: v.string(),
    }).index("by_room", ["roomId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
