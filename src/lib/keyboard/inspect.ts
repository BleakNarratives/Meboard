/**
 * `bun run keyboard ,y teh my qzqz`
 *
 * A terminal window into the repair engine: what it chose, what lost, and the
 * one-line reason it left a word alone. Useful when a typo you expected to be
 * fixed wasn't, and useful when it fixed something you didn't want touched.
 */
import { explainToken } from "./repair";

const tokens = process.argv.slice(2).filter((token) => token.trim().length > 0);

if (tokens.length === 0) {
  console.log("usage: bun run keyboard <token> [token...]");
  console.log("       bun run keyboard ,y teh hellp my qzqz");
  process.exit(0);
}

for (const token of tokens) {
  const explanation = explainToken(token);
  const verdict = explanation.verdict;

  console.log(
    `${token.padEnd(10)} → ${verdict ? verdict.text : "(left alone)"}`,
  );
  console.log(`  ${explanation.reason}`);

  const losers = explanation.considered.filter((entry) => entry !== verdict);
  for (const loser of losers.slice(0, 4)) {
    console.log(
      `  lost: ${loser.text} (${loser.rule}, cost ${loser.cost.toFixed(2)})`,
    );
  }
}
