import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Ban,
  Check,
  Copy,
  Eye,
  Keyboard,
  MonitorUp,
  Radio,
} from "lucide-react";

import mark from "@/assets/meboard-mark.svg";
import { BufffaceBadge } from "@/components/Buffface";
import { ScrollHeading, ScrollTitle, ScrollWords, SignalLine } from "@/components/ScrollCopy";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const steps = [
  {
    icon: MonitorUp,
    step: "01",
    title: "Share the screen you can't see",
    body: "On the damaged machine, open Live and share the entire screen. The browser asks once; Meboard shows a six-character code.",
  },
  {
    icon: Radio,
    step: "02",
    title: "Watch it somewhere readable",
    body: "On the tablet or the machine with a working display, enter the code. Video travels device to device over WebRTC, so nothing is re-uploaded to a third party.",
  },
  {
    icon: Keyboard,
    step: "03",
    title: "Move the text that gets stuck",
    body: "Support codes, paths, error text, terminal output: send them through the shared text panel, which is real selectable text rather than a picture of text.",
  },
];

const good = [
  "Full-screen or single-window capture from any ChromeOS, Chrome, or Chromium browser",
  "Two-way text sheet beside the video, with copy buttons",
  "Tap to drop a marker on the shared screen",
  "Nothing to install on the viewing device",
];

const limits = [
  "No cursor or keyboard control: a web page cannot drive another machine's pointer",
  "One viewer per board",
  "Same Wi-Fi works out of the box; different networks need a TURN relay",
  "Peer-to-peer video is not end-to-end encrypted beyond WebRTC's DTLS — treat the board as private, not secret",
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const primaryTo = isAuthenticated ? "/dashboard" : "/live";
  const primaryLabel = isAuthenticated ? "Open dashboard" : "Start a live board";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={mark} alt="" className="size-8" />
            <span className="font-display text-lg tracking-tight">Meboard</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link
              to="/live"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Live board
            </Link>
            <Link
              to="/lab"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Lab
            </Link>
            <Button asChild size="sm" className="cursor-pointer gap-2">
              <Link to={primaryTo}>
                {isAuthenticated ? "Dashboard" : "Sign in"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="paper-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
                screen sharing, for a screen that gave up
              </p>

              <ScrollTitle className="mt-5 max-w-xl font-display text-[2.75rem] leading-[0.98] tracking-tight sm:text-6xl lg:text-[4.5rem]">
                The screen is cracked.
                <br />
                <span className="text-primary">The machine is fine.</span>
              </ScrollTitle>

              <ScrollWords
                className="mt-6 max-w-xl text-base leading-7 text-muted-foreground"
                text="Meboard mirrors one device's screen onto another over a direct WebRTC link, then hands you a shared text sheet underneath it. Built for the afternoon you are holding a tablet in one hand and a laptop with a dead panel in the other."
              />

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="cursor-pointer gap-2">
                  <Link to={primaryTo}>
                    <MonitorUp className="size-4" />
                    {isAuthenticated ? "Open dashboard" : "Start a live board"}
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="cursor-pointer gap-2"
                >
                  <a href="#how">
                    See how a session runs
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>

              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                same account on both devices · peer to peer · no relay by default
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              aria-hidden="true"
              className="rounded-2xl border border-border bg-card p-3"
            >
              <div className="mb-3 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-marker/70" />
                <span className="size-2 rounded-full bg-muted-foreground/30" />
                <span className="size-2 rounded-full bg-muted-foreground/30" />
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  live · 2 devices
                </span>
              </div>

              <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-foreground">
                <div className="absolute inset-0 flex flex-col">
                  <div className="flex gap-1 border-b border-background/10 px-2 py-1.5">
                    <span className="h-2 w-14 rounded-sm bg-background/20" />
                    <span className="h-2 w-8 rounded-sm bg-background/10" />
                  </div>
                  <div className="flex-1 space-y-1.5 p-3 font-mono text-[10px] leading-relaxed text-background/60">
                    <p className="text-background/90">$ ./start.sh</p>
                    <p>booting container… ok</p>
                    <p>loading directory…</p>
                    <p className="text-marker">_ awaiting input</p>
                  </div>
                </div>
                <span className="absolute right-10 top-1/2 size-10 -translate-y-1/2 rounded-full border-2 border-marker" />
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    join code
                  </p>
                  <p className="font-mono text-lg font-bold tracking-[0.3em]">
                    7K4M2P
                  </p>
                </div>
                <Copy className="size-4 text-muted-foreground" />
              </div>
            </motion.div>
          </div>
        </section>

        <section id="how" className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
                one screen, two devices
              </p>
              <ScrollHeading className="mt-4 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                Three steps, both devices, no install
              </ScrollHeading>
              <ScrollWords
                className="mt-3 text-sm leading-6 text-muted-foreground"
                text="The viewing device only needs a browser. That matters when the machine doing the work is the one you cannot look at."
              />
            </div>

            <SignalLine />

            <ol className="grid gap-4 sm:grid-cols-3">
              {steps.map((step, index) => (
                <motion.li
                  key={step.step}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: 0.06 * index }}
                  className="relative overflow-hidden rounded-2xl border border-border bg-card p-5"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-1 -top-3 font-display text-6xl text-foreground/5"
                  >
                    {step.step}
                  </span>
                  <step.icon className="size-5 text-primary" />
                  <h3 className="mt-4 font-display text-xl tracking-tight">
                    {step.title}
                  </h3>
                  <ScrollWords
                    className="mt-2 text-sm leading-6 text-muted-foreground"
                    text={step.body}
                  />
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        <section id="limits" className="border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-5 flex items-center gap-2">
                <Eye className="size-5 text-primary" />
                <h2 className="font-display text-xl tracking-tight">
                  What it actually does
                </h2>
              </div>
              <ul className="space-y-3">
                {good.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6">
                    <Check className="mt-1 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-dashed border-border p-6">
              <div className="mb-5 flex items-center gap-2">
                <Ban className="size-5 text-marker" />
                <h2 className="font-display text-xl tracking-tight">
                  What it will not do
                </h2>
              </div>
              <ul className="space-y-3">
                {limits.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-marker" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                When you need real remote control on ChromeOS, pair this with
                Chrome Remote Desktop&rsquo;s one-time support code and move the
                code across the text sheet.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-foreground text-background">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="max-w-xl">
              <h2 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                Get the picture onto the screen you can read.
              </h2>
              <p className="mt-2 text-sm text-background/70">
                Sign in on both devices with the same account and share a code.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="cursor-pointer gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link to={primaryTo}>
                {primaryLabel}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <div className="flex items-center gap-2">
            <img src={mark} alt="" className="size-5" />
            <span className="font-display text-sm tracking-tight">Meboard</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BufffaceBadge />
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              screen + text, device to device
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
