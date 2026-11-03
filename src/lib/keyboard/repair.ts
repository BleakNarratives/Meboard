import { isWord, rankOf } from "./lexicon";
import { neighbours } from "./layout";

/**
 * Reductive repair: assume everything, then eliminate.
 *
 * A token is only rewritten when a cheaper explanation than "you meant that"
 * survives every constraint, in this order:
 *
 *    1. punctuation where a letter belongs   ",y" -> "my"
 *    2. transposition                        "teh" -> "the"
 *    3. a collapsed double letter            "hellp" -> "help"
 *    4. one key slipped to a neighbour       "gitgub" -> "github"
 *
 * Costs are in key-widths, so rule 1 and 2 beat rule 4 without anyone having to
 * tune weights. If nothing wins, the answer is `null` — the keyboard says
 * nothing and lets you type, which is the correct failure mode for a tool that
 * is supposed to be helpful rather than correct.
 *
 * Note what is deliberately absent: no user-history bonus, no model, no
 * "confidence". Those belong above this layer, where they can be refused.
 */
export type RepairRule = "punctuation" | "transpose" | "collapse" | "adjacent";

export interface Repair {
  text: string;
  rule: RepairRule;
  /** Lower is more certain. Roughly: distance in key widths. */
  cost: number;
  /**
   * The physical slip behind the repair, when there is one: which key the
   * thumb was aiming for and which one it actually hit. This is what feeds
   * hit-target adaptation — the repair layer knows *why*, so the keyboard
   * doesn't have to guess from a before/after diff.
   */
  pair?: { intended: string; hit: string };
}

const MAX_TOKEN = 24;

export interface Explanation {
  token: string;
  verdict: Repair | null;
  /** Everything that was considered, best first. The audit trail. */
  considered: Repair[];
  /** One line a human can read: why it did, or didn't, touch the word. */
  reason: string;
}

/**
 * The same decision as `repairToken`, with its working shown.
 *
 * "The keyboard left my typo alone" is the least satisfying thing a helpful
 * tool can do silently. This makes the silence explainable — from the lab, from
 * a terminal, and later from a settings screen — without changing the verdict.
 */
export function explainToken(raw: string): Explanation {
  const token = raw.trim().toLowerCase();
  if (token.length === 0) {
    return { token, verdict: null, considered: [], reason: "nothing to look at" };
  }
  if (token.length > MAX_TOKEN) {
    return { token, verdict: null, considered: [], reason: "too long to be a word" };
  }
  if (isWord(token)) {
    return {
      token,
      verdict: null,
      considered: [],
      reason: "known word — never rewritten",
    };
  }
  if (token.length < 2) {
    return {
      token,
      verdict: null,
      considered: [],
      reason: "single character — never rewritten",
    };
  }

  const considered = candidatesFor(token);
  const verdict = considered[0] ?? null;
  return {
    token,
    verdict,
    considered,
    reason: verdict
      ? `${verdict.rule} won at cost ${verdict.cost.toFixed(2)}`
      : "no rule produced a known word",
  };
}

export function repairToken(raw: string): Repair | null {
  return explainToken(raw).verdict;
}

function candidatesFor(token: string): Repair[] {
  const candidates: Repair[] = [];

  // 1. A separator pressed where a letter belongs. `,` sits next to `m`, which
  // is exactly why ",y" happens and exactly why this is rule one.
  const separator = /^([,.'/])([a-z]+)$/.exec(token);
  if (separator) {
    const [, mark, rest] = separator;
    for (const neighbour of neighbours(mark)) {
      if (!/[a-z]/.test(neighbour.key)) continue;
      const attempt = neighbour.key + rest;
      if (isWord(attempt)) {
        candidates.push({
          text: attempt,
          rule: "punctuation",
          cost: neighbour.distance,
          pair: { intended: neighbour.key, hit: mark },
        });
      }
    }
  }

  if (/^[a-z]+$/.test(token)) {
    // 2. Two letters out of order.
    for (let i = 0; i < token.length - 1; i += 1) {
      if (token[i] === token[i + 1]) continue;
      const swapped =
        token.slice(0, i) + token[i + 1] + token[i] + token.slice(i + 2);
      if (isWord(swapped)) {
        candidates.push({ text: swapped, rule: "transpose", cost: 0.9 });
      }
    }

    // 3. One letter too many, doubled.
    for (let i = 0; i < token.length - 1; i += 1) {
      if (token[i] !== token[i + 1]) continue;
      const collapsed = token.slice(0, i) + token.slice(i + 1);
      if (isWord(collapsed)) {
        candidates.push({ text: collapsed, rule: "collapse", cost: 1 });
      }
    }

    // 4. A thumb that landed one key over.
    for (let i = 0; i < token.length; i += 1) {
      for (const neighbour of neighbours(token[i])) {
        if (!/[a-z]/.test(neighbour.key)) continue;
        const attempt =
          token.slice(0, i) + neighbour.key + token.slice(i + 1);
        if (isWord(attempt)) {
          candidates.push({
            text: attempt,
            rule: "adjacent",
            cost: 1 + neighbour.distance * 0.1,
            pair: { intended: neighbour.key, hit: token[i] },
          });
        }
      }
    }
  }

  if (candidates.length === 0) return [];

  // Same word can arrive from two rules; keep the cheapest explanation and
  // drop the echo.
  const best = new Map<string, Repair>();
  for (const candidate of candidates) {
    const previous = best.get(candidate.text);
    if (!previous || candidate.cost < previous.cost) {
      best.set(candidate.text, candidate);
    }
  }

  return [...best.values()].sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    const byFrequency = rankOf(a.text) - rankOf(b.text);
    if (byFrequency !== 0) return byFrequency;
    return a.text.localeCompare(b.text);
  });
}
