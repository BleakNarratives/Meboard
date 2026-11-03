import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a lazy route that failed to load.
 *
 * Without this, a stale chunk or a network blip on `import()` unmounts the whole
 * tree and leaves a blank page — which is both a bad experience and how a
 * recoverable hiccup gets reported as a crash. Here it becomes one screen with
 * one instruction.
 */
export class RouteBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route failed to load:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const staleChunk = /dynamically imported module|module script failed/i.test(
      error.message,
    );

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-border p-6"
        >
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Load failed
          </p>
          <h1 className="mt-2 text-xl font-bold tracking-tight">
            {staleChunk
              ? "The app updated underneath this tab"
              : "This page didn't load"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {staleChunk
              ? "A new build replaced the files this tab was still holding. One reload picks up the new ones."
              : "Something failed while loading. Reloading usually clears it."}
          </p>
          <Button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 cursor-pointer"
          >
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
