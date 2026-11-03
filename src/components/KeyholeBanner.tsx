import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Quip } from "@/lib/persona/types";

interface KeyholeBannerProps {
  line: Quip | null;
  muted: boolean;
  onToggleMute: () => void;
  name?: string;
}

/**
 * Renders the persona's current remark.
 *
 * The live region is *always* in the DOM — mounting a region at the same time
 * as its text is the classic way to have a screen reader skip it entirely.
 * When there is nothing to say the region is visually hidden but still present,
 * and the mute control lives outside it so it is never re-announced.
 */
export function KeyholeBanner({
  line,
  muted,
  onToggleMute,
  name = "Keyhole",
}: KeyholeBannerProps) {
  return (
    <div className={line || muted ? "flex items-start gap-2" : "sr-only"}>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          line
            ? "min-w-0 flex-1 rounded-lg border border-border border-l-2 border-l-marker bg-muted/40 px-3 py-2"
            : "sr-only"
        }
      >
        {line ? (
          <p className="text-sm text-foreground">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-marker">
              {name}
            </span>
            {line.body}
          </p>
        ) : null}
      </div>

      {line || muted ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleMute}
          aria-pressed={muted}
          className="cursor-pointer shrink-0 gap-1.5 text-xs text-muted-foreground"
        >
          {muted ? (
            <Volume2 className="size-3.5" aria-hidden="true" />
          ) : (
            <VolumeX className="size-3.5" aria-hidden="true" />
          )}
          <span>{muted ? "Unmute" : "Mute"}</span>
          <span className="sr-only">{name}</span>
        </Button>
      ) : null}
    </div>
  );
}
