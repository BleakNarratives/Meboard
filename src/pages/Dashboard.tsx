import { Link } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowRight, Keyboard, MonitorUp, Radio } from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";

const steps = [
  {
    icon: MonitorUp,
    title: "Share on the broken device",
    body: "Open Live, hit “Share my screen”, and choose the entire screen. It gets a six-character code.",
  },
  {
    icon: Radio,
    title: "Join from the device you can read",
    body: "Same account, Live, “Watch a screen”, type the code. Video goes device to device — no server in the middle.",
  },
  {
    icon: Keyboard,
    title: "Move text, not just pixels",
    body: "The text channel under the video carries codes, commands and terminal output both ways as real selectable text.",
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const activeRoom = useQuery(api.live.myRoom);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <AppNav />
      <main className="flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-4xl space-y-8">
          <header className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Boards
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome{user?.name ? `, ${user.name}` : ""}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Meboard puts one device&rsquo;s screen on another and gives you a
              shared text sheet alongside it. Built for the case where the
              machine is fine and the display is not.
            </p>
          </header>

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-xl border border-border p-6 paper-grid"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight">
                  {activeRoom
                    ? "You have a board waiting"
                    : "Start a live board"}
                </h2>
                {activeRoom ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Code{" "}
                    <span className="font-mono text-base font-bold tracking-[0.25em] text-foreground">
                      {activeRoom.code}
                    </span>{" "}
                    ·{" "}
                    {activeRoom.status === "live"
                      ? "a viewer is attached"
                      : "no viewer yet"}
                  </p>
                ) : (
                  <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                    Share this screen, or join one with a code.
                  </p>
                )}
              </div>
              <Button asChild className="cursor-pointer gap-2 self-start">
                <Link to="/live">
                  {activeRoom ? "Open live board" : "Go to Live"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </motion.section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              How a session goes
            </h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {steps.map((step, index) => (
                <motion.li
                  key={step.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * index }}
                  className="rounded-xl border border-border p-4"
                >
                  <step.icon className="mb-3 size-5 text-primary" />
                  <h3 className="text-sm font-bold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </motion.li>
              ))}
            </ul>
          </section>

          <p className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
            <strong className="font-semibold text-foreground">
              Where Meboard stops:
            </strong>{" "}
            a web page can stream a screen but cannot move another machine&rsquo;s
            cursor or type into it. For real remote control on ChromeOS you
            still want Chrome Remote Desktop&rsquo;s one-time support code — use
            Meboard&rsquo;s text channel to move that code across.
          </p>
        </div>
      </main>
    </div>
  );
}
