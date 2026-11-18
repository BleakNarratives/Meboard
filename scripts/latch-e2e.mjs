#!/usr/bin/env node
/**
 * End-to-end test for the latch CLI.
 *
 * Everything here talks to a stub of the Convex HTTP routes over a real socket,
 * because the thing worth testing is not "does the function return the right
 * object" — it is "does a device actually get enrolled, and does it refuse to
 * be enrolled by the wrong thing".
 *
 * The server lives in this process, so every CLI run is spawned ASYNCHRONOUSLY.
 * `spawnSync` would block the event loop and the stub could never answer.
 *
 *   bun run latch:test
 *
 * Requires `dist-latch/latch.mjs`; the npm script builds it first.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// `LATCH_CLI` exists so the suite can be pointed at a deliberately broken build
// to prove it fails loudly instead of quietly passing.
const CLI =
  process.env.LATCH_CLI ??
  fileURLToPath(new URL("../dist-latch/latch.mjs", import.meta.url));
const GOOD_TOKEN = "a".repeat(48);
const BAD_TOKEN = "b".repeat(48);
const GOOD_CODE = "4K7Q2M";
const RUN_TIMEOUT_MS = 20_000;

if (!existsSync(CLI)) {
  console.error(`latch e2e: ${CLI} is missing — run \`bun run latch:build\` first`);
  process.exit(1);
}

const events = [];
let nextId = 1;

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const url = new URL(req.url ?? "/", "http://stub");

  // Pairing carries its own credential, so it is checked before the bearer.
  if (req.method === "POST" && url.pathname === "/latch/pair") {
    const body = await readJson(req);
    if (String(body.code ?? "").toUpperCase() !== GOOD_CODE) {
      return json(401, {
        error: "that code isn't live — codes last three minutes and work once",
      });
    }
    return json(200, {
      token: GOOD_TOKEN,
      device: "chromebook",
      deviceId: "dev_1",
    });
  }

  if (req.headers.authorization !== `Bearer ${GOOD_TOKEN}`) {
    return json(401, { error: "missing or revoked token" });
  }

  if (req.method === "POST" && url.pathname === "/bus/publish") {
    const body = await readJson(req);
    events.push({
      id: String(nextId++),
      from: String(body.from ?? ""),
      kind: String(body.kind ?? ""),
      body: String(body.body ?? ""),
      createdAt: Date.now(),
    });
    return json(200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/bus/poll") {
    const after = Number(url.searchParams.get("after") ?? 0);
    const fresh = events.filter((event) => event.createdAt > after);
    return json(200, {
      events: fresh,
      cursor: fresh.length > 0 ? fresh[fresh.length - 1].createdAt : after,
    });
  }

  return json(404, { error: "not found" });
});

const workdir = mkdtempSync(join(tmpdir(), "latch-e2e-"));
const configPath = join(workdir, "config.json");

const results = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
}

/** Spawn the CLI with a clean environment and no inherited credentials. */
function run(args, extraEnv = {}) {
  const env = { ...process.env };
  delete env.LATCH_URL;
  delete env.LATCH_TOKEN;
  delete env.LATCH_NAME;
  env.LATCH_CONFIG = configPath;
  Object.assign(env, extraEnv);

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [CLI, ...args], {
      env,
      // stdin is /dev/null so a prompt can never hang the suite
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => child.kill("SIGKILL"), RUN_TIMEOUT_MS);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, ms: Date.now() - started });
    });
  });
}

function removeConfig() {
  rmSync(configPath, { force: true });
}

function configMode() {
  return statSync(configPath).mode & 0o777;
}

