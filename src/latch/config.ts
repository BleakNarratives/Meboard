import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

/**
 * Where an enrolled device keeps its one secret.
 *
 * `~/.latch/config.json`, mode 0600. Not an env file, not a checked-in `.env`:
 * a device token is a bearer credential for a machine, and the machine it
 * belongs to is the only place it should live. LATCH_URL and LATCH_TOKEN exist
 * for a container that has no home directory, and are read at enrol time only.
 */
const DIR = join(homedir(), ".latch");
const FILE = join(DIR, "config.json");

/**
 * Replaced at build time by `scripts/build-latch.ts` with this deployment's
 * `.convex.site` origin. It is not a secret — it ships in every client bundle
 * already — and baking it is what makes `latch enroll 4K7Q2M` the whole
 * instruction instead of "…and also pass a URL you have to go find".
 *
 * `typeof` on an identifier a bundler did not replace is safe and yields
 * "undefined", so running straight from source simply skips this.
 */
declare const __LATCH_DEFAULT_URL__: string | undefined;

/**
 * A sidecar app can keep its own namespace: GRIMOIRE should not have to share a
 * config file with Meboard just because both speak the same bus.
 */
function configFile(): string {
  const override = process.env.LATCH_CONFIG;
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  return FILE;
}

export interface LatchConfig {
  /** Base URL of the Convex site deployment, no trailing slash. */
  url: string;
  token: string;
  /** The name shown on /devices. Cosmetic, but it is how a human tells them apart. */
  device: string;
  enrolledAt: number;
}

export function configPath(): string {
  return configFile();
}

export function readConfig(): LatchConfig | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configFile(), "utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Partial<LatchConfig>;
  if (typeof data.url !== "string" || typeof data.token !== "string") return null;
  if (typeof data.device !== "string") return null;
  return {
    url: data.url.replace(/\/+$/, ""),
    token: data.token,
    device: data.device,
    enrolledAt: typeof data.enrolledAt === "number" ? data.enrolledAt : 0,
  };
}

export function writeConfig(config: LatchConfig): void {
  const file = configFile();
  // An env override may point at a path in a directory that does not exist.
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
  // `mode` only applies when the file is created, so chmod unconditionally:
  // re-enrolling must not leave a 0644 token behind from the first write.
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** Everything printed about a token is the tail and nothing else. */
export function tokenSuffix(token: string): string {
  return token.slice(-6);
}

/**
 * The endpoint a token works against.
 *
 * Convex serves HTTP routes from `.convex.site`, not `.cloud` — the app's
 * `VITE_CONVEX_URL` points at the latter, so the swap is the whole mapping and
 * getting it wrong is a 404 that looks like a dead token.
 */
export function resolveUrl(override?: string): string | null {
  const explicit = override ?? process.env.LATCH_URL;
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.trim().replace(/\/+$/, "");
  }
  // Baked at build time: the normal path, with nothing to type.
  if (
    typeof __LATCH_DEFAULT_URL__ === "string" &&
    __LATCH_DEFAULT_URL__.length > 0
  ) {
    return __LATCH_DEFAULT_URL__.replace(/\/+$/, "");
  }
  const convex = process.env.VITE_CONVEX_URL;
  if (typeof convex === "string" && convex.trim().length > 0) {
    return convex
      .trim()
      .replace(".convex.cloud", ".convex.site")
      .replace(/\/+$/, "");
  }
  return null;
}

/** Hostname is a decent default label and needs no interaction. */
export function defaultDeviceName(): string {
  const raw = process.env.LATCH_NAME ?? hostname() ?? "device";
  const cleaned = raw
    .replace(/[^\w.:_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 32);
  return cleaned.length > 0 ? cleaned : "device";
}
