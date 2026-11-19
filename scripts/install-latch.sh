#!/bin/sh
# Install latch for the current user.
#
# Works on any POSIX shell: macOS, Debian/ChromeOS Crostini, generic Linux, and
# Termux. Termux gets $PREFIX/bin (already on PATH); everything else gets
# ~/.local/bin, which is the conventional per-user bin that may or may not be
# on PATH — the script tells you if it isn't.
#
#   bun run latch:build
#   sh scripts/install-latch.sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
src="$root/dist-latch/latch.mjs"

if [ ! -f "$src" ]; then
  echo "latch: build first — bun run latch:build" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "latch: node not found on PATH (needs node 18 or newer)" >&2
  exit 1
fi

target="$HOME/.local/bin"
case "${PREFIX:-}" in
  *termux*) target="$PREFIX/bin" ;;
esac

mkdir -p "$target"
cp "$src" "$target/latch.mjs"
chmod 755 "$target/latch.mjs"

# A shim rather than a symlink: symlinks survive git checkouts badly and some
# Android filesystems refuse them outright.
cat > "$target/latch" <<'SHIM'
#!/bin/sh
exec node "$(dirname "$0")/latch.mjs" "$@"
SHIM
chmod 755 "$target/latch"

echo "installed: $target/latch"

case ":$PATH:" in
  *":$target:"*) echo "on PATH — run: latch help" ;;
  *)
    echo "not on PATH yet. add it:"
    echo "  echo 'export PATH=\"$target:\$PATH\"' >> ~/.profile"
    echo "  . ~/.profile"
    ;;
esac

if [ "${PREFIX:-}" ] && echo "$PREFIX" | grep -q termux; then
  echo "termux: for 'latch enroll --clip' install termux-api (pkg install termux-api)"
fi
