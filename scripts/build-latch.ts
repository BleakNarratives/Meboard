/**
 * Bundle the CLI into one dependency-free file.
 *
 * The point of the output is that it has no point of origin: `dist-latch/latch.mjs`
 * is a single ES module that runs on any Node 18+ install, which is what makes
 * PowerShell, cmd, Crostini and Termux the same problem instead of four.
 *
 * `bun run latch:build`
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Outside `dist/` on purpose: vite owns that directory and empties it on every
// build, which would delete the CLI a user had just installed from it.
const OUT_DIR = "dist-latch";
const OUT_FILE = `${OUT_DIR}/latch.mjs`;
const SHEBANG = "#!/usr/bin/env node\n";

mkdirSync(OUT_DIR, { recursive: true });

/**
 * Bake this deployment's HTTP origin into the bundle.
 *
 * Not a secret — it is in every client bundle already — and it is what lets
 * `latch enroll 4K7Q2M` be the whole instruction. A build without the env var
 * still produces a working binary; it just needs `--url` to enrol.
 */
const siteUrl = String(process.env.VITE_CONVEX_URL ?? "")
  .replace(".convex.cloud", ".convex.site")
  .replace(/\/+$/, "");

const result = await Bun.build({
  entrypoints: ["src/latch/cli.ts"],
  target: "node",
  format: "esm",
  outdir: OUT_DIR,
  naming: "latch.mjs",
  minify: false,
  define: {
    __LATCH_DEFAULT_URL__: JSON.stringify(siteUrl),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Bun emits plain JS; the shebang is prepended here rather than trusted to a
// build flag, so `chmod +x` on a POSIX box gives a runnable file with no shim.
const code = readFileSync(OUT_FILE, "utf8");
if (!code.startsWith("#!")) writeFileSync(OUT_FILE, SHEBANG + code);
chmodSync(OUT_FILE, 0o755);

const size = Math.round(readFileSync(OUT_FILE).byteLength / 1024);
console.log(`built ${OUT_FILE} — ${size} kB, no dependencies, node 18+`);
console.log(
  siteUrl.length > 0
    ? `endpoint baked in: ${siteUrl}`
    : "no VITE_CONVEX_URL at build time — the bundle needs --url to enrol",
);
console.log("install: scripts/install-latch.sh (posix) or scripts/install-latch.ps1 (windows)");
