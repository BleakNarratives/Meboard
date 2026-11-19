#!/usr/bin/env node
/**
 * latch — the terminal end of the bus.
 *
 *   latch enroll     type the six-character code from /devices
 *   latch status     am I enrolled, is the token alive, what am I allowed to do
 *   latch listen     print what arrives on the wire, and say hello
 *
 * No verbs beyond "read" and "write text". There is no `type`, no `key`, no
 * `run` — a device that can be typed into is a different product with a
 * different consent surface, and that gets decided on purpose or not at all.
 *
 * Output is plain text: no colour, no spinner, no cursor games. It may be piped
 * into a file, read aloud by a screen reader, or be the only channel left on a
 * machine whose UI is broken.
 */
import { createInterface } from "node:readline/promises";

import { readClipboard } from "./clipboard";

import {
  configPath,
  defaultDeviceName,
  readConfig,
  resolveUrl,
  tokenSuffix,
  writeConfig,
} from "./config";
import { LatchError, pair, poll, publish, type LatchEvent } from "./client";

const HELP = `latch — enrol a device and prove the wire

  latch enroll [CODE] [--clip] [--name NAME] [--platform NAME] [--url URL]
  latch status  [--url URL]
  latch listen  [--once] [--interval SECONDS] [--url URL]
  latch help

enroll   Type the six-character code from /devices:  latch enroll 4K7Q2M
         That is the whole instruction. The code is redeemed once, within
         three minutes, and replaced by a device token stored at
         ~/.latch/config.json (mode 0600). The deployment is baked into this
         binary, so there is no URL to look up and type.
         Omit CODE and it asks, so you can type it at the prompt instead.

         --clip   read a long-lived token off the clipboard instead.
                  Windows and macOS only. ChromeOS blocks programmatic
                  clipboard reads inside its Linux container by design, and
                  Termux needs termux-api in the foreground — neither is
                  fixed by retrying.
         --name   ignored when pairing: the page names the device when it
                  mints the code, and that name wins.

status   One round trip. Says whether the token is alive, and what it can do.
listen   Polls the bus and prints every event as it arrives. Publishes a single
         device.online on start and device.offline on ctrl-c, so the app can see
         the machine is actually there.

env      LATCH_URL     endpoint override, e.g. https://<deployment>.convex.site
         LATCH_TOKEN   a device token, for a container with no home directory
         LATCH_NAME    default device name when a token is used
         LATCH_CONFIG  config file path (default ~/.latch/config.json)

runs on  node 18+ · bun · deno (with --allow-read --allow-env --allow-run)
         windows powershell · cmd · macos · linux · crostini · termux

No input injection. A device can read the wire and write text to it; it cannot
type, click, or run anything.`;

type Flags = Map<string, string | true>;

function parseArgs(argv: string[]) {
  const flags: Flags = new Map();
  const rest: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=");
      if (inline !== undefined) {
        flags.set(key, inline);
        continue;
      }
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next);
        index += 1;
      } else {
        flags.set(key, true);
      }
      continue;
    }
    rest.push(arg);
  }
  return { flags, rest };
}

function value(flags: Flags, key: string): string | undefined {
  const found = flags.get(key);
  return typeof found === "string" ? found : undefined;
}

function field(label: string, text: string): void {
  console.log(`  ${label.padEnd(9)} ${text}`);
}

