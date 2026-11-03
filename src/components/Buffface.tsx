import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router";

import buffface from "@/assets/buffface.svg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The Freebuff logo used to be the app's logo. It isn't any more — the board
 * has its own mark — so this is the one door left for the room we borrowed.
 * Buffface is the door: a keycap with a wink, a colophon, and no tracking.
 */
const projectUrl = import.meta.env.VITE_VLY_APP_ID
  ? `https://freebuff.com/project/${import.meta.env.VITE_VLY_APP_ID}`
  : null;

export function BufffaceBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "group cursor-pointer gap-2 text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <img
            src={buffface}
            alt=""
            className="size-5 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:-rotate-6"
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            Buffface
          </span>
          {!compact && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              built on Freebuff
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="gap-0 border-b border-border bg-muted/40 px-6 py-5">
          <div className="flex items-start gap-4">
            <img
              src={buffface}
              alt="Buffface: a persimmon keycap with one eye winking and a keyhole for a mouth"
              className="size-16 shrink-0"
            />
            <div>
              <DialogTitle className="font-display text-xl tracking-tight">
                Buffface
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-6">
                The keycap holding the door between the board we built and the
                room we borrowed.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5 text-sm leading-6">
          <p>
            Meboard is ours: the peer-to-peer board, the key surface that learns
            where your thumb lands, and Keyhole&rsquo;s opinions about both.
          </p>
          <p>
            Freebuff is the room: the dev loop, the Convex backend, the
            typecheck after every turn, and the mirror that turns &ldquo;done&rdquo;
            into a commit. The board needed a room. This is the door.
          </p>

          <dl className="grid gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-3 text-xs leading-5">
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-mono uppercase tracking-[0.16em] text-muted-foreground">
                Room
              </dt>
              <dd>Freebuff — environment, backend, and the version-control mirror.</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-mono uppercase tracking-[0.16em] text-muted-foreground">
                Board
              </dt>
              <dd>Meboard — screen share, adaptive keys, and one rude little voice.</dd>
            </div>
          </dl>

          <p className="text-xs leading-5 text-muted-foreground">
            Buffface is an in-house doodle, not an official Freebuff mark. The
            wink is borrowed from a Chromebook that got there first.
          </p>
        </div>

        <DialogFooter className="border-t border-border bg-muted/40 px-6 py-3 sm:justify-between">
          <Button asChild size="sm" variant="ghost" className="cursor-pointer gap-2">
            <Link to="/lab">
              Meet the keyboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          {projectUrl && (
            <Button asChild size="sm" variant="outline" className="cursor-pointer gap-2">
              <a href={projectUrl} target="_blank" rel="noopener noreferrer">
                Open on Freebuff
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
