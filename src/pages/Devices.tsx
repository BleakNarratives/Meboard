import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import { motion } from "framer-motion";
import { Ban, Copy, KeyRound, Loader2, MonitorSmartphone, Terminal } from "lucide-react";
import { toast } from "sonner";

import { AppNav } from "@/components/AppNav";
import { BusPanel } from "@/components/BusPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEndpoint } from "@/hooks/use-endpoint";

/** A clock as an external store: a component may not read the time in render. */
function useClock(intervalMs: number): number {
  return useSyncExternalStore(
    (onTick) => {
      const timer = window.setInterval(onTick, intervalMs);
      return () => window.clearInterval(timer);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0,
  );
}

/**
 * Devices: the machines allowed to speak on the wire.
 *
 * Pairing is the front door. Six characters, typed once on the machine, and
 * the page never has to move a secret through the clipboard — which matters
 * because ChromeOS blocks programmatic clipboard reads inside its Linux
 * container by design, so a clipboard-first flow would fail on the exact
 * device this product exists for.
 *
 * The long-lived token still exists, one level down, for machines where nobody
 * is there to type: a container, a cron job, a build.
 */
const ONLINE_WINDOW_MS = 90_000;

function seenLabel(lastSeen: number | null): string {
  if (lastSeen === null) return "never checked in";
  return `last seen ${formatDistanceToNowStrict(new Date(lastSeen), {
    addSuffix: true,
  })}`;
}

function remaining(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Devices() {
  const devices = useQuery(api.bus.devices);
  const createPairing = useMutation(api.bus.createPairing);
  const mint = useMutation(api.bus.mintDevice);
  const revoke = useMutation(api.bus.revokeDevice);

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{
    code: string;
    name: string;
    expiresAt: number;
  } | null>(null);
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(
    null,
  );
  const { siteUrl, isDefault } = useEndpoint();

  // One second: the pairing code's countdown is the only thing on this page
  // that needs to be finer than half a minute, and it doubles as the "live"
  // comparison for the device list.
  const now = useClock(1000);
  const live = pairing !== null && pairing.expiresAt > now;

  // The deployment is baked into the CLI at build time, so a healthy build
  // needs no URL typed at all — only an override for a second deployment.
  const enrollCommand =
    pairing === null
      ? ""
      : isDefault
        ? `latch enroll ${pairing.code}`
        : `latch enroll ${pairing.code} --url ${siteUrl}`;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast.error("Copy blocked — select the text instead");
    }
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error("Give the device a name");
      return;
    }
    setBusy(true);
    try {
      const created = await createPairing({
        name: trimmed,
        platform: platform.trim().length > 0 ? platform.trim() : undefined,
      });
      setPairing(created);
      setName("");
      setPlatform("");
      toast(`Code for ${created.name}`, {
        description: "Three minutes, one use.",
      });
    } catch (error) {
      toast.error("Couldn't create a code", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function mintToken(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error("Give the device a name");
      return;
    }
    setBusy(true);
    try {
      const created = await mint({
        name: trimmed,
        platform: platform.trim().length > 0 ? platform.trim() : undefined,
      });
      setMinted({ name: created.name, token: created.token });
      setName("");
      setPlatform("");
      toast(`${created.name} enrolled`, {
        description: "Copy the token now — it is not shown again.",
      });
    } catch (error) {
      toast.error("Couldn't enrol that device", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function kill(deviceId: Id<"devices">, deviceName: string) {
    setRevoking(deviceId);
    try {
      await revoke({ deviceId });
      toast(`${deviceName} revoked`, {
        description: "Its token is dead. Every other device still works.",
      });
    } catch {
      toast.error("Couldn't revoke that device");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <AppNav />
      <main className="flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <header className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Latch
            </p>
            <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
              The machines that can speak
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              A pre-installed agent holds one token, polls the bus, and prints
              what arrives. Observe only, in this build — it can read the wire
              and write text to it. It cannot type, click, or run anything.
            </p>
          </header>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-border p-4"
          >
            <div className="flex items-center gap-2">
              <MonitorSmartphone
                className="size-4 text-primary"
                aria-hidden="true"
              />
              <h2 className="tracking-tight font-bold">Pair a device</h2>
            </div>
            <p className="mt-1 mb-3 text-sm leading-6 text-muted-foreground">
              Make a code, then type it on the machine. Six characters from an
              alphabet with no 0/O or 1/I/L in it. Name it something you'll
              recognise on a bad day — duplicate names are refused, because two
              "chromebook"s on a support call is worse than none.
            </p>

            <form
              onSubmit={(event) => void requestCode(event)}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="chromebook"
                aria-label="Device name"
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <Input
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                placeholder="chromeos (optional)"
                aria-label="Platform"
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                className="font-mono sm:max-w-48"
              />
              <Button
                type="submit"
                disabled={busy}
                className="cursor-pointer shrink-0 gap-2"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {busy ? "Making…" : "Get a code"}
              </Button>
            </form>

            {pairing ? (
              <div className="mt-4 space-y-3 rounded-lg border border-border border-l-2 border-l-marker px-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Code for {pairing.name}
                  </p>
                  <p
                    role="status"
                    aria-live="polite"
                    className="font-mono text-xs text-muted-foreground"
                  >
                    {live ? `expires in ${remaining(pairing.expiresAt, now)}` : "expired"}
                  </p>
                </div>

                <p
                  className={
                    live
                      ? "font-mono text-4xl font-bold tracking-[0.35em] text-foreground"
                      : "font-mono text-4xl font-bold tracking-[0.35em] text-muted-foreground/40 line-through"
                  }
                >
                  <span className="sr-only">Pairing code </span>
                  {pairing.code}
                </p>

                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    On that machine
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                      {enrollCommand}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!live}
                      onClick={() => void copy(enrollCommand, "Command")}
                      className="cursor-pointer shrink-0"
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">Copy command</span>
                    </Button>
                  </div>
                  <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <Terminal
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      That is the whole instruction: no URL, no token, nothing
                      to paste. The code is redeemed once and replaced by a
                      device token stored at{" "}
                      <span className="font-mono text-foreground">
                        ~/.latch/config.json
                      </span>{" "}
                      (mode 0600). Needs node 18+ and nothing else.
                    </span>
                  </p>
                </div>
              </div>
            ) : null}
          </motion.section>

          <section className="rounded-xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="tracking-tight font-bold">Enrolled</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {devices === undefined
                  ? "loading"
                  : `${devices.filter((device) => !device.revoked).length} live`}
              </span>
            </div>

            {devices === undefined ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Reading the registry…
              </p>
            ) : devices.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No devices yet. Get a code above, type{" "}
                <span className="font-mono">latch enroll CODE</span> on the
                machine, and it will appear here as soon as it polls.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {devices.map((device) => {
                  const online =
                    !device.revoked &&
                    device.lastSeen !== null &&
                    now > 0 &&
                    now - device.lastSeen < ONLINE_WINDOW_MS;
                  return (
                    <li
                      key={device.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <span
                            aria-hidden="true"
                            className={
                              device.revoked
                                ? "size-2 rounded-full bg-muted-foreground/30"
                                : online
                                  ? "size-2 rounded-full bg-primary"
                                  : "size-2 rounded-full bg-muted-foreground/50"
                            }
                          />
                          <span className="truncate font-mono">
                            {device.name}
                          </span>
                          {device.revoked ? (
                            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                              revoked
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 pl-4 font-mono text-xs text-muted-foreground">
                          {device.platform ?? "platform unknown"} · token …
                          {device.suffix} · {seenLabel(device.lastSeen)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={device.revoked || revoking === device.id}
                        onClick={() => void kill(device.id, device.name)}
                        className="cursor-pointer shrink-0 gap-1.5 text-xs"
                      >
                        {revoking === device.id ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Ban className="size-3.5" aria-hidden="true" />
                        )}
                        {device.revoked ? "Dead" : "Revoke"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              "Live" means the machine polled in the last 90 seconds. A revoked
              row is kept as a receipt — the log still needs to say which
              machine reported something.
            </p>
          </section>

          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer tracking-tight font-bold">
              Long-lived token
            </summary>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              For a machine where nobody is there to type: a container, a cron
              job, a build. Shown once — the only copy worth keeping is the one
              on the device.
            </p>

            <form
              onSubmit={(event) => void mintToken(event)}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="build-runner"
                aria-label="Device name for the token"
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={busy}
                className="cursor-pointer shrink-0 gap-2"
              >
                <KeyRound className="size-4" aria-hidden="true" />
                {busy ? "Minting…" : "Mint token"}
              </Button>
            </form>

            {minted ? (
              <div className="mt-3 space-y-2 rounded-lg border border-border px-3 py-3">
                <p className="text-sm font-medium text-foreground">
                  Token for {minted.name}
                </p>
                <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                    {minted.token}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copy(minted.token, "Token")}
                    className="cursor-pointer shrink-0"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Copy token</span>
                  </Button>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                    latch enroll --clip
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copy("latch enroll --clip", "Command")}
                    className="cursor-pointer shrink-0"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Copy command</span>
                  </Button>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  <span className="font-mono text-foreground">--clip</span> reads
                  the token off the clipboard. <strong>Windows and macOS only.</strong>{" "}
                  ChromeOS blocks programmatic clipboard reads inside its Linux
                  container by design, and Termux needs termux-api in the
                  foreground — on those, paste at the prompt or use a pairing
                  code instead.
                </p>
              </div>
            ) : null}
          </details>

          <BusPanel />
        </div>
      </main>
    </div>
  );
}
