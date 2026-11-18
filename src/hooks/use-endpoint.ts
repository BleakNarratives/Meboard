import { useCallback, useEffect, useState } from "react";

/**
 * The endpoint that copied commands point at.
 *
 * `VITE_CONVEX_URL` is the right default and usually the right answer, but a
 * pasted command is a thing you paste somewhere else — a second deployment, a
 * preview, a laptop in a different project. Hard-coding the value into the
 * snippet means re-typing it by hand every time, which is exactly the copypasta
 * this is meant to remove.
 *
 * Stored per browser, shared by every component that renders a command, and
 * synced within the tab by a custom event (the `storage` event only fires in
 * *other* tabs, which is the opposite of what a single page needs).
 */
const KEY = "meboard.bus.endpoint";
const EVENT = "meboard:bus-endpoint";

export function defaultSiteUrl(): string {
  return String(import.meta.env.VITE_CONVEX_URL ?? "")
    .replace(".convex.cloud", ".convex.site")
    .replace(/\/+$/, "");
}

function normalise(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function read(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored !== null && normalise(stored).length > 0) return normalise(stored);
  } catch {
    // private mode, disabled storage: fall through to the build default
  }
  return defaultSiteUrl();
}

export function useEndpoint() {
  const [siteUrl, setSiteUrl] = useState(read);

  useEffect(() => {
    const sync = () => setSiteUrl(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setOverride = useCallback((next: string) => {
    const clean = normalise(next);
    try {
      if (clean.length === 0) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, clean);
    } catch {
      // a browser that refuses to remember still gets the value for this render
    }
    window.dispatchEvent(new Event(EVENT));
    setSiteUrl(read());
  }, []);

  return {
    siteUrl,
    setOverride,
    isDefault: siteUrl === defaultSiteUrl(),
    reset: () => setOverride(""),
  };
}
