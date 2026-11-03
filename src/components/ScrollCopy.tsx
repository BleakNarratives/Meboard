import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "framer-motion";

/**
 * Typography that reacts to the scroll, not to a timer.
 *
 * Two ideas share every element:
 *
 * **The timing is deliberate.** `crawl(t) = t^7` means a word has covered 21%
 * of its journey at 80% of its window. It hangs, then commits, and the last
 * tenth covers half of what is left. `settle(t)` is the damped wobble at the
 * end of that whip — the boing, returning to exactly zero displacement.
 *
 * **The lettering arrives in ink, not in opacity.** Every piece of type is
 * rendered twice: an outline layer underneath (stroke only, transparent fill),
 * and the real filled letters on top, revealed by a clip that follows the
 * crawl. So the shape of the word is drawn first and the ink floods in after
 * it, like the machine is catching up to a hand that already knows the word.
 *
 * Rules that keep it from ruining the page:
 *
 *   1. **Reduced motion renders flat text.** One honest paragraph, no layers.
 *   2. **Nothing already on screen is invisible at load.** Elements above the
 *      fold play a one-second ink-in on mount instead of waiting for scroll.
 *   3. **Nothing ends below full fill, and nothing ends displaced.**
 *   4. **Text is never split below the word.** The outline twin is aria-hidden,
 *      so a screen reader still reads one string.
 */

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Where the whip begins inside a window. */
const SNAP_START = 0.78;
/**
 * Higher = more distance saved for the end. At 7, a word has covered 21% of
 * its journey at 80% of its window — 79% of the movement happens in the last
 * fifth, and half of it in the last tenth.
 */
const CRAWL_POWER = 7;

function crawl(t: number): number {
  return Math.pow(clamp01(t), CRAWL_POWER);
}

/**
 * Damped wobble, in pixels. Zero exactly when the crawl commits, zero again at
 * the end, so there is no seam and the word settles where static layout puts it.
 */
function settle(t: number): number {
  const snap = clamp01((t - SNAP_START) / (1 - SNAP_START));
  if (snap === 0) return 0;
  return Math.sin(snap * Math.PI * 3) * Math.exp(-snap * 2.6) * 9;
}

/**
 * Was this element below the fold at mount?
 *
 * The curve starts at zero, so anything already on screen would render
 * unfilled until the user scrolls. Above the fold we play a timed ink-in
 * instead; below it, the scroll drives.
 */
function useArmed(ref: RefObject<HTMLElement | null>): boolean {
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setArmed(element.getBoundingClientRect().top > window.innerHeight * 0.92);
  }, [ref]);

  return armed;
}

/* ------------------------------------------------------------------ *
 * Ink
 * ------------------------------------------------------------------ */

const INK_TOP = "-14%";

function InkLayers({
  children,
  outlineStyle,
  fillStyle,
}: {
  children: ReactNode;
  outlineStyle?: MotionStyle;
  fillStyle?: MotionStyle;
}) {
  return (
    <span className="relative inline-block">
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none"
        style={
          {
            WebkitTextFillColor: "transparent",
            WebkitTextStroke: "1px currentColor",
            ...outlineStyle,
          } as MotionStyle
        }
      >
        {children}
      </motion.span>
      <motion.span className="relative block" style={fillStyle}>
        {children}
      </motion.span>
    </span>
  );
}

/** Scroll-driven: outline appears early, ink follows the whip. */
function InkScroll({
  children,
  t,
}: {
  children: ReactNode;
  t: MotionValue<number>;
}) {
  const clipPath = useTransform(
    t,
    (value) =>
      `inset(${INK_TOP} ${Math.max(0, 100 - crawl(value) * 100).toFixed(2)}% ${INK_TOP} 0)`,
  );
  // The outline is drawn early, holds as a guide while the ink travels, then
  // vanishes exactly as the fill completes so no 1px halo survives at rest.
  const outlineOpacity = useTransform(t, (value) => {
    const guide = 0.12 + Math.min(1, value * 3) * 0.28;
    return guide * (1 - crawl(value));
  });

  return (
    <InkLayers
      outlineStyle={{ opacity: outlineOpacity }}
      fillStyle={{ clipPath }}
    >
      {children}
    </InkLayers>
  );
}

/** Above the fold: the same gesture, on a clock instead of the scrollbar. */
function InkMount({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(false);
  const [flushed, setFlushed] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const start = window.setTimeout(() => setDrawn(true), 80 + delay);
    const settle = window.setTimeout(
      () => setFlushed(true),
      80 + delay + 1050,
    );
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(settle);
    };
  }, [delay, reduced]);

  if (reduced) return <>{children}</>;

  return (
    <InkLayers
      outlineStyle={{
        opacity: flushed ? 0 : drawn ? 0.32 : 0.08,
        transition: "opacity 260ms linear",
        transitionDelay: `${delay}ms`,
      }}
      fillStyle={{
        clipPath: drawn
          ? `inset(${INK_TOP} 0% ${INK_TOP} 0)`
          : `inset(${INK_TOP} 100% ${INK_TOP} 0)`,
        transition: "clip-path 950ms cubic-bezier(0.88, 0, 0.12, 1)",
        transitionDelay: `${delay + 140}ms`,
      }}
    >
      {children}
    </InkLayers>
  );
}

