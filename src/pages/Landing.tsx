import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// The landing page's job is the brief's must-have moment: you open it and
// you get bapped. Not a greeting, not a hero carousel — a rude little
// event that ends in the board. So the first render is the bap, and the
// real marketing copy sits underneath it, revealed by dismissing it.
//
// The state is local and deliberately non-persisted: the bap should happen
// once per visit, not once per lifetime. A cookie would turn the joke into
// a nag.

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [bapped, setBapped] = useState(false);

  const enter = () => {
    navigate(isAuthenticated ? "/dashboard" : "/auth?returnTo=/dashboard");
  };

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border/50 px-4 py-3 sm:px-8">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
          meboard
        </span>
        <span className="h-4 w-px bg-border" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          grow · fall · rise
        </span>
        <button
          type="button"
          onClick={enter}
          className="ml-auto inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          enter the board
          <ArrowRight className="size-3.5" />
        </button>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          a moodboard that keeps score
        </p>

        <h1 className="mt-6 text-4xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
          You just got
          <br />
          <span className="text-primary">Tera-Bagged.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Those digital bits just dipped down into your mouth. This is not Burger
          King, and you are not about to have it your way — but you are damn
          sure still getting it. No less.
        </p>

        <p className="mt-4 max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">
          Meboard grows when your ideas grow, drops when life hits, and comes
          back up as you move along the road. It started as a keyboard that
          leaned toward your habits — a comma where you meant M — and it did
          not stay a keyboard. You can tell it <em>no, wrong</em>. You can tell
          it <em>hell yeah, atta boy</em>. Either way it learns faster than a
          dashboard ever did, because you are the training signal.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setBapped(true)}
            className="inline-flex items-center gap-3 rounded-md bg-foreground px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-background transition-opacity hover:opacity-90"
          >
            alright. show me the board
            <ArrowRight className="size-3.5" />
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            all utility · all value · all you
          </span>
        </div>
      </section>

      {/* The bap itself. A sheet that drops over the page, says its piece,
          and leaves. Dismissing it is the only way into the marketing
          section — which is the joke: you cannot skip the rudeness. */}
      <AnimatePresence>
        {!bapped && (
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-foreground px-6 text-center text-background"
          >
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="font-mono text-[11px] uppercase tracking-[0.3em] opacity-60"
            >
              attention
            </motion.p>
            <motion.h2
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 18 }}
              className="max-w-xl text-3xl font-semibold leading-none tracking-tight sm:text-5xl"
            >
              Bap. You just got Tera-Bagged.
            </motion.h2>
            <p className="max-w-md text-sm leading-relaxed opacity-70">
              The board is not here to be agreeable. It remembers what you
              reward, what you reject, and how often you were sure.
            </p>
            <button
              type="button"
              onClick={() => setBapped(true)}
              className="mt-2 inline-flex items-center gap-3 rounded-md border border-background/30 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:bg-background hover:text-foreground"
            >
              fine. proceed
              <ArrowRight className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