function ago(at: number): string {
  const diff = Date.now() - at;
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function clock(at: number): string {
  const date = new Date(at);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** One event, two lines: the header is scannable, the body is the payload. */
function render(event: LatchEvent): void {
  console.log(`${clock(event.createdAt)}  ${event.from}  ${event.kind}`);
  for (const line of event.body.split(/\r?\n/)) {
    console.log(`          ${line}`);
  }
}

function fail(message: string, hint?: string): number {
  console.error(`latch: ${message}`);
  if (hint) console.error(`       ${hint}`);
  return 1;
}

/** A six-character pairing code, or a full device token. */
function looksLikeToken(value: string): boolean {
  return /^[0-9a-f]{40,64}$/.test(value);
}

const PAIRING_CODE = /^[0-9A-Z]{6}$/;

type Credential =
  | { kind: "code"; value: string }
  | { kind: "token"; value: string };

type CredentialResult = Credential | { error: string; hint?: string };

/** Anything a person could plausibly mean by "the thing on the screen". */
function classify(raw: string): Credential | null {
  const trimmed = raw.trim();
  if (looksLikeToken(trimmed)) return { kind: "token", value: trimmed };
  // Read the code as people read it: case, spaces, a stray dash from a line
  // wrap. The alphabet has no ambiguous characters, so normalising is safe.
  const code = trimmed.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (PAIRING_CODE.test(code)) return { kind: "code", value: code };
  return null;
}

async function obtainCredential(
  flags: Flags,
  positional: string | undefined,
): Promise<CredentialResult> {
  if (positional !== undefined) {
    return (
      classify(positional) ?? {
        error: `"${positional}" isn't a pairing code or a device token`,
        hint: "codes are six characters: latch enroll 4K7Q2M",
      }
    );
  }

  if (flags.has("clip")) {
    const found = readClipboard();
    if (!found) {
      return {
        error: "couldn't read the clipboard",
        hint: "ChromeOS blocks this inside its Linux container by design, and Termux needs termux-api in the foreground. Windows and macOS work. Otherwise just type the code: latch enroll 4K7Q2M",
      };
    }
    return (
      classify(found.text) ?? {
        error: "the clipboard doesn't hold a token or a code",
        hint: `it starts "${found.text.slice(0, 16).replace(/\s+/g, " ")}…"`,
      }
    );
  }

  const fromEnv = process.env.LATCH_TOKEN?.trim();
  if (fromEnv) {
    return (
      classify(fromEnv) ?? {
        error: "LATCH_TOKEN isn't a device token",
        hint: "mint one at /devices, or pair with a code",
      }
    );
  }

  if (process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    try {
      const answer = await rl.question("Pairing code from /devices: ");
      return (
        classify(answer) ?? {
          error: "that isn't a pairing code",
          hint: "six characters, e.g. 4K7Q2M",
        }
      );
    } finally {
      rl.close();
    }
  }

  // Non-interactive: a container pipes the code in, or sets LATCH_TOKEN.
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return (
    classify(Buffer.concat(chunks).toString("utf8")) ?? {
      error: "nothing on stdin",
      hint: "pass a code: latch enroll 4K7Q2M",
    }
  );
}

async function enroll(
  flags: Flags,
  positional: string | undefined,
): Promise<number> {
  const url = resolveUrl(value(flags, "url"));
  if (!url) {
    return fail(
      "no endpoint to enrol against",
      "pass --url https://<deployment>.convex.site — a bundle built with VITE_CONVEX_URL already carries the endpoint",
    );
  }

  let device = value(flags, "name") ?? defaultDeviceName();
  const obtained = await obtainCredential(flags, positional);
  if ("error" in obtained) {
    return fail(obtained.error, obtained.hint);
  }

  let token = obtained.value;
  if (obtained.kind === "code") {
    // The code is the credential and it dies right here. What comes back is the
    // device token that actually gets stored.
    try {
      const paired = await pair(
        url,
        obtained.value,
        `${process.platform} ${process.arch}`,
      );
      token = paired.token;
      // The page named the device when it minted the code. That wins: the
      // person looking at the device list chose it, not the machine.
      device = paired.device;
    } catch (error) {
      if (error instanceof LatchError && error.status === 401) {
        return fail(
          "that code isn't live",
          "codes last three minutes and work once — get a fresh one at /devices and retype it",
        );
      }
      if (error instanceof LatchError && error.status > 0) {
        return fail(
          `the deployment refused that code (HTTP ${error.status})`,
          error.message,
        );
      }
      return fail(
        `couldn't reach ${url}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // Verify before writing. A token that 401s must not be saved, or `status`
  // becomes a confusing message about a file rather than about the credential.
  let wire = 0;
  let newest: number | null = null;
  try {
    const result = await poll(url, token, 0);
    wire = result.events.length;
    newest = wire > 0 ? result.events[wire - 1].createdAt : null;
  } catch (error) {
    if (error instanceof LatchError && error.status === 401) {
      return fail(
        "that token isn't live",
        "it was revoked, or this isn't the deployment that minted it. Mint a fresh one at /devices.",
      );
    }
    if (error instanceof LatchError && error.status > 0) {
      // Almost always a `.convex.cloud` URL: HTTP routes live on `.convex.site`,
      // and the difference is one word that produces a bare 404.
      return fail(
        `that endpoint answered HTTP ${error.status}`,
        "check the URL — the HTTP routes live on the .convex.site deployment, not .convex.cloud",
      );
    }
    return fail(
      `couldn't reach ${url}`,
      error instanceof Error ? error.message : String(error),
    );
  }

  const previous = readConfig();
  writeConfig({ url, token, device, enrolledAt: Date.now() });

  console.log("latch · enrolled");
  field("device", device);
  if (value(flags, "platform")) field("platform", value(flags, "platform") ?? "");
  field("endpoint", url);
  field("token", `…${tokenSuffix(token)}   ${configPath()} (0600)`);
  field(
    "wire",
    wire === 0
      ? "reachable · nothing on it yet"
      : `reachable · ${wire} event${wire === 1 ? "" : "s"}, newest ${newest ? ago(newest) : "recently"}`,
  );
  if (previous) {
    console.log(
      `  replaced  ${previous.device} …${tokenSuffix(previous.token)} (that token is untouched server-side)`,
    );
  }
  console.log("next: latch status · latch listen");
  return 0;
}

async function status(flags: Flags): Promise<number> {
  const config = readConfig();
  if (!config) {
    return fail(
      "this device isn't enrolled",
      "get a code at /devices, then run: latch enroll CODE",
    );
  }

  const url = value(flags, "url")?.replace(/\/+$/, "") ?? config.url;
  console.log("latch · status");
  field("device", config.device);
  field("endpoint", url);
  field("token", `…${tokenSuffix(config.token)}   ${configPath()}`);
  field("verbs", "observe — read the wire, write text, nothing else");

  try {
    const result = await poll(url, config.token, 0);
    field("auth", "ok");
    const newest =
      result.events.length > 0
        ? result.events[result.events.length - 1].createdAt
        : undefined;
    field(
      "wire",
      result.events.length === 0
        ? "empty — nothing published yet"
        : `${result.events.length} event${result.events.length === 1 ? "" : "s"}, newest ${newest ? ago(newest) : "recently"}`,
    );
    return 0;
  } catch (error) {
    if (error instanceof LatchError && error.status === 401) {
      field("auth", "revoked, or the wrong deployment");
      return fail(
        "token rejected",
        "get a fresh code at /devices and run: latch enroll CODE",
      );
    }
    field("auth", "unknown");
    return fail(
      "unreachable",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function listen(flags: Flags): Promise<number> {
  const config = readConfig();
  if (!config) {
    return fail(
      "this device isn't enrolled",
      "get a code at /devices, then run: latch enroll CODE",
    );
  }

  const url = value(flags, "url")?.replace(/\/+$/, "") ?? config.url;
  // Bound outside the closures below: `stop` is a hoisted function declaration,
  // so it cannot rely on `config` still being narrowed inside its body.
  const token = config.token;
  const device = config.device;
  const once = flags.has("once");
  const intervalFlag = Number(value(flags, "interval") ?? "2");
  const intervalMs =
    Number.isFinite(intervalFlag) && intervalFlag >= 0.5
      ? intervalFlag * 1000
      : 2000;

  /** `from` is capped at 32 chars server-side; leave room for the prefix. */
  const from = `latch:${device.replace(/[^\w.:_-]/g, "").slice(0, 24)}`;

  console.log("latch · listen");
  field("device", device);
  field("endpoint", url);
  field("verbs", "observe — printing what arrives, typing nothing");
  if (!once) {
    field("every", `${intervalMs / 1000}s · ctrl-c to stop`);
  }
  console.log("");

  // Captured *before* announcing, not after. The envelope is stamped the
  // instant it lands, so a cursor taken afterwards would swallow it — and in
  // `--once` mode that would mean the one event proving the whole pipe worked
  // is the one event never printed.
  let cursor = Date.now();

  try {
    await publish(url, token, {
      from,
      kind: "device.online",
      body: `${device} listening · ${process.platform} ${process.arch}`,
    });
  } catch (error) {
    if (error instanceof LatchError && error.status === 401) {
      return fail(
        "token rejected",
        "get a fresh code at /devices and run: latch enroll CODE",
      );
    }
    console.error(
      `  ! couldn't announce: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let stopping = false;
  let seen = 0;

  async function stop(reason: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    try {
      await publish(url, token, {
        from,
        kind: "device.offline",
        body: `${device} went quiet after ${seen} event${seen === 1 ? "" : "s"} (${reason})`,
      });
    } catch {
      // going offline is best effort; a dead network is one of the reasons to
      // be going offline in the first place
    }
    console.log("");
    console.log(`off. ${seen} event${seen === 1 ? "" : "s"} seen.`);
    process.exit(0);
  }

  if (!once) {
    process.on("SIGINT", () => void stop("interrupted"));
    process.on("SIGTERM", () => void stop("terminated"));
  }

  // Everything before the cursor is history; `listen` reports the live wire,
  // not a replay.
  let failures = 0;

  for (;;) {
    try {
      const result = await poll(url, token, cursor);
      failures = 0;
      for (const event of result.events) {
        render(event);
        seen += 1;
      }
      cursor = Math.max(cursor, result.cursor);
    } catch (error) {
      if (error instanceof LatchError && error.status === 401) {
        return fail(
          "token rejected",
          "get a fresh code at /devices and run: latch enroll CODE",
        );
      }
      failures += 1;
      if (failures === 1) {
        console.error(
          `  ! ${error instanceof Error ? error.message : String(error)} — retrying`,
        );
      }
      if (failures >= 5) {
        return fail("gave up after five failed polls", "check the network and rerun");
      }
    }

    if (once) {
      console.log(`one pass. ${seen} event${seen === 1 ? "" : "s"} seen.`);
      return 0;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * The house rule, printed by a machine that may have nothing else left to print
 * it on. Deliberately absent from the help text: it is not a feature, it is the
 * promise the whole tool is built on.
 */
function ghost(): number {
  console.log("latch · ghost");
  console.log("");
  console.log("   .--------------------------.");
  console.log("   |                          |");
  console.log("   |           ______         |");
  console.log("   |                          |");
  console.log("   `--------------------------'");
  console.log("");
  console.log("   the screen is dead. the wire is not.");
  console.log("");
  console.log("   observe only: this machine can read the wire and write text to it,");
  console.log("   and nothing else. it cannot type, click, or run anything, including");
  console.log("   itself. that is the promise, not a gap.");
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const { flags, rest } = parseArgs(argv);
  const command = rest[0] ?? "help";

  if (flags.has("help") || command === "help" || command === "--help") {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "enroll":
      return enroll(flags, rest[1]);
    case "status":
      return status(flags);
    case "listen":
      return listen(flags);
    case "ghost":
      return ghost();
    default:
      console.error(`latch: unknown command "${command}"`);
      console.log(HELP);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(
      `latch: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
