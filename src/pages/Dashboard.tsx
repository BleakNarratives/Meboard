import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Loader2,
  LogOut,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { BIT_KINDS, useMeboard, type Bit, type BitKind } from "@/hooks/use-meboard";

// The board is the product, so this page is mostly one list plus one
// input. Everything here reads or writes through useMeboard — there is no
// second copy of board state, no local mirror to fall out of sync.

const KIND_LABEL: Record<BitKind, string> = {
  idea: "idea",
  file: "file",
  audio: "audio",
  terminal: "terminal",
  agent: "agent",
  other: "other",
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const {
    bits,
    isLoading,
    mood,
    addBit,
    reward,
    discipline,
    toggleRaised,
    removeBit,
  } = useMeboard();

  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<BitKind>("idea");
  const [error, setError] = useState<string | null>(null);

  // Standing vs sunken. Computing this once keeps the render honest:
  // "raised" is a column, not a vibe, so a disciplined-to-zero bit must
  // visually sink and stay there until something raises it again.
  const { standing, sunken } = useMemo(() => {
    const raised = bits.filter((b) => b.raised);
    const down = bits.filter((b) => !b.raised);
    // Heaviest first: the board should surface what it believes.
    raised.sort((a, b) => b.weight - a.weight || b.createdAt - a.createdAt);
    return { standing: raised, sunken: down };
  }, [bits]);

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await addBit(trimmed, kind);
      setLabel("");
    } catch (err) {
      // Server-side validation messages are written for humans already,
      // so surface them directly instead of inventing a generic one.
      setError(err instanceof Error ? err.message : "The board rejected that.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 sm:px-8">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
          meboard
        </span>
        <span className="h-4 w-px bg-border" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {bits.length} bit{bits.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            {user?.name ?? "unclaimed"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 font-mono text-[11px] uppercase tracking-[0.18em]"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-3.5" />
            sign out
          </Button>
        </span>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_18rem]">
        {/* ---- the board ---------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              the board
            </h1>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              grow · fall · rise
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-10 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              reading the board…
            </div>
          ) : standing.length === 0 && sunken.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              empty. feed it.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {standing.map((bit, index) => (
                <BitRow
                  key={bit._id}
                  bit={bit}
                  index={index}
                  onReward={() => void reward(bit._id)}
                  onDiscipline={() => void discipline(bit._id)}
                  onToggle={() => void toggleRaised(bit._id)}
                  onRemove={() => void removeBit(bit._id)}
                />
              ))}
            </ul>
          )}

          {/* Sunken bits are shown, not hidden. Hiding them would let the
              user forget what the board already decided against. */}
          {sunken.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                sunk — still remembered
              </p>
              {sunken.map((bit) => (
                <div
                  key={bit._id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {KIND_LABEL[bit.kind]}
                  </span>
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground line-through">
                    {bit.label}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-mono text-[10px] uppercase tracking-[0.18em]"
                    onClick={() => void reward(bit._id)}
                  >
                    raise it
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={() => void removeBit(bit._id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* ---- drop a bit ------------------------------------------ */}
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="drop a bit into the board"
                maxLength={280}
                className="font-mono text-xs"
              />
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as BitKind)}
                className="h-9 rounded-md border border-border/60 bg-background px-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                {BIT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="gap-2 font-mono text-[11px] uppercase tracking-[0.18em]"
                onClick={() => void submit()}
              >
                <CornerDownLeft className="size-3.5" />
                drop
              </Button>
            </div>
            {error && (
              <p className="font-mono text-[11px] text-destructive">{error}</p>
            )}
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              enter to commit · 280 chars max
            </p>
          </div>
        </section>

        {/* ---- mood dial ---------------------------------------------- */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-border/50 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              mood
            </p>
            {/* A vertical bar, not a percentage badge: the product premise
                is that the board has a position, and a bar can visibly
                fall and rise. */}
            {/* flex-col + justify-end so the bar grows UP from the floor.
                Left as a plain block, a percentage height fills from the
                top and the dial reads backwards. */}
            <div className="mt-3 flex h-40 w-full flex-col justify-end overflow-hidden rounded-md border border-border/60 bg-background">
              <motion.div
                className="w-full bg-primary"
                initial={false}
                animate={{ height: `${Math.max(mood * 100, 2)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              />
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {Math.round(mood * 100)}% standing
            </p>
          </div>

          <div className="rounded-xl border border-border/50 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              how it learns
            </p>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              reward a bit and it gets heavier. discipline it and it sinks,
              but never disappears. the next drop starts from what this
              board already believes.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function BitRow({
  bit,
  index,
  onReward,
  onDiscipline,
  onToggle,
  onRemove,
}: {
  bit: Bit;
  index: number;
  onReward: () => void;
  onDiscipline: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  // Heavier bits are physically taller. This is the entire "the keyboard
  // grows toward what you need" idea reduced to something a browser can
  // do honestly: no fake learning, just weight made visible.
  const height = 44 + bit.weight * 6;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      className="group flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3"
      style={{ minHeight: height }}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {KIND_LABEL[bit.kind]}
      </span>
      <span className="flex-1 truncate font-mono text-xs text-foreground">
        {bit.label}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        w{bit.weight}
      </span>
      <span className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onReward}
          aria-label="Reward this bit"
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onDiscipline}
          aria-label="Discipline this bit"
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          aria-label="Drop this bit"
        >
          <X className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={onRemove}
          aria-label="Remove this bit"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </span>
    </motion.li>
  );
}
