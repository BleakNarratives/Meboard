import { useRef, type ReactNode } from "react";
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
 * Three rules keep this from becoming the thing that ruins a page:
 *
 *   1. **Reduced motion renders flat text.** Not a slower version — no split
 *      words, no transform, one honest paragraph. Screen readers and vestibular
 *      users get the copy, not an animation.
 *   2. **Nothing ends below full opacity.** The finished state is always
 *      readable; the motion is the entrance, never the resting state.
 *   3. **Text is never split below the word.** Letters fragment selection,
 *      translation and pronunciation, so only whole words animate. Kerning is
 *      applied to the *element*, which is one string the whole way through.
 */

function useKern<T extends HTMLElement>(tighten = "-0.025em") {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.95", "end 0.35"],
  });

  // Optical spacing: generous while entering, tightened once settled, which is
  // what a type-setter would do by hand.
  const letterSpacing = useTransform(scrollYProgress, [0, 1], ["0.06em", tighten]);
  const opacity = useTransform(scrollYProgress, [0, 0.55], [0.45, 1]);

  return {
    ref,
    style: reduced ? undefined : { letterSpacing, opacity },
  };
}

export function ScrollTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, style } = useKern<HTMLHeadingElement>();
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
  const { ref, style } = useKern<HTMLHeadingElement>("-0.02em");
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
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.98", "end 0.5"],
  });

  if (reduced) {
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
  const end = Math.min(1, start + 0.4);
  const opacity = useTransform(progress, [start, end], [0.16, 1]);
  const y = useTransform(progress, [start, end], [10, 0]);

  return (
    <motion.span style={{ opacity, y }} className="inline-block">
      {children}
      {"\u00A0"}
    </motion.span>
  );
}

/**
 * A signal line that draws itself as you descend. Pure decoration: `aria-hidden`
 * and no text inside, so it costs a screen-reader user nothing.
 */
export function SignalLine() {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.45"],
  });
  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);

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
