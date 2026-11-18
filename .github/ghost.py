import pathlib
import sys

# Patch src/latch/cli.ts: add a hidden `ghost` command and its function.
# Anchored by structure rather than line numbers, and it fails loudly instead
# of writing something half-right.

path = pathlib.Path("src/latch/cli.ts")
src = path.read_text(encoding="utf-8")

if 'case "ghost":' in src:
    print("already patched, nothing to do")
    sys.exit(0)

lines = src.split("\n")

try:
    listen_at = next(k for k, line in enumerate(lines) if line.strip() == 'case "listen":')
except StopIteration:
    sys.exit("could not find the listen case")

indent = lines[listen_at][: len(lines[listen_at]) - len(lines[listen_at].lstrip())]

after = listen_at + 1
while after < len(lines) and lines[after].strip() == "":
    after += 1

lines.insert(after + 1, indent + 'case "ghost":')
lines.insert(after + 2, indent + "  return ghost();")

try:
    main_at = next(k for k, line in enumerate(lines) if line.startswith("async function main("))
except StopIteration:
    sys.exit("could not find main()")

function = '''/**
 * The house rule, printed by a machine that may have nothing else left to print
 * it on. Deliberately absent from the help text: it is not a feature, it is the
 * promise the whole tool is built on.
 */
function ghost(): number {
  console.log("latch · ghost");
  console.log("");
  console.log("   .--------------------------.");
  console.log("   |                          |");
  console.log("   |           ______         |");
  console.log("   |                          |");
  console.log("   `--------------------------'");
  console.log("");
  console.log("   the screen is dead. the wire is not.");
  console.log("");
  console.log("   observe only: this machine can read the wire and write text to it,");
  console.log("   and nothing else. it cannot type, click, or run anything, including");
  console.log("   itself. that is the promise, not a gap.");
  return 0;
}
'''

lines[main_at:main_at] = function.split("\n")

path.write_text("\n".join(lines), encoding="utf-8")
print("patched src/latch/cli.ts")
