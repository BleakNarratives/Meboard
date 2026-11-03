import { useEffect, useMemo, useState } from "react";
import { Eraser, RotateCcw } from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { BusPanel } from "@/components/BusPanel";
import { KeyholeBanner } from "@/components/KeyholeBanner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useKeyhole } from "@/hooks/use-keyhole";
import {
  MAX_OFFSET,
  emptyMemory,
  offsetFor,
  parseMemory,
  recordMiss,
  type TargetMemory,
} from "@/lib/keyboard/adapt";
import { KEYS } from "@/lib/keyboard/layout";
import { repairToken, type Repair } from "@/lib/keyboard/repair";

/**
 * The lab: the keyboard's brain with the skull open.
 *
 * Deliberately not a product surface. It exists so a thumb can produce the
 * evidence the engine needs, and so the claims in the roadmap can be checked
 * by someone who isn't reading TypeScript: type `,y`, see `my`, take the
 * repair, watch `m`'s target move — once — and then hold still.
 */
const ROWS = [0, 1, 2].map((row) =>
  KEYS.filter((spot) => spot.y === row).sort((a, b) => a.x - b.x),
);

const TARGETS_KEY = "meboard.targets.v1";
const SESSION_KEY = "meboard.lab.session";
/** A paste bomb shouldn't be able to freeze the tab on every keystroke. */
const MAX_TEXT = 2000;
const MAX_TOKENS = 400;

export default function Lab() {
  const [text, setText] = useState("");
  const [memory, setMemory] = useState<TargetMemory>(loadMemory);
  const [session] = useState(nextSession);
  const { line, say, muted, toggleMute } = useKeyhole();

  useEffect(() => {
    saveMemory(memory);
  }, [memory]);

  const notes = useMemo(() => {
    const seen = new Map<string, Repair>();
    for (const token of text.split(/\s+/).slice(0, MAX_TOKENS)) {
      if (!token || seen.has(token)) continue;
      const repair = repairToken(token);
      if (repair) seen.set(token, repair);
    }
    return [...seen.entries()].map(([token, repair]) => ({ token, repair }));
  }, [text]);

  const moved = Object.entries(memory.keys).filter(
    ([, entry]) => entry.offset.dx !== 0 || entry.offset.dy !== 0,
  );

  const typeKey = (key: string) => setText((previous) => previous + key);

  const takeRepair = (token: string, repair: Repair) => {
    // Word-wise, not substring-wise: `split(token).join(...)` would also rewrite
    // the token inside longer words and quietly corrupt the sentence.
    setText((previous) =>
      previous
        .split(/(\s+)/)
        .map((part) => (part === token ? repair.text : part))
        .join(""),
    );
    if (repair.pair) {
      const { intended, hit } = repair.pair;
      setMemory((previous) =>
        recordMiss(previous, { intended, hit, session }),
      );
    }
    say({ kind: "correction.accepted", pair: `${token} to ${repair.text}` });
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
            <h1 className="text-3xl font-bold tracking-tight">
              The keyboard, with its skull open
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Type with your real keyboard or the board below. Every word gets
              a verdict with the rule and its cost in key widths. Nothing is
              rewritten until you say so.
            </p>
          </header>

          <KeyholeBanner line={line} muted={muted} onToggleMute={toggleMute} />

          <div className="rounded-xl border border-border p-4">
            <label
              htmlFor="lab-input"
              className="tracking-tight font-bold"
            >
              Scratch
            </label>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Real DOM text, so it reads properly and you can select it. The
              board appends to whatever is here.
            </p>
            <Textarea
              id="lab-input"
              value={text}
              onChange={(event) =>
                setText(event.target.value.slice(0, MAX_TEXT))
              }
              maxLength={MAX_TEXT}
              rows={3}
              placeholder=",y keyboard is broken"
              spellCheck={false}
              autoComplete="off"
              className="mb-3 resize-y font-mono"
            />

            <div className="space-y-1.5 select-none">
              {ROWS.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex justify-center gap-1 sm:gap-1.5"
                >
                  {row.map((spot) => {
                    const offset = offsetFor(memory, spot.key);
                    return (
                      <button
                        key={spot.key}
                        type="button"
                        onClick={() => typeKey(spot.key)}
                        aria-label={`Type ${spot.key}`}
                        style={{
                          transform: `translate(${(offset.dx * 100).toFixed(1)}%, ${(offset.dy * 100).toFixed(1)}%)`,
                        }}
                        className="flex size-8 cursor-pointer items-center justify-center rounded border border-border bg-background font-mono text-sm text-foreground transition-transform duration-300 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:size-10"
                      >
                        {spot.key}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="flex justify-center gap-1 pt-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => typeKey(" ")}
                  aria-label="Type a space"
                  className="h-8 w-40 cursor-pointer rounded border border-border bg-background font-mono text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:h-10 sm:w-56"
                >
                  space
                </button>
                <button
                  type="button"
                  onClick={() => setText((previous) => previous.slice(0, -1))}
                  aria-label="Delete the last character"
                  className="flex h-8 w-14 cursor-pointer items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:h-10"
                >
                  <Eraser className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-border p-4">
            <h2 className="tracking-tight font-bold">Repairs</h2>
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
                        onClick={() => takeRepair(token, repair)}
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

function nextSession(): number {
  try {
    const previous = Number(localStorage.getItem(SESSION_KEY) ?? "0");
    const next = Number.isFinite(previous) && previous > 0 ? Math.floor(previous) + 1 : 1;
    localStorage.setItem(SESSION_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

function loadMemory(): TargetMemory {
  try {
    const raw = localStorage.getItem(TARGETS_KEY);
    if (!raw) return emptyMemory();
    return parseMemory(JSON.parse(raw) as unknown);
  } catch {
    // A corrupt lab notebook is not worth a toast.
    return emptyMemory();
  }
}

function saveMemory(memory: TargetMemory) {
  try {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(memory));
  } catch {
    // Storage disabled; the session still works, it just forgets.
  }
}
