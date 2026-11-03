import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, KeyRound, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";

/**
 * The human end of the turd-merger wire.
 *
 * Mint a token, paste two curl commands into whatever agent is on the other side
 * (a Gemini CLI, a script, a cron job) and the log below fills in reactively.
 * No env vars, no OAuth dance: the token is the capability, and rotating it
 * kills every copy at once.
 */
export function BusPanel() {
  const token = useQuery(api.bus.myToken);
  const feed = useQuery(api.bus.feed);
  const issueToken = useMutation(api.bus.issueToken);
  const rotateToken = useMutation(api.bus.rotateToken);
  const post = useMutation(api.bus.post);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const siteUrl = String(import.meta.env.VITE_CONVEX_URL ?? "").replace(
    ".convex.cloud",
    ".convex.site",
  );

  const publishCurl = [
    `curl -s -X POST "${siteUrl}/bus/publish" \\`,
    `  -H "Authorization: Bearer ${token ?? "TOKEN"}" \\`,
    `  -H "content-type: application/json" \\`,
    `  -d '{"from":"gemini","kind":"note","body":"hello from the CLI"}'`,
  ].join("\n");

  const pollCurl = [
    `curl -s "${siteUrl}/bus/poll?after=0" \\`,
    `  -H "Authorization: Bearer ${token ?? "TOKEN"}"`,
  ].join("\n");

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast.error("Copy blocked — select the text instead");
    }
  }

  async function open() {
    setBusy(true);
    try {
      await issueToken({});
      toast("Bus open. Token minted.");
    } catch {
      toast.error("Couldn't open the bus");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    setBusy(true);
    try {
      await rotateToken({});
      toast("Rotated. Every old token is dead.");
    } catch {
      toast.error("Couldn't rotate");
    } finally {
      setBusy(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) return;
    try {
      await post({ from: "human", kind: "note", body });
      setDraft("");
    } catch {
      toast.error("Couldn't send that");
    }
  }

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="tracking-tight font-bold">Bus</h2>
        {token ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void rotate()}
            disabled={busy}
            className="cursor-pointer gap-1.5 text-xs"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Rotate
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        An append-only log your other agents can write to over HTTP. Two curl
        commands, no shared secret: the token is a capability, and rotating it
        kills every copy at once.
      </p>

      {token === undefined ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading bus…
        </p>
      ) : token === null ? (
        <Button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          className="mt-3 cursor-pointer gap-2"
        >
          <KeyRound className="size-4" aria-hidden="true" />
          {busy ? "Opening…" : "Open the bus"}
        </Button>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
              {token}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void copy(token, "Token")}
              className="cursor-pointer shrink-0"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Copy token</span>
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Anyone holding this can write to the log. Rotate if it gets loose.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Agent → us
              </p>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-5 text-foreground">
                {publishCurl}
              </pre>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copy(publishCurl, "Publish command")}
                className="mt-1 cursor-pointer gap-1.5 text-xs"
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copy publish
              </Button>
            </div>

            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Us → agent
              </p>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-5 text-foreground">
                {pollCurl}
              </pre>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copy(pollCurl, "Poll command")}
                className="mt-1 cursor-pointer gap-1.5 text-xs"
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copy poll
              </Button>
            </div>
          </div>

          <form onSubmit={(event) => void send(event)} className="mt-4 flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Reply to the agent"
              aria-label="Message to the bus"
              maxLength={4000}
            />
            <Button type="submit" className="cursor-pointer shrink-0 gap-1.5">
              <Send className="size-4" aria-hidden="true" />
              Send
            </Button>
          </form>

          <div
            role="log"
            aria-live="polite"
            aria-label="Bus messages"
            className="mt-4 max-h-72 space-y-2 overflow-y-auto"
          >
            {feed === undefined ? (
              <p className="text-sm text-muted-foreground">Loading log…</p>
            ) : feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing on the wire yet. Paste the publish command into your
                agent and watch this fill in.
              </p>
            ) : (
              feed.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {entry.from} · {entry.kind} ·{" "}
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {entry.body}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
