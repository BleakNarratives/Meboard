// use-meboard.ts — the single client entry point to the board.
//
// WHY THIS HOOK EXISTS:
// The board needs to be readable and mutable from the dashboard, the
// command palette and (later) a keyboard surface. If each of those called
// Convex directly, every one of them would re-implement clamping, mood
// math and the first-run seed, and they would drift. One hook, one shape.
//
// WHY NO LOCAL STATE MIRROR:
// Convex queries are live subscriptions. Copying `bits` into a useState
// would give us two sources of truth that disagree the moment a second
// tab or a second device writes. The hook therefore reads straight from
// the subscription and derives everything else with useMemo.
//
// SIGNED-OUT BEHAVIOUR:
// listBits returns [] for anonymous visitors rather than throwing, so this
// hook is safe to mount on the public landing page. `isLoading` only
// reflects the auth query, because an empty board is a valid answer.

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";

// Derive the row type from generated schema instead of hand-writing an
// interface. Hand-written mirrors of Convex docs are the most common
// source of silent drift in this stack.
export type Bit = Doc<"bits">;
export type BitKind = Bit["kind"];

const MAX_WEIGHT = 5;

export const BIT_KINDS: BitKind[] = [
  "idea",
  "file",
  "audio",
  "terminal",
  "agent",
  "other",
];

export function useMeboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const bits = useQuery(api.meboard.listBits);
  const addBitMutation = useMutation(api.meboard.addBit);
  const rewardMutation = useMutation(api.meboard.rewardBit);
  const disciplineMutation = useMutation(api.meboard.disciplineBit);
  const toggleMutation = useMutation(api.meboard.toggleRaised);
  const removeMutation = useMutation(api.meboard.removeBit);
  const seedMutation = useMutation(api.meboard.seedBoard);

  // An empty board on first open reads as "broken", not as "yours". Seed
  // once per signed-in session, and only when storage is genuinely empty.
  // The ref stops React strict mode's double-mount from firing it twice;
  // the server's own empty check is the real guarantee.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (bits === undefined) return;
    if (bits.length > 0) return;
    if (seededRef.current) return;

    seededRef.current = true;
    void seedMutation({});
  }, [bits, isAuthenticated, seedMutation]);

  const list = bits ?? [];

  // "Mood" is the grow/fall/rise dial. Derived, never stored: a stored
  // mood eventually disagrees with the bits that produced it, and then the
  // board is lying about how it feels.
  const mood = useMemo(() => {
    if (list.length === 0) return 0.5;
    const total = list.reduce((sum, b) => sum + b.weight, 0);
    return total / (list.length * MAX_WEIGHT);
  }, [list]);

  const lastBit = list.length > 0 ? list[list.length - 1] : null;

  return {
    bits: list,
    // Undefined while the subscription warms up. Kept distinct from "empty"
    // so the UI can show a skeleton instead of flashing "no bits yet".
    isLoading: authLoading || bits === undefined,
    mood,
    lastBit,
    lastBitId: lastBit?._id ?? null,

    addBit: (label: string, kind: BitKind) =>
      addBitMutation({ label, kind }),
    reward: (bitId: Id<"bits">) => rewardMutation({ bitId }),
    discipline: (bitId: Id<"bits">) => disciplineMutation({ bitId }),
    toggleRaised: (bitId: Id<"bits">) => toggleMutation({ bitId }),
    removeBit: (bitId: Id<"bits">) => removeMutation({ bitId }),
    seedIfEmpty: () => seedMutation({}),
  };
}
