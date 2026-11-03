/**
 * QWERTY as geometry, not as a hardcoded list of pairs.
 *
 * Everything downstream — which keys are a thumb-slip apart, which way a hit
 * target should grow — is derived from coordinates. That means a different
 * layout (Colemak, a phone grid, the A9 in landscape) is a new table of rows
 * and the rest of the system keeps working.
 *
 * Units: one key width = 1. `y` increases downwards, `x` across. Rows are
 * offset the way a real staggered keyboard is, which is why `m` and `,` are
 * neighbours and why `,y` for `my` is a plausible miss rather than a mystery.
 */
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm,./"] as const;
const ROW_OFFSETS = [0, 0.25, 0.75] as const;

export interface KeySpot {
  key: string;
  x: number;
  y: number;
}

const spots = new Map<string, KeySpot>();
ROWS.forEach((row, rowIndex) => {
  const offset = ROW_OFFSETS[rowIndex] ?? 0;
  [...row].forEach((key, columnIndex) => {
    spots.set(key, { key, x: columnIndex + offset, y: rowIndex });
  });
});

export const KEYS: readonly KeySpot[] = [...spots.values()];

export interface Neighbour {
  key: string;
  distance: number;
}

const neighbourCache = new Map<string, Neighbour[]>();

/** Keys within `maxDistance` key-widths, nearest first. */
export function neighbours(key: string, maxDistance = 1.05): Neighbour[] {
  const cacheKey = `${key}:${maxDistance}`;
  const cached = neighbourCache.get(cacheKey);
  if (cached) return cached;

  const origin = spots.get(key.toLowerCase());
  if (!origin) return [];

  const found = KEYS.filter((other) => other.key !== origin.key)
    .map((other) => ({
      key: other.key,
      distance: Math.hypot(other.x - origin.x, other.y - origin.y),
    }))
    .filter((other) => other.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);

  neighbourCache.set(cacheKey, found);
  return found;
}

/**
 * Unit vector from `from` to `to`, or null when either key is unknown or the
 * two keys sit on top of each other. This is the entire "which way should the
 * target grow" calculation — no per-key tuning, no hand-written directions.
 */
export function unitVector(from: string, to: string): { dx: number; dy: number } | null {
  const a = spots.get(from.toLowerCase());
  const b = spots.get(to.toLowerCase());
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return null;
  return { dx: dx / length, dy: dy / length };
}

export function isKey(value: string): boolean {
  return spots.has(value.toLowerCase());
}
