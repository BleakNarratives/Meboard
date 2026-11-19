import { spawnSync } from "node:child_process";

/**
 * Read the system clipboard without adding a dependency.
 *
 * Every desktop and phone Linux already has *something* that can put the
 * clipboard on stdout; the work is knowing which. This tries the readers in
 * order of preference and takes the first that answers, so the caller does not
 * have to care whether it is Wayland, X11, Termux, macOS, or Windows.
 *
 * The result is untrusted: it is whatever the user last copied, which may be a
 * password, a credit card, or half a URL. `enroll` validates the shape before
 * using it, and nothing here echoes it back to the terminal.
 */
interface Reader {
  command: string;
  args: string[];
}

export interface ClipboardResult {
  text: string;
  /** Which reader worked, so a failure report can name it. */
  via: string;
}

function isTermux(): boolean {
  return (process.env.PREFIX ?? "").toLowerCase().includes("termux");
}

function candidates(): Reader[] {
  if (process.platform === "win32") {
    const command = ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"];
    return [
      { command: "powershell", args: command },
      { command: "pwsh", args: command },
    ];
  }

  if (process.platform === "darwin") {
    return [{ command: "pbpaste", args: [] }];
  }

  const readers: Reader[] = [];
  // Termux has no X server; the API app is the only reader.
  if (isTermux()) readers.push({ command: "termux-clipboard-get", args: [] });
  readers.push(
    { command: "wl-paste", args: ["--no-newline"] },
    { command: "xclip", args: ["-selection", "clipboard", "-o"] },
    { command: "xsel", args: ["--clipboard", "--output"] },
  );
  // Crostini is plain Debian and Termux is detectable, but a Linux container
  // sometimes has the Termux binary on PATH via a mounted prefix. Try it last
  // rather than not at all.
  if (!isTermux()) readers.push({ command: "termux-clipboard-get", args: [] });
  return readers;
}

export function readClipboard(): ClipboardResult | null {
  for (const reader of candidates()) {
    const result = spawnSync(reader.command, reader.args, {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
      // stdin and stderr stay untouched: a reader that needs a terminal should
      // fail quietly, not paint the screen.
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.error) continue;
    if (result.status !== 0) continue;
    const text = (result.stdout ?? "").trim();
    if (text.length > 0) {
      return { text, via: [reader.command, ...reader.args].join(" ") };
    }
  }
  return null;
}
