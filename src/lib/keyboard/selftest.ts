/**
 * Executable spec for the keyboard brain: `bun src/lib/keyboard/selftest.ts`.
 *
 * Two properties matter more than any individual repair:
 *   - it never rewrites a word you actually typed, and
 *   - a hit target never oscillates.
 */
import {
  COOLDOWN_SESSIONS,
  MAX_OFFSET,
  emptyMemory,
  offsetFor,
  parseMemory,
  recordMiss,
} from "./adapt";
import { neighbours } from "./layout";
import { explainToken, repairToken } from "./repair";

const failures: string[] = [];
let checks = 0;

function check(name: string, condition: boolean) {
  checks += 1;
  if (!condition) failures.push(name);
}

function equal<T>(name: string, actual: T, expected: T) {
  checks += 1;
  if (actual !== expected) {
    failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

// --- geometry ---------------------------------------------------------------

{
  const m = neighbours("m").map((entry) => entry.key);
  check("comma is a neighbour of m", m.includes(","));
  check("m and n are neighbours", m.includes("n"));
  check("m and p are not neighbours", !m.includes("p"));
}

// --- repairs ----------------------------------------------------------------

{
  const quip = repairToken(",y");
  equal(",y becomes my", quip?.text, "my");
  equal("and by the punctuation rule", quip?.rule, "punctuation");
}

{
  const pair = repairToken(",y")?.pair;
  equal("the repair knows the intended key", pair?.intended, "m");
  equal("and the key that was actually hit", pair?.hit, ",");

  const slip = repairToken("gitgub")?.pair;
  equal("adjacent slips report a pair too", slip?.intended, "h");
  equal("transpositions do not", repairToken("teh")?.pair, undefined);
}

{
  equal("teh becomes the", repairToken("teh")?.text, "the");
  equal("teh is a transposition", repairToken("teh")?.rule, "transpose");
}

{
  equal("hellp becomes help", repairToken("hellp")?.text, "help");
  equal("hellp is a collapsed double", repairToken("hellp")?.rule, "collapse");
}

{
  equal("gitgub becomes github", repairToken("gitgub")?.text, "github");
  equal("gitgub is an adjacent slip", repairToken("gitgub")?.rule, "adjacent");
}

{
  equal("a real word is left alone", repairToken("my"), null);
  equal("a domain word is left alone", repairToken("meboard"), null);
  equal("nonsense is left alone", repairToken("qzqz"), null);
  equal("single letters are left alone", repairToken("a"), null);
  equal("numbers are left alone", repairToken("1234"), null);
  equal("empty input is left alone", repairToken(""), null);
}

// --- the engine can explain itself ------------------------------------------

{
  const explained = explainToken(",y");
  equal("explain agrees with the verdict", explained.verdict?.text, "my");
  equal("explain keeps the runner-up list", explained.considered[0]?.text, "my");
  check("explain states why it won", explained.reason.includes("punctuation"));

  const known = explainToken("my");
  equal("explain leaves a real word alone", known.verdict, null);
  check("explain says why", known.reason.includes("known word"));

  const nonsense = explainToken("qzqz");
  equal("explain reports nothing viable", nonsense.considered.length, 0);
  check("explain says why not", nonsense.reason.length > 0);
}

// --- adaptation -------------------------------------------------------------

{
  let memory = emptyMemory();
  for (let session = 1; session <= 2; session += 1) {
    memory = recordMiss(memory, { intended: "m", hit: ",", session });
  }
  equal("two sessions is not evidence enough", offsetFor(memory, "m").dx, 0);

  memory = recordMiss(memory, { intended: "m", hit: ",", session: 3 });
  check("third session moves the target", offsetFor(memory, "m").dx > 0);
}

{
  let memory = emptyMemory();
  for (let i = 0; i < 5; i += 1) {
    memory = recordMiss(memory, { intended: "m", hit: ",", session: 7 });
  }
  equal("one bad sitting counts once", offsetFor(memory, "m").dx, 0);
}

{
  let memory = emptyMemory();
  for (let session = 1; session <= 3; session += 1) {
    memory = recordMiss(memory, { intended: "m", hit: ",", session });
  }
  const moved = offsetFor(memory, "m").dx;

  for (let session = 4; session <= 6; session += 1) {
    memory = recordMiss(memory, { intended: "m", hit: ",", session });
  }
  equal("cooldown holds the key still", offsetFor(memory, "m").dx, moved);

  memory = recordMiss(memory, { intended: "m", hit: ",", session: 7 });
  check("cooled key can move again", offsetFor(memory, "m").dx > moved);
}

{
  let memory = emptyMemory();
  for (let session = 1; session <= 3; session += 1) {
    memory = recordMiss(memory, { intended: "m", hit: ",", session });
  }
  const movedRight = offsetFor(memory, "m").dx;

  // The user overcorrects and starts hitting `n` instead. A reversal has to
  // out-argue a decision already paid for, so three sessions isn't enough.
  for (let session = 4; session <= 6; session += 1) {
    memory = recordMiss(memory, { intended: "m", hit: "n", session });
  }
  equal("three sessions cannot reverse a move", offsetFor(memory, "m").dx, movedRight);

  for (let session = 7; session <= 9; session += 1) {
    memory = recordMiss(memory, { intended: "m", hit: "n", session });
  }
  check("six sessions can", offsetFor(memory, "m").dx < movedRight);
}

{
  let memory = emptyMemory();
  for (let session = 1; session <= 400; session += 1) {
    memory = recordMiss(memory, { intended: "m", hit: ",", session });
  }
  const offset = offsetFor(memory, "m");
  check("displacement is capped", Math.abs(offset.dx) <= MAX_OFFSET + 1e-9);
  check("cap is respected on both axes", Math.abs(offset.dy) <= MAX_OFFSET + 1e-9);
}

{
  let memory = emptyMemory();
  memory = recordMiss(memory, { intended: "m", hit: "m", session: 1 });
  equal("hitting the right key changes nothing", offsetFor(memory, "m").dx, 0);
  check("cooldown constant is sane", COOLDOWN_SESSIONS >= 2);
}

// --- hostile storage --------------------------------------------------------

{
  check("null memory is empty", Object.keys(parseMemory(null).keys).length === 0);
  check(
    "a string is not a notebook",
    Object.keys(parseMemory("moved").keys).length === 0,
  );

  const clamped = parseMemory({ keys: { m: { offset: { dx: 99, dy: 0 } } } });
  equal(
    "stored offsets are clamped to the cap",
    clamped.keys.m?.offset.dx,
    MAX_OFFSET,
  );

  const mixed = parseMemory({
    keys: {
      m: { offset: { dx: 0.04, dy: 0 }, strikes: 2, lastSession: 3, movedAt: 0 },
      evil: { offset: "left" },
      "": { offset: { dx: 1, dy: 1 } },
    },
  });
  check("valid entries survive", mixed.keys.m?.offset.dx === 0.04);
  check("broken entries are dropped", !("evil" in mixed.keys));
  check("empty keys are dropped", !("" in mixed.keys));
}

// --- report ----------------------------------------------------------------

if (failures.length === 0) {
  console.log(`keyboard: ${checks} checks passed`);
} else {
  console.error(`keyboard: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
}
