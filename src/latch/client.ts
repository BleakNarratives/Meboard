/**
 * The smallest possible client for the bus: one GET, one POST.
 *
 * No SDK, no Convex client, no auth dance. A device token goes in an
 * `Authorization: Bearer` header and the payload is JSON — which is the entire
 * reason a shell script can be a first-class participant.
 */

export interface LatchEvent {
  id: string;
  from: string;
  kind: string;
  body: string;
  createdAt: number;
}

export interface PollResult {
  events: LatchEvent[];
  cursor: number;
}

/**
 * `status` matters more than the message: 401 means the credential is dead and
 * retrying is pointless, 0 means the network failed and retrying is the fix.
 */
export class LatchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LatchError";
    this.status = status;
  }
}

const TIMEOUT_MS = 10_000;

function networkReason(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return `no answer in ${TIMEOUT_MS / 1000}s`;
    return error.message;
  }
  return String(error);
}

async function send(
  url: string,
  token: string | null,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: {
        // Pairing carries its own credential in the body, so it sends no
        // header at all rather than an empty bearer value.
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new LatchError(networkReason(error), 0);
  }
}

async function explain(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    // a proxy in front of the deployment answers HTML; the status is enough
  }
  return `HTTP ${response.status}`;
}

/** Read everything after `after` (epoch ms). 0 means "as much as you'll give me". */
export async function poll(
  url: string,
  token: string,
  after: number,
): Promise<PollResult> {
  const cursor = Number.isFinite(after) && after > 0 ? Math.floor(after) : 0;
  const response = await send(`${url}/bus/poll?after=${cursor}`, token, {
    method: "GET",
  });
  if (!response.ok) {
    throw new LatchError(await explain(response), response.status);
  }

  const payload = (await response.json()) as {
    events?: unknown;
    cursor?: unknown;
  };
  const events = Array.isArray(payload.events)
    ? (payload.events as LatchEvent[]).filter(
        (event) =>
          typeof event?.createdAt === "number" &&
          typeof event?.body === "string" &&
          typeof event?.from === "string" &&
          typeof event?.kind === "string",
      )
    : [];
  const next =
    typeof payload.cursor === "number" ? payload.cursor : cursor;

  return { events, cursor: Math.max(cursor, next) };
}

export interface PairResult {
  token: string;
  device: string;
}

/**
 * Redeem a six-character pairing code for a device token.
 *
 * No bearer header: the code is the credential, it is worth exactly one
 * device, and it dies on use. The response is the only copy of the token that
 * will ever exist.
 */
export async function pair(
  url: string,
  code: string,
  platform: string,
): Promise<PairResult> {
  const response = await send(`${url}/latch/pair`, null, {
    method: "POST",
    body: JSON.stringify({ code, platform }),
  });
  if (!response.ok) {
    throw new LatchError(await explain(response), response.status);
  }

  const payload = (await response.json()) as {
    token?: unknown;
    device?: unknown;
  };
  if (typeof payload.token !== "string" || typeof payload.device !== "string") {
    throw new LatchError("the deployment answered without a token", 0);
  }
  return { token: payload.token, device: payload.device };
}

/** Publish one line to the log. `from` and `kind` are sanitised server-side. */
export async function publish(
  url: string,
  token: string,
  event: { from: string; kind: string; body: string },
): Promise<void> {
  const response = await send(`${url}/bus/publish`, token, {
    method: "POST",
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    throw new LatchError(await explain(response), response.status);
  }
}
