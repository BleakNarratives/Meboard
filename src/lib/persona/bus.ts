import type { Persona } from "./engine";
import type { PersonaEvent, Quip } from "./types";

/**
 * The seam between "something happened" and "the voice says something about
 * it".
 *
 * Two directions, both one call:
 *
 *   emit(event)          — an app reports a thing it did
 *   bridge(source)       — an existing event bus forwards into the persona
 *
 * `source` is any object with `subscribe(handler)`, so a Convex-driven bus, a
 * `window.dispatchEvent` wrapper, a WebSocket fan-out or a Redux store all
 * qualify without the persona knowing what any of them are. That is deliberate:
 * the persona must never become the place where two systems are coupled.
 */
export interface EventSource {
  subscribe(handler: (event: PersonaEvent) => void): () => void;
}

export interface PersonaBus {
  emit(event: PersonaEvent): Quip | null;
  bridge(source: EventSource): () => void;
  muted(): boolean;
  setMuted(muted: boolean): Quip | null;
}

export function createPersonaBus(options: {
  persona: Persona;
  onQuip: (quip: Quip) => void;
}): PersonaBus {
  const { persona, onQuip } = options;

  const emit = (event: PersonaEvent) => {
    const quip = persona.note(event);
    if (quip) onQuip(quip);
    return quip;
  };

  return {
    emit,
    bridge(source) {
      return source.subscribe((event) => {
        emit(event);
      });
    },
    muted: () => persona.isMuted(),
    setMuted(muted) {
      const quip = persona.setMuted(muted);
      if (quip) onQuip(quip);
      return quip;
    },
  };
}

/**
 * An in-memory source for app code that has no bus of its own yet. Hand it to
 * `bridge()` today and swap it for the real system bus later; neither the
 * persona nor the voice packs notice.
 */
export function createSource(): EventSource & {
  publish: (event: PersonaEvent) => void;
} {
  const handlers = new Set<(event: PersonaEvent) => void>();
  return {
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    publish(event) {
      for (const handler of handlers) handler(event);
    },
  };
}
