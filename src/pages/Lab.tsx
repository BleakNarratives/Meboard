import { useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { BusPanel } from "@/components/BusPanel";
import { KeyboardSurface } from "@/components/KeyboardSurface";
import { KeyholeBanner } from "@/components/KeyholeBanner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useKeyhole } from "@/hooks/use-keyhole";
import { useSession, useTargetMemory } from "@/hooks/use-target-memory";
import { MAX_OFFSET, emptyMemory, recordMiss } from "@/lib/keyboard/adapt";
import { repairToken, type Repair } from "@/lib/keyboard/repair";
import { replaceWord, words } from "@/lib/keyboard/text";

/**
 * The lab: a working key surface with the skull open.
 *
 * It exists so a thumb can produce the evidence the engine needs, and so the
 * claims in the roadmap can be checked by someone who isn't reading TypeScript:
 * type `,y`, see `my`, take it, watch `m`'s target move — once — then hold
 * still. Repairs are offered, never applied.
 */
const MAX_TEXT = 2000;
const MAX_TOKENS = 400;

export default function Lab() {
  const [text, setText] = useState("");
  const [memory, setMemory] = useTargetMemory();
  const session = useSession();
  const { line, say, muted, toggleMute } = useKeyhole();
  const strikes = useRef(new Map<string, number>());

  const notes = useMemo(() => {
    const seen = new Map<string, Repair>();
    for (const token of words(text).slice(0, MAX_TOKENS)) {
      if (seen.has(token)) continue;
      const repair = repairToken(token);
      if (repair) seen.set(token, repair);
    }
    return [...seen.entries()].map(([token, repair]) => ({ token, repair }));
  }, [text]);

  const moved = Object.entries(memory.keys).filter(
    ([, entry]) => entry.offset.dx !== 0 || entry.offset.dy !== 0,
  );

  const noteMiss = (pair: { intended: string; hit: string }) => {
    setMemory((previous) =>
      recordMiss(previous, { intended: pair.intended, hit: pair.hit, session }),
    );
  };

  /**
   * One path for both accept buttons, so the surface and the list cannot drift:
   * record the physical slip, then let Keyhole comment exactly once.
   */
  const recordAcceptance = (repair: Repair, token: string) => {
    if (repair.pair) noteMiss(repair.pair);
    const seen = (strikes.current.get(token) ?? 0) + 1;
    strikes.current.set(token, seen);
    if (seen >= 2) {
      say({ kind: "typo.repeated", grapheme: token, count: seen });
    } else {
      say({ kind: "correction.accepted", pair: `${token} to ${repair.text}` });
    }
  };

  const takeFromList = (token: string, repair: Repair) => {
    setText((previous) =>
      replaceWord(previous, token, repair.text).slice(0, MAX_TEXT),
    );
    recordAcceptance(repair, token);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <AppNav />
      <main className="flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <header className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Lab
            </p>
            <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
              The keyboard, with its skull open
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              A real surface, not a mock: keys are hit targets, the trailing
              word is repaired as you type, and the board remembers where your
              thumb actually lands. Nothing is rewritten until you tap it.
            </p>
          </header>

          <KeyholeBanner line={line} muted={muted} onToggleMute={toggleMute} />

          <section className="rounded-xl border border-border bg-card p-4">
            <label htmlFor="lab-input" className="tracking-tight font-bold">
              Scratch
            </label>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Real DOM text, so it reads properly and you can select it. The
              board appends here; a hardware keyboard works too.
            </p>
            <Textarea
              id="lab-input"
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT))}
              maxLength={MAX_TEXT}
              rows={3}
              placeholder=",y keyboard is broken"
              spellCheck={false}
              autoComplete="off"
              className="mb-4 resize-y font-mono"
            />

            <KeyboardSurface
              value={text}
              onChange={setText}
              memory={memory}
              onMiss={noteMiss}
              onAccept={recordAcceptance}
              onReject={(token) => say({ kind: "correction.rejected", pair: token })}
              maxLength={MAX_TEXT}
            />
          </section>

          <section className="rounded-xl border border-border p-4">
            <h2 className="tracking-tight font-bold">Every repair in the text</h2>
            <p
              role="status"
              aria-live="polite"
              className="mt-1 text-xs text-muted-foreground"
            >
              {notes.length === 0
                ? "Nothing to repair."
                : `${notes.length} word${notes.length === 1 ? "" : "s"} could be repaired.`}
            </p>

            {notes.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Type a comma where a letter belongs — the founding incident —
                and watch it land.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {notes.map(({ token, repair }) => (
                  <li
                    key={token}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-foreground">
                        {token}{" "}
                        <span aria-hidden="true" className="text-marker">
                          →
                        </span>{" "}
                        {repair.text}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {repair.rule} · cost {repair.cost.toFixed(2)}
                        {repair.pair
                          ? ` · aimed for ${repair.pair.intended}, hit ${repair.pair.hit}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => takeFromList(token, repair)}
                        className="cursor-pointer"
                      >
                        Take it
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          say({ kind: "correction.rejected", pair: token })
                        }
                        className="cursor-pointer"
                      >
                        Leave it
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="tracking-tight font-bold">Hit targets</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMemory(emptyMemory())}
                className="cursor-pointer gap-1.5 text-xs"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reset
              </Button>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Session {session}. Evidence lands one strike per session; a key
              moves after three sessions of the same miss and then holds still
              for four. Displacement is capped at {MAX_OFFSET * 100}% of a key
              width.
            </p>

            {moved.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No key has moved. Take a repair that names a slipped key —
                <span className="font-mono"> ,y</span> aiming for{" "}
                <span className="font-mono">m</span> — and the board will lean
                that way.
              </p>
            ) : (
              <ul className="mt-3 space-y-1">
                {moved.map(([key, entry]) => (
                  <li key={key} className="font-mono text-sm">
                    <span className="text-foreground">{key}</span>{" "}
                    <span className="text-muted-foreground">
                      dx {(entry.offset.dx * 100).toFixed(0)}% · dy{" "}
                      {(entry.offset.dy * 100).toFixed(0)}% ·{" "}
                      {entry.strikes} strike{entry.strikes === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              Reload counts as a new session, which is how the three-session
              threshold gets earned in a lab instead of over a week.
            </p>
          </section>

          <BusPanel />
        </div>
      </main>
    </div>
  );
}
