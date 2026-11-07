#!/usr/bin/env python3
"""
meboard_suggest.py -- suggestion strip over the sherpa DB.
  python3 meboard_suggest.py suggest "def improt"
  python3 meboard_suggest.py accept improt import
  python3 meboard_suggest.py serve [port]     # 127.0.0.1 only
HTTP:  GET /suggest?q=pre&n=5     POST /accept {"raw":"..","chosen":".."}
"""
import re, sys, json, math, sqlite3
from pathlib import Path
from difflib import get_close_matches, SequenceMatcher
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

DB = Path.home() / ".meboard" / "sherpa.db"

def db():
    c = sqlite3.connect(DB)
    c.execute("CREATE INDEX IF NOT EXISTS idx_sym_name ON symbols(name COLLATE NOCASE)")
    return c

def last_token(q):
    toks = [t for t in re.split(r"[^\w]+", q.strip()) if t]
    return toks[-1].lower() if toks else ""

def suggest(q, n=5):
    p = last_token(q)
    if len(p) < 2:
        return []
    c = db()
    learned = dict(c.execute(
        "SELECT candidate, weight FROM predictions WHERE prefix=?", (p,)).fetchall())
    like = p.replace("%", "\\%").replace("_", "\\_") + "%"
    rows = c.execute(
        "SELECT name, kind, COUNT(*) FROM symbols WHERE name LIKE ? ESCAPE '\\' "
        "GROUP BY name ORDER BY COUNT(*) DESC LIMIT 30", (like,)).fetchall()
    out = {}
    for name, kind, cnt in rows:
        out[name] = dict(text=name, kind=kind, via="prefix",
                         score=1.0 + math.log1p(cnt) + 2.0 * learned.get(name, 0))
    for name, w in learned.items():
        if name not in out:
            out[name] = dict(text=name, kind="learned", via="learned", score=2.0 * w)
    if len(out) < n:
        names = [r[0] for r in c.execute(
            "SELECT DISTINCT name FROM symbols WHERE length(name) BETWEEN ? AND ? LIMIT 8000",
            (max(2, len(p) - 2), len(p) + 8)).fetchall()]
        for name in get_close_matches(p, names, n=n, cutoff=0.6):
            out.setdefault(name, dict(text=name, kind="fuzzy", via="fuzzy", score=0.5))
    c.close()
    return sorted(out.values(), key=lambda x: x["score"], reverse=True)[:n]

def accept(raw, chosen):
    raw, chosen = raw.lower(), chosen.lower()
    c = db()
    for k in range(2, min(len(chosen), 8) + 1):
        c.execute("INSERT INTO predictions (prefix, candidate, weight) VALUES (?,?,1.0) "
                  "ON CONFLICT(prefix, candidate) DO UPDATE SET weight = weight + 0.5",
                  (chosen[:k], chosen))
    typo = (not chosen.startswith(raw)) and SequenceMatcher(None, raw, chosen).ratio() >= 0.6
    if typo:
        c.execute("INSERT INTO typo_log (raw_input, corrected, confidence, timestamp) "
                  "VALUES (?,?,1.0,datetime('now'))", (raw, chosen))
    c.commit(); c.close()
    return dict(ok=True, typo_logged=typo)

class H(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self._cors()
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path)
        if u.path != "/suggest":
            return self._send(dict(error="not found"), 404)
        qs = parse_qs(u.query)
        q = qs.get("q", [""])[0]
        n = int(qs.get("n", ["5"])[0])
        self._send(suggest(q, n))
    def do_POST(self):
        if self.path != "/accept":
            return self._send(dict(error="not found"), 404)
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        self._send(accept(body.get("raw", ""), body.get("chosen", "")))
    def _cors(self):
        o = self.headers.get("Origin", "")
        if re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", o):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def log_message(self, *a): pass

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "suggest":
        print(json.dumps(suggest(sys.argv[2]), indent=2))
    elif cmd == "accept":
        print(json.dumps(accept(sys.argv[2], sys.argv[3])))
    elif cmd == "serve":
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
        print(f"suggest strip on http://127.0.0.1:{port}")
        HTTPServer(("127.0.0.1", port), H).serve_forever()
    else:
        print(__doc__)
