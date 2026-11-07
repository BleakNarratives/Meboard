import { useMemo, useRef, useState } from "react";
import { ArrowBigUp, Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import { offsetFor, type TargetMemory } from "@/lib/keyboard/adapt";
import { KEYS } from "@/lib/keyboard/layout";
import { repairToken, type Repair } from "@/lib/keyboard/repair";
import { lastWord } from "@/lib/keyboard/text";
import { cn } from "@/lib/utils";

/**
 * The keyboard itself — or as much of it as is honest today.
 *
 * It is a real surface: keys are hit targets, their positions move with the
 * remembered offsets, and the trailing word is repaired as you type. What it is
 * not is an Android IME: a web page cannot replace the system keyboard, so this
 * lives inside Meboard's own pages and exists to prove the loop — press, miss,
 * learn, move.
 *
 * The suggestion is offered, never applied. Repair is only allowed to be
 * confident, and confidence is not permission.
 */
const ROWS = [0, 1, 2].map((row) =>
  KEYS.filter((spot) => spot.y === row).sort((a, b) => a.x - b.x),
);

export interface KeyboardSurfaceProps {
  value: string;
  onChange: (next: string) => void;
  memory: TargetMemory;
  onMiss: (pair: { intended: string; hit: string }) => void;
  onAccept: (repair: Repair, token: string) => void;
  onReject: (token: string) => void;
  maxLength?: number;
}

export function KeyboardSurface({
  value,
  onChange,
  memory,
  onMiss,
  onAccept,
  onReject,
  maxLength = 2000,
}: KeyboardSurfaceProps) {
  const [shift, setShift] = useState(false);
  const dismissed = useRef(new Set<string>());

  const current = useMemo(() => lastWord(value), [value]);
  const suggestion = useMemo(() => {
    if (current.length === 0) return null;
    if (dismissed.current.has(current)) return null;
    return repairToken(current);
  }, [current]);

  const press = (key: string) => {
    const char = shift && /[a-z]/.test(key) ? key.toUpperCase() : key;
    if (shift) setShift(false);
    onChange((value + char).slice(0, maxLength));
  };

  const space = () => {
    dismissed.current.clear();
    setShift(false);
    onChange((value + " ").slice(0, maxLength));
  };

  const backspace = () => {
    setShift(false);
    onChange(value.slice(0, -1));
  };

  const take = () => {
    if (!suggestion || current.length === 0) return;
    // Only the trailing occurrence: `current` is the last word, so replace
    // exactly there instead of rewriting the same string earlier in the line.
    onChange(
      (value.slice(0, value.length - current.length) + suggestion.text).slice(
        0,
        maxLength,
      ),
    );
    if (suggestion.pair) onMiss(suggestion.pair);
    onAccept(suggestion, current);
  };

  const reject = () => {
    if (current.length === 0) return;
    dismissed.current.add(current);
    onReject(current);
  };

  return (
    <div className="space-y-2">
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-1.5"
      >
        {suggestion ? (
          <>
            <p className="min-w-0 truncate text-sm">
              <span className="font-mono text-muted-foreground">{current}</span>{" "}
              <span aria-hidden="true" className="text-marker">
                →
              </span>{" "}
              <span className="font-medium">{suggestion.text}</span>{" "}
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {suggestion.rule}
              </span>
            </p>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                size="sm"
                onClick={take}
                className="cursor-pointer"
              >
                Take
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={reject}
                className="cursor-pointer"
              >
                No
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Repair offers appear here. Nothing is rewritten without a tap.
          </p>
        )}
      </div>

      <div className="space-y-1 select-none">
        {ROWS.map((row, index) => (
          <div key={index} className="flex justify-center gap-1">
            {row.map((spot) => {
              const offset = offsetFor(memory, spot.key);
              const moved = offset.dx !== 0 || offset.dy !== 0;
              const label = shift ? spot.key.toUpperCase() : spot.key;

              return (
                <button
                  key={spot.key}
                  type="button"
                  onClick={() => press(spot.key)}
                  aria-label={`Type ${label}`}
                  style={{
                    transform: `translate(${(offset.dx * 100).toFixed(1)}%, ${(offset.dy * 100).toFixed(1)}%)`,
                  }}
                  className={cn(
                    "flex h-9 w-8 cursor-pointer items-center justify-center rounded-md border bg-card text-sm font-medium text-foreground transition-transform duration-500 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:h-10 sm:w-9",
                    moved ? "border-primary/60" : "border-border",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}

        <div className="flex justify-center gap-1 pt-0.5">
          <button
            type="button"
            onClick={() => setShift((previous) => !previous)}
            aria-pressed={shift}
            aria-label="Shift"
            className={cn(
              "flex h-9 w-12 cursor-pointer items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:h-10",
              shift ? "border-primary/60 text-primary" : "border-border",
            )}
          >
            <ArrowBigUp className="size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={space}
            aria-label="Space"
            className="h-9 w-40 cursor-pointer rounded-md border border-border bg-card text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:h-10 sm:w-56"
          >
            space
          </button>

          <button
            type="button"
            onClick={backspace}
            aria-label="Backspace"
            className="flex h-9 w-12 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:h-10"
          >
            <Delete className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground">
        Tinted keys have moved: the target has grown toward where your thumb
        actually lands. Displacement is capped and rate-limited, so nothing
        chases you around the board.
      </p>
    </div>
  );
}
