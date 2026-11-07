/**
 * Word-wise text surgery.
 *
 * `split(word).join(replacement)` rewrites the word inside every longer word —
 * fixing "he" mangles "the". These helpers operate on whitespace tokens only,
 * which is also how the repair engine sees text, so the two stay consistent.
 */
export function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function lastWord(text: string): string {
  const match = /([^\s]+)$/.exec(text);
  return match ? match[1] : "";
}

export function replaceWord(text: string, word: string, replacement: string): string {
  if (word.length === 0) return text;
  return text
    .split(/(\s+)/)
    .map((part) => (part === word ? replacement : part))
    .join("");
}