/* ------------------------------------------------------------------ *
 * Headings
 * ------------------------------------------------------------------ */

function useKern<T extends HTMLElement>(tightenEm: number) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  const armed = useArmed(ref);
  const animate = !reduced && armed;

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.95", "end 0.35"],
  });

  const letterSpacing = useTransform(scrollYProgress, (progress) => {
    const em = 0.06 + (tightenEm - 0.06) * crawl(progress);
    return `${em.toFixed(4)}em`;
  });

  return {
    ref,
    animate,
    t: scrollYProgress,
    style: animate ? { letterSpacing } : undefined,
  };
}

export function ScrollTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, animate, t, style } = useKern<HTMLHeadingElement>(-0.028);
  return (
    <motion.h1 ref={ref} style={style} className={className}>
      {animate ? (
        <InkScroll t={t}>{children}</InkScroll>
      ) : (
        <InkMount>{children}</InkMount>
      )}
    </motion.h1>
  );
}

export function ScrollHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, animate, t, style } = useKern<HTMLHeadingElement>(-0.022);
  return (
    <motion.h2 ref={ref} style={style} className={className}>
      {animate ? (
        <InkScroll t={t}>{children}</InkScroll>
      ) : (
        <InkMount>{children}</InkMount>
      )}
    </motion.h2>
  );
}

/* ------------------------------------------------------------------ *
 * Body copy
 * ------------------------------------------------------------------ */

export function ScrollWords({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const reduced = useReducedMotion();
  const armed = useArmed(ref);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.98", "end 0.4"],
  });

  if (reduced) {
    return (
      <p ref={ref} className={className}>
        {text}
      </p>
    );
  }

  const words = text.split(" ");

  if (!armed) {
    return (
      <p ref={ref} className={className}>
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="inline-block">
            <InkMount delay={index * 26}>{word}</InkMount>
            {"\u00A0"}
          </span>
        ))}
      </p>
    );
  }

  return (
    <p ref={ref} className={className}>
      {words.map((word, index) => (
        <Word
          key={`${word}-${index}`}
          progress={scrollYProgress}
          index={index}
          total={words.length}
        >
          {word}
        </Word>
      ))}
    </p>
  );
}

function Word({
  children,
  index,
  total,
  progress,
}: {
  children: ReactNode;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  // A long window is what makes it feel sluggish: each word owns half the
  // paragraph's scroll, then burns almost all of it in the final fifth.
  const end = Math.min(1, start + 0.5);
  const span = Math.max(0.0001, end - start);
  const local = (value: number) => clamp01((value - start) / span);

  const t = useTransform(progress, local);
  const y = useTransform(
    progress,
    (value) => 22 * (1 - crawl(local(value))) - settle(local(value)),
  );
  // Squash and stretch, modest: stretch tall on the way up, flatten on the
  // rebound, always back to 1 at rest.
  const scaleY = useTransform(
    progress,
    (value) => 1 + 0.008 * settle(local(value)),
  );
  const scaleX = useTransform(
    progress,
    (value) => 1 - 0.005 * settle(local(value)),
  );

  return (
    <motion.span
      style={{ y, scaleX, scaleY }}
      className="inline-block origin-bottom"
    >
      <InkScroll t={t}>{children}</InkScroll>
      {"\u00A0"}
    </motion.span>
  );
}

/**
 * A signal line drawn on the same curve: almost still, then a rush into the
 * last few percent. Pure decoration: `aria-hidden`, no text inside.
 */
export function SignalLine() {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.45"],
  });
  const pathLength = useTransform(scrollYProgress, (value) =>
    clamp01(crawl(value) * 1.02),
  );

  return (
    <div ref={ref} aria-hidden="true" className="relative h-20 w-full sm:h-24">
      <svg
        viewBox="0 0 800 96"
        fill="none"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <path
          d="M2 72 C 120 72, 150 16, 270 16 S 420 80, 540 80 S 690 22, 798 22"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <motion.path
          d="M2 72 C 120 72, 150 16, 270 16 S 420 80, 540 80 S 690 22, 798 22"
          stroke="var(--color-marker)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={reduced ? { pathLength: 1 } : { pathLength }}
        />
        <circle cx="2" cy="72" r="4" fill="var(--color-marker)" />
        <circle cx="798" cy="22" r="4" fill="var(--color-marker)" />
        <circle cx="270" cy="16" r="3" fill="currentColor" fillOpacity="0.35" />
        <circle cx="540" cy="80" r="3" fill="currentColor" fillOpacity="0.35" />
      </svg>
    </div>
  );
}
