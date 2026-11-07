import { useCallback, useMemo, useState } from "react";
import { createPersona } from "@/lib/persona/engine";
import { createLocalStore } from "@/lib/persona/store";
import type { PersonaEvent, Quip } from "@/lib/persona/types";
import { keyhole } from "@/lib/persona/voices/keyhole";

/**
 * One persona instance per mounted page. The engine keeps its own memory, so
 * this hook deliberately holds almost no state: just the current line and the
 * mute flag, both of which the UI needs in order to re-render.
 */
export function useKeyhole() {
  const persona = useMemo(
    () => createPersona({ voice: keyhole, store: createLocalStore() }),
    [],
  );
  const [line, setLine] = useState<Quip | null>(null);
  const [muted, setMuted] = useState(() => persona.isMuted());

  const say = useCallback(
    (event: PersonaEvent) => {
      const quip = persona.note(event);
      if (quip) setLine(quip);
    },
    [persona],
  );

  const toggleMute = useCallback(() => {
    const next = !persona.isMuted();
    const quip = persona.setMuted(next);
    setMuted(next);
    // Muting clears the remark; unmuting can unlock sealed material.
    setLine(next ? null : quip);
  }, [persona]);

  return { line, say, muted, toggleMute };
}