/** First line of stderr plus any detail worth seeing, trimmed for reports. */
function firstLine(text) {
  return text.trim().split("\n")[0] ?? "";
}

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // 1. A good code enrols, verifies, and writes a private config.
  removeConfig();
  const paired = await run(["enroll", GOOD_CODE, "--url", base]);
  check(
    "enroll with a pairing code exits 0",
    paired.status === 0,
    `exit ${paired.status}; ${firstLine(paired.stderr)}`,
  );
  check(
    "enroll writes the config file",
    existsSync(configPath),
    "no config was written",
  );
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    check(
      "config carries the paired device and token",
      config.device === "chromebook" && config.token === GOOD_TOKEN,
      `device=${config.device} token=${String(config.token).slice(0, 6)}…`,
    );
    if (process.platform === "win32") {
      check("config is 0600", true, "skipped on windows: no POSIX mode");
    } else {
      check("config is 0600", configMode() === 0o600, `mode ${configMode().toString(8)}`);
    }
  }

  // 2. Status reads back through the token.
  const status = await run(["status"]);
  check(
    "status exits 0 and reports auth ok",
    status.status === 0 && /auth\s+ok/.test(status.stdout),
    `exit ${status.status}; ${firstLine(status.stderr)}`,
  );

  // 3. Listen prints the envelope it published — the round trip.
  const listen = await run(["listen", "--once"]);
  check(
    "listen --once sees its own device.online",
    listen.status === 0 && listen.stdout.includes("device.online"),
    `exit ${listen.status}; stdout had ${listen.stdout.trim().split("\n").length} lines`,
  );
  check(
    "listen --once counts exactly one event",
    /one pass\. 1 event\b/.test(listen.stdout),
    `expected "one pass. 1 event", got "${(listen.stdout.match(/one pass\..*/) ?? [""])[0]}"`,
  );

  // 4. A dead code refuses, and leaves no half-enrolment behind.
  removeConfig();
  const dead = await run(["enroll", "ZZZZZZ", "--url", base]);
  check(
    "a dead code exits 1",
    dead.status === 1,
    `exit ${dead.status}`,
  );
  check(
    "a dead code writes nothing",
    !existsSync(configPath),
    "a config file was created despite the failure",
  );
  check(
    "a dead code says why",
    /isn't live/.test(dead.stderr),
    firstLine(dead.stderr) || "no stderr",
  );

  // 5. Garbage is rejected before any network call.
  removeConfig();
  const garbage = await run(["enroll", "not-a-code", "--url", base]);
  check(
    "garbage is rejected as a malformed code",
    garbage.status === 1 && /isn't a pairing code/.test(garbage.stderr),
    firstLine(garbage.stderr) || "no stderr",
  );
  check(
    "garbage writes nothing",
    !existsSync(configPath),
    "a config file was created despite the failure",
  );

  // 6. A rejected token stops instead of polling forever.
  writeFileSync(
    configPath,
    `${JSON.stringify({ url: base, token: BAD_TOKEN, device: "wrong", enrolledAt: Date.now() }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const rejected = await run(["status"]);
  check(
    "a revoked token exits 1",
    rejected.status === 1 && /token rejected/.test(rejected.stderr),
    firstLine(rejected.stderr) || "no stderr",
  );
  const giveUp = await run(["listen"]);
  check(
    "listen gives up on a rejected token instead of retrying",
    giveUp.status === 1 && giveUp.ms < 10_000 && /token rejected/.test(giveUp.stderr),
    `exit ${giveUp.status} after ${giveUp.ms}ms`,
  );

  // 7. The long-lived token path still works, for machines nobody types on.
  removeConfig();
  const legacy = await run(["enroll", "--url", base], { LATCH_TOKEN: GOOD_TOKEN });
  check(
    "enroll accepts a device token from the environment",
    legacy.status === 0 && existsSync(configPath),
    `exit ${legacy.status}; ${firstLine(legacy.stderr)}`,
  );
}

main()
  .catch((error) => {
    check("suite ran to completion", false, error instanceof Error ? error.message : String(error));
  })
  .finally(() => {
    server.close();
    rmSync(workdir, { recursive: true, force: true });

    const failed = results.filter((result) => !result.ok);
    for (const result of results) {
      if (result.ok) continue;
      console.error(`FAIL  ${result.name}`);
      if (result.detail) console.error(`      ${result.detail}`);
    }

    if (failed.length > 0) {
      console.error(`latch e2e: ${failed.length} of ${results.length} checks failed`);
      process.exitCode = 1;
      return;
    }
    console.log(`latch e2e: ${results.length} checks passed`);
    process.exitCode = 0;
  });
