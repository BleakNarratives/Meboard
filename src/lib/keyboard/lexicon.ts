/**
 * A deliberately small lexicon, ordered by frequency.
 *
 * This is not a language model and is not trying to be. Reductive prediction
 * means: start with every candidate, prune by hard constraints, and only keep
 * what survives. A list this size is enough to prove the pruning order works,
 * and it stays cheap enough to run on every keystroke on a tablet from 2024.
 *
 * Order matters: earlier entries win ties, so `the` beats `teh`'s alternatives
 * and `my` beats anything a stray punctuation mark could produce.
 */
export const LEXICON: readonly string[] = [
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "it",
  "for", "not", "on", "with", "you", "do", "at", "this", "but", "by",
  "from", "they", "we", "say", "she", "or", "an", "will", "my", "one",
  "all", "would", "there", "their", "what", "so", "up", "out", "if", "about",
  "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
  "no", "just", "know", "take", "people", "into", "year", "your", "good", "some",
  "could", "them", "see", "other", "than", "then", "now", "look", "only", "come",
  "its", "it's", "over", "think", "also", "back", "after", "use", "two", "how",
  "our", "work", "first", "well", "way", "even", "new", "want", "because", "any",
  "these", "give", "day", "most", "us", "is", "are", "was", "were", "been",
  "has", "had", "did", "does", "going", "got", "right", "thing", "thanks", "please",
  "sorry", "help", "need", "here", "where", "why", "yes", "okay", "maybe", "really",
  "still", "again", "never", "always", "something", "nothing", "everything", "because", "through", "though",
  "meboard", "keyhole", "chromebook", "chromebox", "tablet", "samsung", "motorola", "keyboard", "screen", "convex",
  "github", "repo", "code", "terminal", "linux", "browser", "chrome", "android", "wifi", "share",
  "sharing", "text", "copy", "paste", "password", "email", "account", "sign", "log", "host",
];

const rank = new Map<string, number>();
LEXICON.forEach((word, index) => {
  if (!rank.has(word)) rank.set(word, index);
});

export function isWord(token: string): boolean {
  return rank.has(token);
}

/** Lower is more frequent. Unknown words rank worse than every known one. */
export function rankOf(token: string): number {
  return rank.get(token) ?? Number.MAX_SAFE_INTEGER;
}
