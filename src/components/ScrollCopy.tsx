import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * Typography that reacts to the scroll, not to a timer.
 *
 * The timing curve is the point. Three channels share one shape:
 *
 *   crawl(t) = t^7     almost nothing happens for most of the window — at 80%
 *                      the word has covered 21% of its distance — then it
 *                      commits, hard, and covers half of what's left in the
 *                      final tenth.
 *   settle(t)          a damped wobble that starts when the crawl commits:
 *                      the boing, measured in pixels, dying out to zero.
 *
 * Together that reads as sluggish, then whip, then wobble — the animation
 * arrives slightly before the rest of it does.
 *
 * Three rules keep this from becoming the thing that ruins a page:
 *
 *   1. **Reduced motion renders flat text.** Not a slower version — no split
 *      words, no transform, one honest paragraph.
 *   2. **Nothing ends below full opacity, and nothing ends displaced.** The
 *      finished state is exactly the static one: `crawl(1) = 1`, `settle(1) = 0`.
 *   3. **Text is never split below the word.** Letters fragment selection,
 *      translation and pronunciation, so only whole words animate.
 */

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Where the whip begins inside a window. */
const SNAP_START = 0.78;
/**
 * Higher = more distance saved for the end. At 7, a word has covered 21% of
 * its journey at 80% of its window — so 79% of the movement happens in the last
 * fifth, and half of it in the last tenth.
 */
const CRAWL_POWER = 7;

function crawl(t: number): number {
  return Math.pow(clamp01(t), CRAWL_POWER);
}

/**
 * Damped wobble, in pixels. Starts at zero exactly when the crawl commits, so
 * there is no visible seam, and returns to zero at the end so the word settles
 * where the static layout puts it.
 */
function settle(t: number): number {
  const snap = clamp01((t - SNAP_START) / (1 - SNAP_START));
  if (snap === 0) return 0;
  return Math.sin(snap * Math.PI * 3) * Math.exp(-snap * 2.6) * 9;
}

/**
 * Should this element animate at all?
 *
 * The curve starts at zero, so anything already on screen when the page loads
 * would render invisible until the user scrolls — a bug, and an accessibility
 * failure. If the element is above the fold at mount, its entrance has already
 * effectively happened: render it settled. Below the fold, arm the animation.
 */
function useArmed(ref: RefObject<HTMLElement | null>): boolean {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { top } = element.getBoundingClientRect();
    setArmed(top > window.innerHeight * 0.92);
  }, [ref]);

  return !reduced && armed;
}

function useKern<T extends HTMLElement>(tightenEm: number) {
  const ref = useRef<T | null>(null);
  const animate = useArmed(ref);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.95", "end 0.35"],
  });

  // Optical spacing: generous while entering, tightened once settled, on the
  // same sluggish-then-snap curve as the words.
  const letterSpacing = useTransform(scrollYProgress, (progress) => {
    const em = 0.06 + (tightenEm - 0.06) * crawl(progress);
    return `${em.toFixed(4)}em`;
  });
  const opacity = useTransform(scrollYProgress, (progress) =>
    clamp01(crawl(progress) * 1.06),
  );

  return {
    ref,
    style: animate ? { letterSpacing, opacity } : undefined,
  };
}

export function ScrollTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, style } = useKern<HTMLHeadingElement>(-0.028);
  return (
    <motion.h1 ref={ref} style={style} className={className}>
      {children}
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
  const { ref, style } = useKern<HTMLHeadingElement>(-0.022);
  return (
    <motion.h2 ref={ref} style={style} className={className}>
      {children}
    </motion.h2>
  );
}

export function ScrollWords({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const animate = useArmed(ref);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.98", "end 0.4"],
  });

  if (!animate) {
    return (
      <p ref={ref} className={className}>
        {text}
      </p>
    );
  }

  const words = text.split(" ");

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

  const opacity = useTransform(progress, (value) =>
    clamp01(crawl(local(value)) * 1.06),
  );
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
      style={{ opacity, y, scaleX, scaleY }}
      className="inline-block origin-bottom"
    >
      {children}
      {"\u00A0"}
    </motion.span>
  );
}

/**
 * A signal line that draws itself as you descend, on the same curve: almost
 * still, then a rush into the last few percent. Pure decoration: `aria-hidden`,
 * no text inside, so it costs a screen-reader user nothing.
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
