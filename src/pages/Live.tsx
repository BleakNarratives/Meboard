import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  Loader2,
  MonitorUp,
  Radio,
  Send,
  Square,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Role = "host" | "viewer";
type LogEntry = { id: string; mine: boolean; body: string };
type Ping = { x: number; y: number; key: number };

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function reasonOf(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return fallback;
}

/**
 * Gather every ice candidate before handing the description to the other side.
 * Trickle ice would be faster, but a single self-contained description keeps the
 * handshake to two messages and removes all ordering bugs.
 */
function waitForCandidates(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const finish = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", finish);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", finish);
    window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", finish);
      resolve();
    }, 2500);
  });
}

export default function Live() {
  const createRoom = useMutation(api.live.createRoom);
  const joinRoom = useMutation(api.live.joinRoom);
  const postSignal = useMutation(api.live.postSignal);
  const endRoom = useMutation(api.live.endRoom);

  const [role, setRole] = useState<Role | null>(null);
  const [roomId, setRoomId] = useState<Id<"rooms"> | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState("");
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [channelOpen, setChannelOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState<Ping | null>(null);
  const [copied, setCopied] = useState(false);

  const room = useQuery(api.live.roomState, roomId ? { roomId } : "skip");
  const messages = useQuery(api.live.signals, roomId ? { roomId } : "skip");

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const handled = useRef<Set<string>>(new Set());
  const screenRef = useRef<MediaStream | null>(null);
  const roomRef = useRef<Id<"rooms"> | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (localVideo.current && screen) localVideo.current.srcObject = screen;
  }, [screen]);

  useEffect(() => {
    if (remoteVideo.current && remote) remoteVideo.current.srcObject = remote;
  }, [remote]);

  const adoptChannel = useCallback((dataChannel: RTCDataChannel) => {
    channel.current = dataChannel;
    dataChannel.onopen = () => setChannelOpen(true);
    dataChannel.onclose = () => setChannelOpen(false);
    dataChannel.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          t?: string;
          body?: string;
          x?: number;
          y?: number;
        };
        if (payload.t === "text" && typeof payload.body === "string") {
          const body = payload.body;
          setLog((prev) => [...prev, { id: uid(), mine: false, body }]);
        }
        if (
          payload.t === "ping" &&
          typeof payload.x === "number" &&
          typeof payload.y === "number"
        ) {
          setPing({ x: payload.x, y: payload.y, key: Date.now() });
        }
      } catch {
        // ignore frames we didn't write
      }
    };
  }, []);

  const watchPeer = useCallback((pc: RTCPeerConnection) => {
    pc.onconnectionstatechange = () => {
      setConnected(pc.connectionState === "connected");
      if (pc.connectionState === "failed") {
        toast.error("The two devices couldn't reach each other", {
          description:
            "Same Wi-Fi usually just works. Across different networks this needs a TURN relay.",
        });
      }
    };
  }, []);

  const connectToViewer = useCallback(
    async (id: Id<"rooms">, stream: MediaStream) => {
      peer.current?.close();
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peer.current = pc;
      watchPeer(pc);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      adoptChannel(pc.createDataChannel("meboard"));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForCandidates(pc);
      if (!pc.localDescription) return;
      await postSignal({
        roomId: id,
        kind: "offer",
        payload: JSON.stringify(pc.localDescription),
      });
    },
    [adoptChannel, postSignal, watchPeer],
  );

  const answerOffer = useCallback(
    async (id: Id<"rooms">, payload: string) => {
      peer.current?.close();
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peer.current = pc;
      watchPeer(pc);
      pc.ontrack = (event) => setRemote(event.streams[0] ?? null);
      pc.ondatachannel = (event) => adoptChannel(event.channel);

      await pc.setRemoteDescription(
        JSON.parse(payload) as RTCSessionDescriptionInit,
      );
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForCandidates(pc);
      if (!pc.localDescription) return;
      await postSignal({
        roomId: id,
        kind: "answer",
        payload: JSON.stringify(pc.localDescription),
      });
    },
    [adoptChannel, postSignal, watchPeer],
  );

  const teardown = useCallback(
    async (closeBoard: boolean) => {
      channel.current?.close();
      channel.current = null;
      peer.current?.close();
      peer.current = null;
      screenRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current = null;

      const previous = roomRef.current;
      roomRef.current = null;
      handled.current = new Set();
      tokenRef.current = null;

      setScreen(null);
      setRemote(null);
      setConnected(false);
      setChannelOpen(false);
      setLog([]);
      setRole(null);
      setRoomId(null);
      setCopied(false);
      setPing(null);

      if (closeBoard && previous) {
        try {
          await endRoom({ roomId: previous });
        } catch {
          // the board may already be gone
        }
      }
    },
    [endRoom],
  );

  // the host offers once per join, so a reloaded viewer always gets a fresh handshake
  useEffect(() => {
    if (role !== "host" || !roomId || !screenRef.current) return;
    const token = room?.viewerToken ?? null;
    if (!token || token === tokenRef.current) return;
    tokenRef.current = token;
    void connectToViewer(roomId, screenRef.current).catch((error: unknown) => {
      console.error(error);
      toast.error("Couldn't connect to the viewer");
    });
  }, [role, roomId, room?.viewerToken, connectToViewer]);

  // both sides react to the sdp messages the other one publishes
  useEffect(() => {
    if (!role || !roomId || !messages || messages.length === 0) return;
    const fresh = messages.filter(
      (message) => message.from !== role && !handled.current.has(message.id),
    );
    if (fresh.length === 0) return;
    fresh.forEach((message) => handled.current.add(message.id));

    void (async () => {
      for (const message of fresh) {
        try {
          if (role === "viewer" && message.kind === "offer") {
            await answerOffer(roomId, message.payload);
          } else if (role === "host" && message.kind === "answer") {
            const pc = peer.current;
            if (!pc || pc.signalingState !== "have-local-offer") continue;
            await pc.setRemoteDescription(
              JSON.parse(message.payload) as RTCSessionDescriptionInit,
            );
          }
        } catch (error) {
          console.error(error);
          toast.error("The handshake failed", {
            description: "Stop and start the share again to retry.",
          });
        }
      }
    })();
  }, [messages, role, roomId, answerOffer]);

  useEffect(() => {
    return () => {
      channel.current?.close();
      peer.current?.close();
      screenRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startHosting = async () => {
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        toast.error("This browser can't capture a screen");
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 20 },
        audio: false,
      });
      screenRef.current = stream;
      setScreen(stream);
      setRole("host");
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void teardown(true);
        toast("Screen sharing stopped");
      });

      const created = await createRoom({});
      roomRef.current = created.roomId;
      setRoomId(created.roomId);
      setCode(created.code);
    } catch (error) {
      console.error(error);
      const blocked =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      toast.error(blocked ? "Screen capture was blocked" : "Couldn't start", {
        description: blocked
          ? "If Meboard is running inside an embedded preview, open it in its own tab and try again."
          : "Give it another try.",
      });
      setRole(null);
      setScreen(null);
    } finally {
      setStarting(false);
    }
  };

  const startViewing = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = codeInput.trim().toUpperCase();
    if (cleaned.length < 4) {
      toast.error("Enter the code shown on the other device");
      return;
    }
    setJoining(true);
    try {
      const joined = await joinRoom({ code: cleaned });
      roomRef.current = joined.roomId;
      setRoomId(joined.roomId);
      setCode(cleaned);
      setRole("viewer");
    } catch (error) {
      toast.error("Couldn't join that board", {
        description: reasonOf(error, "Check the code and try again."),
      });
    } finally {
      setJoining(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast("Code copied");
    } catch {
      toast("Couldn't copy — read the code out instead");
    }
  };

  const sendText = () => {
    const dataChannel = channel.current;
    const body = draft.trim();
    if (!dataChannel || dataChannel.readyState !== "open" || body === "")
      return;
    dataChannel.send(JSON.stringify({ t: "text", body }));
    setLog((prev) => [...prev, { id: uid(), mine: true, body }]);
    setDraft("");
  };

  const sendPing = (event: React.MouseEvent<HTMLVideoElement>) => {
    const dataChannel = channel.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;
    const rect = event.currentTarget.getBoundingClientRect();
    dataChannel.send(
      JSON.stringify({
        t: "ping",
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      }),
    );
  };

  const statusLabel = (() => {
    if (connected) {
      return role === "host"
        ? `Live with ${room?.viewerName ?? "the viewer"}`
        : `Watching ${room?.hostName ?? "the other device"}`;
    }
    if (role === "host") {
      return room?.viewerAttached
        ? "Viewer attached — connecting…"
        : "Waiting for someone to enter the code";
    }
    return "Waiting for the other device to answer…";
  })();

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <AppNav />
      <main className="flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <header className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Live board
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Put this screen on that screen
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              One device captures its own screen and streams it peer to peer.
              Sign in on both with the same account, start a share on the
              broken one, enter the code here. The text channel underneath is
              plain, selectable text — screen readers read it properly.
            </p>
          </header>

          {role === null ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="rounded-xl border border-border p-5">
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MonitorUp className="size-5" />
                </div>
                <h2 className="tracking-tight font-bold">Share this screen</h2>
                <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">
                  Run this on the device whose screen you want the other one to
                  see. Pick the entire screen when the browser asks.
                </p>
                <Button
                  type="button"
                  onClick={() => void startHosting()}
                  disabled={starting}
                  className="w-full cursor-pointer gap-2"
                >
                  {starting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MonitorUp className="size-4" />
                  )}
                  {starting ? "Starting…" : "Share my screen"}
                </Button>
              </div>

              <div className="rounded-xl border border-border p-5">
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Radio className="size-5" />
                </div>
                <h2 className="tracking-tight font-bold">Watch a screen</h2>
                <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">
                  Enter the six-character code the other device is showing.
                </p>
                <form onSubmit={startViewing} className="flex gap-2">
                  <Input
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value)}
                    placeholder="ABC123"
                    aria-label="Join code"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono uppercase tracking-[0.2em]"
                  />
                  <Button
                    type="submit"
                    disabled={joining}
                    className="cursor-pointer gap-2"
                  >
                    {joining ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Watch
                  </Button>
                </form>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2.5 rounded-full ${
                      connected
                        ? "bg-primary"
                        : "animate-pulse bg-muted-foreground/50"
                    }`}
                  />
                  <span
                    aria-live="polite"
                    className="text-sm font-medium text-foreground"
                  >
                    {statusLabel}
                  </span>
                  {!connected ? (
                    <WifiOff className="size-3.5 text-muted-foreground" />
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void teardown(role === "host")}
                  className="cursor-pointer gap-2"
                >
                  <Square className="size-3.5" />
                  Stop
                </Button>
              </div>

              {role === "host" ? (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
                    <video
                      ref={localVideo}
                      autoPlay
                      muted
                      playsInline
                      className="aspect-video w-full bg-black object-contain"
                    />
                    {ping ? (
                      <motion.span
                        key={ping.key}
                        initial={{ scale: 0.4, opacity: 0.9 }}
                        animate={{ scale: 1.8, opacity: 0 }}
                        transition={{ duration: 1.3 }}
                        onAnimationComplete={() => setPing(null)}
                        style={{
                          left: `${ping.x * 100}%`,
                          top: `${ping.y * 100}%`,
                        }}
                        className="pointer-events-none absolute size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-marker"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Join code
                      </p>
                      <p className="font-mono text-2xl font-bold tracking-[0.3em] text-foreground">
                        {code}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void copyCode()}
                      className="cursor-pointer gap-2"
                    >
                      {copied ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      {copied ? "Copied" : "Copy code"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-xl border border-border bg-black">
                    <video
                      ref={remoteVideo}
                      autoPlay
                      playsInline
                      controls
                      onClick={sendPing}
                      className="aspect-video w-full object-contain"
                    >
                      <track kind="captions" />
                    </video>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tap the video to drop a marker on the host's screen — handy
                    for saying &ldquo;click right there&rdquo;. Position is
                    approximate. There is no cursor control: browsers cannot
                    drive another machine's pointer.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="tracking-tight font-bold">
                    Pass text between devices
                  </h2>
                  <span className="font-mono text-xs text-muted-foreground">
                    {channelOpen
                      ? "channel open"
                      : connected
                        ? "opening…"
                        : "opens on connect"}
                  </span>
                </div>

                <div
                  role="log"
                  aria-live="polite"
                  aria-label="Shared text"
                  className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3"
                >
                  {log.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing yet. Paste a support code, a command, or the
                      terminal output you can't read over there.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {log.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-start justify-between gap-3 rounded-md bg-background px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                              {entry.mine ? "you" : "other device"}
                            </p>
                            <p className="whitespace-pre-wrap break-words font-mono text-sm text-foreground">
                              {entry.body}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void navigator.clipboard
                                .writeText(entry.body)
                                .then(() => toast("Copied"))
                                .catch(() => toast("Copy blocked by browser"));
                            }}
                            className="cursor-pointer shrink-0 gap-1"
                          >
                            <Copy className="size-3.5" />
                            <span className="sr-only">Copy this text</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      sendText();
                    }
                  }}
                  placeholder="Type or paste text to send…"
                  aria-label="Text to send"
                  disabled={!channelOpen}
                  className="mb-2 min-h-24 font-mono text-sm"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    Ctrl+Enter to send
                  </span>
                  <Button
                    type="button"
                    onClick={sendText}
                    disabled={!channelOpen || draft.trim() === ""}
                    className="cursor-pointer gap-2"
                  >
                    <Send className="size-4" />
                    Send
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
