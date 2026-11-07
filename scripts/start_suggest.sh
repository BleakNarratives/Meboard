#!/data/data/com.termux/files/usr/bin/bash
D="$(cd "$(dirname "$0")/.." && pwd)"
PID="$HOME/.meboard/suggest.pid"
case "$1" in
  stop) [ -f "$PID" ] && kill "$(cat "$PID")" && rm -f "$PID" && echo stopped ;;
  *) mkdir -p "$HOME/.meboard"
     nohup python3 "$D/modules/navigation/meboard_suggest.py" serve "${2:-8765}" >"$HOME/.meboard/suggest.log" 2>&1 &
     echo $! > "$PID"; echo "started pid $(cat "$PID") on 127.0.0.1:${2:-8765}" ;;
esac
