import type { PersonaStore } from "./types";

/**
 * localStorage-backed persona memory.
 *
 * Every call is wrapped: privacy modes, quota exhaustion and disabled storage
 * are all normal, and losing the memory of your sins is far better than losing
 * the page. The engine validates whatever comes back, so a tampered value is
 * just a mildly rude stranger rather than a crash.
 *
 * To make muting follow a user across devices, implement this same interface
 * against a Convex mutation — nothing else in the persona code changes.
 */
export function createLocalStore(key = "meboard.persona.v1"): PersonaStore {
  return {
    read() {
      try {
        if (typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    write(state) {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage full, disabled, or lying. Not worth a toast.
      }
    },
  };
}
