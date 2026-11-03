import { useEffect, useState } from "react";
import { emptyMemory, parseMemory, type TargetMemory } from "@/lib/keyboard/adapt";

const TARGETS_KEY = "meboard.targets.v1";
const SESSION_KEY = "meboard.lab.session";

/**
 * Remembered hit-target offsets, persisted for the lab.
 *
 * Storage is untrusted input (a user can edit it, a version can change its
 * shape), so it goes through `parseMemory` on the way in and is written back in
 * the engine's own shape on the way out.
 */
export function useTargetMemory() {
  const [memory, setMemory] = useState<TargetMemory>(loadMemory);

  useEffect(() => {
    try {
      localStorage.setItem(TARGETS_KEY, JSON.stringify(memory));
    } catch {
      // Storage disabled; the session still works, it just forgets.
    }
  }, [memory]);

  return [memory, setMemory] as const;
}

/**
 * A new sitting, counted across reloads so the three-session evidence rule can
 * be earned in a lab instead of over a week. Cached per page load so React's
 * double-invoked initialiser doesn't skip a number.
 */
let cachedSession: number | null = null;

export function useSession(): number {
  const [session] = useState(nextSession);
  return session;
}

function nextSession(): number {
  if (cachedSession !== null) return cachedSession;
  try {
    const previous = Number(localStorage.getItem(SESSION_KEY) ?? "0");
    const next = Number.isFinite(previous) && previous > 0 ? Math.floor(previous) + 1 : 1;
    localStorage.setItem(SESSION_KEY, String(next));
    cachedSession = next;
    return next;
  } catch {
    cachedSession = 1;
    return 1;
  }
}

function loadMemory(): TargetMemory {
  try {
    const raw = localStorage.getItem(TARGETS_KEY);
    if (!raw) return emptyMemory();
    return parseMemory(JSON.parse(raw) as unknown);
  } catch {
    return emptyMemory();
  }
}
