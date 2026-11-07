import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { auth } from "./auth";
import { MAX_BODY, MAX_FROM, MAX_KIND } from "./bus";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * The agent-facing side of the bus. Two routes, bearer token, no cookies required
 * — which is the point: a CLI agent cannot sign in with an email OTP, but it can
 * hold a token and speak JSON.
 */
function reply(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function userIdFor(ctx: ActionCtx, request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (token.length === 0) return null;

  const found = await ctx.runQuery(internal.bus.lookupToken, { token });
  return found?.userId ?? null;
}

function clean(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/[^\w .:_-]/g, "").trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : fallback;
}

http.route({
  path: "/bus/publish",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = await userIdFor(ctx, request);
    if (!userId) return reply(401, { error: "missing or revoked token" });

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return reply(400, { error: "body must be JSON" });
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return reply(400, { error: "body must be a JSON object" });
    }

    const data = parsed as Record<string, unknown>;
    const body = typeof data.body === "string" ? data.body.trim() : "";
    if (body.length === 0) return reply(400, { error: "body is required" });
    if (body.length > MAX_BODY) {
      return reply(413, { error: `body must be ${MAX_BODY} characters or fewer` });
    }

    const saved = await ctx.runMutation(internal.bus.append, {
      userId,
      from: clean(data.from, "external", MAX_FROM),
      kind: clean(data.kind, "note", MAX_KIND),
      body,
    });

    return reply(200, { ok: true, ...saved });
  }),
});

http.route({
  path: "/bus/poll",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const userId = await userIdFor(ctx, request);
    if (!userId) return reply(401, { error: "missing or revoked token" });

    const url = new URL(request.url);
    const raw = Number(url.searchParams.get("after") ?? "0");
    const after = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

    const events = await ctx.runQuery(internal.bus.listAfter, { userId, after });
    const cursor =
      events.length > 0 ? events[events.length - 1].createdAt : after;

    return reply(200, { events, cursor });
  }),
});

export default http;
