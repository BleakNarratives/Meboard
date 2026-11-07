#!/usr/bin/env python3
"""
meboard_sherpa.py
-----------------
Bardildo-flavored dir/symbol navigator for Meboard.

Crawls a root path, indexes dirs + Python symbols into SQLite,
fuzzy-searches on demand, logs every query + mistype for the
adaptive RL layer, and returns structured results the screen
viewer or keyboard layer can consume.

USAGE:
  python3 meboard_sherpa.py index ~/RootBase          # crawl & index
  python3 meboard_sherpa.py search "jwt handler"      # find stuff
  python3 meboard_sherpa.py tour ~/RootBase/Unify     # snarky dir tour
  python3 meboard_sherpa.py predict "borde"           # typo → candidates
  python3 meboard_sherpa.py stats                     # what have you been hunting

DB: ~/.meboard/sherpa.db  (auto-created)
"""

import os
import warnings
warnings.filterwarnings("ignore")
import ast
import sys
import json
import sqlite3
import hashlib
import argparse
import textwrap
from pathlib import Path
from datetime import datetime, timezone
from difflib import SequenceMatcher, get_close_matches

# ── config ────────────────────────────────────────────────────────────────────

DB_PATH   = Path.home() / ".meboard" / "sherpa.db"
MAX_DEPTH = 8          # don't crawl into the abyss
SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv",
             ".cargo", ".npm", ".cache", "dist", "build", ".ollama", "tmp", "site-packages", ".gradle"}
SNARK_THRESHOLD = 0.55 # below this similarity → extra commentary

# ── snark layer ───────────────────────────────────────────────────────────────

SNARK_FOUND = [
    "yeah it's right there, you just forgot you made it",
    "found it. classic.",
    "it was here the whole time, champ",
    "oh look who showed up",
    "yep, you built this. probably at 3am.",
]

SNARK_VAGUE = [
    "that's a loose query but sure, let's go fishing",
    "casting a wide net with that one",
    "you know you could be more specific, right? anyway —",
    "broad strokes. i respect it.",
]

SNARK_NOTHING = [
    "doesn't exist. yet. (or you named it something unhinged)",
    "nope. either you didn't build it or you called it something else entirely",
    "clean miss. check your spelling or your life choices",
    "not found. the database is not gaslighting you.",
]

SNARK_TOUR = [
    "alright, here's what you apparently decided to build here:",
    "inventory of choices you made and then forgot about:",
    "the tour nobody asked for:",
    "contents of this directory, presented without judgment:",
]

import random
def snark(pool): return random.choice(pool)

# ── db setup ──────────────────────────────────────────────────────────────────

def init_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS dirs (
            id        INTEGER PRIMARY KEY,
            path      TEXT UNIQUE,
            depth     INTEGER,
            file_count INTEGER DEFAULT 0,
            indexed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS symbols (
            id        INTEGER PRIMARY KEY,
            filepath  TEXT,
            kind      TEXT,       -- 'class' | 'func' | 'var' | 'import'
            name      TEXT,
            lineno    INTEGER,
            docstring TEXT,
            indexed_at TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
            name, filepath, kind, docstring,
            content='symbols', content_rowid='id'
        );

        CREATE TABLE IF NOT EXISTS search_log (
            id        INTEGER PRIMARY KEY,
            query     TEXT,
            timestamp TEXT,
            result_count INTEGER,
            top_hit   TEXT
        );

        CREATE TABLE IF NOT EXISTS typo_log (
            id         INTEGER PRIMARY KEY,
            raw_input  TEXT,
            corrected  TEXT,
            confidence REAL,
            timestamp  TEXT
        );

        CREATE TABLE IF NOT EXISTS predictions (
            prefix     TEXT,
            candidate  TEXT,
            weight     REAL DEFAULT 1.0,
            PRIMARY KEY (prefix, candidate)
        );
    """)
    conn.commit()
    return conn


# ── indexing ──────────────────────────────────────────────────────────────────

def extract_symbols(filepath: Path) -> list[dict]:
    """AST walk a .py file and pull classes, functions, top-level vars."""
    results = []
    try:
        src = filepath.read_text(errors="replace")
        tree = ast.parse(src, filename=str(filepath))
    except Exception:
        return results

    for node in ast.walk(tree):
        entry = None
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            doc = ast.get_docstring(node) or ""
            entry = dict(kind="func", name=node.name,
                         lineno=node.lineno, docstring=doc[:200])
        elif isinstance(node, ast.ClassDef):
            doc = ast.get_docstring(node) or ""
            entry = dict(kind="class", name=node.name,
                         lineno=node.lineno, docstring=doc[:200])
        if entry:
            entry["filepath"] = str(filepath)
            results.append(entry)
    return results


def index_tree(root: Path, conn: sqlite3.Connection, verbose=True):
    root = root.resolve()
    now  = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    dirs_added = syms_added = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith('pip-install')]
        dp = Path(dirpath)
        depth = len(dp.relative_to(root).parts)
        if depth > MAX_DEPTH:
            dirnames.clear()
            continue

        py_files = [f for f in filenames if f.endswith(".py")]
        rel = str(dp.relative_to(root))

        conn.execute("""
            INSERT INTO dirs (path, depth, file_count, indexed_at)
            VALUES (?,?,?,?)
            ON CONFLICT(path) DO UPDATE SET
                depth=excluded.depth,
                file_count=excluded.file_count,
                indexed_at=excluded.indexed_at
        """, (str(dp), depth, len(filenames), now))
        dirs_added += 1

        for fname in py_files:
            fp = dp / fname
            syms = extract_symbols(fp)
            conn.execute("DELETE FROM symbols WHERE filepath=?", (str(fp),))
            for s in syms:
                conn.execute("""
                    INSERT INTO symbols (filepath, kind, name, lineno, docstring, indexed_at)
                    VALUES (?,?,?,?,?,?)
                """, (s["filepath"], s["kind"], s["name"],
                      s["lineno"], s["docstring"], now))
                syms_added += 1

        if verbose and dirs_added % 50 == 0:
            print(f"  {dirs_added} dirs indexed...", end="\r")

    # rebuild FTS
    conn.execute("INSERT INTO symbols_fts(symbols_fts) VALUES('rebuild')")
    conn.commit()
    if verbose:
        print(f"\n  indexed {dirs_added} dirs, {syms_added} symbols into {DB_PATH}")


# ── search ────────────────────────────────────────────────────────────────────

def fuzzy_score(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def search(query: str, conn: sqlite3.Connection, limit=10) -> list[dict]:
    results = []
    q_lower = query.lower().strip()

    # 1. FTS on symbols
    try:
        rows = conn.execute("""
            SELECT s.filepath, s.kind, s.name, s.lineno, s.docstring
            FROM symbols_fts f
            JOIN symbols s ON s.id = f.rowid
            WHERE symbols_fts MATCH ?
            LIMIT ?
        """, (q_lower + "*", limit)).fetchall()
        for r in rows:
            results.append(dict(source="symbol", filepath=r[0], kind=r[1],
                                name=r[2], lineno=r[3], docstring=r[4],
                                score=1.0))
    except Exception:
        pass

    # 2. fuzzy dir match if FTS thin
    if len(results) < 3:
        dirs = conn.execute("SELECT path FROM dirs").fetchall()
        for (p,) in dirs:
            basename = Path(p).name
            score = fuzzy_score(q_lower, basename)
            if score > 0.4:
                results.append(dict(source="dir", path=p,
                                    name=basename, score=score))

    # 3. fuzzy symbol name fallback
    if len(results) < 3:
        syms = conn.execute("SELECT filepath, kind, name, lineno FROM symbols").fetchall()
        for filepath, kind, name, lineno in syms:
            score = fuzzy_score(q_lower, name)
            if score > SNARK_THRESHOLD:
                results.append(dict(source="symbol", filepath=filepath,
                                    kind=kind, name=name, lineno=lineno,
                                    score=score))

    results.sort(key=lambda x: x["score"], reverse=True)
    results = results[:limit]

    # log it
    top = results[0]["name"] if results else None
    conn.execute("""
        INSERT INTO search_log (query, timestamp, result_count, top_hit)
        VALUES (?,?,?,?)
    """, (query, datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), len(results), top))
    conn.commit()
    if results:
        _learn_prediction(q_lower, results[0]["name"], conn)

    return results


def _learn_prediction(prefix: str, full: str, conn: sqlite3.Connection):
    """Bump prediction weight for prefix→full."""
    for n in range(2, min(len(prefix)+1, 8)):
        p = prefix[:n].lower()
        conn.execute("""
            INSERT INTO predictions (prefix, candidate, weight) VALUES (?,?,1.0)
            ON CONFLICT(prefix, candidate) DO UPDATE SET weight = weight + 0.5
        """, (p, full))
    conn.commit()


# ── predictive text ───────────────────────────────────────────────────────────

def predict(prefix: str, conn: sqlite3.Connection, top=5) -> list[dict]:
    p = prefix.lower().strip()

    # DB-learned predictions first
    db_preds = conn.execute("""
        SELECT candidate, weight FROM predictions
        WHERE prefix = ?
        ORDER BY weight DESC LIMIT ?
    """, (p, top)).fetchall()

    # fuzzy symbol name fallback
    names = [r[0] for r in conn.execute(
        "SELECT DISTINCT name FROM symbols WHERE length(name) BETWEEN 3 AND 40").fetchall()]
    close = get_close_matches(p, names, n=top, cutoff=0.5)

    merged = {c: w for c, w in db_preds}
    for c in close:
        merged.setdefault(c, 0.5)

    ranked = sorted(merged.items(), key=lambda x: x[1], reverse=True)[:top]

    # log typo if input looks like a mistype
    if ranked and not ranked[0][0].lower().startswith(p) and fuzzy_score(p, ranked[0][0]) < 0.9:
        conn.execute("""
            INSERT INTO typo_log (raw_input, corrected, confidence, timestamp)
            VALUES (?,?,?,?)
        """, (p, ranked[0][0], ranked[0][1], datetime.now(timezone.utc).replace(tzinfo=None).isoformat()))
        conn.commit()

    return [dict(candidate=c, weight=w) for c, w in ranked]


# ── tour mode ─────────────────────────────────────────────────────────────────

def tour(dirpath: str, conn: sqlite3.Connection) -> dict:
    dp = Path(dirpath).resolve()
    if not dp.exists():
        return dict(error=f"path doesn't exist: {dp}")

    subdirs   = [d for d in dp.iterdir() if d.is_dir() and d.name not in SKIP_DIRS]
    py_files  = list(dp.glob("*.py"))
    all_files = list(dp.iterdir())

    # pull symbols for this dir's .py files
    symbols = []
    for pf in py_files:
        rows = conn.execute("""
            SELECT kind, name, lineno FROM symbols WHERE filepath = ?
            ORDER BY lineno
        """, (str(pf),)).fetchall()
        symbols.extend([dict(file=pf.name, kind=r[0], name=r[1], lineno=r[2])
                        for r in rows])

    # learn from the tour
    for d in subdirs:
        _learn_prediction(d.name, d.name, conn)

    return dict(
        path       = str(dp),
        subdirs    = [d.name for d in sorted(subdirs)],
        py_files   = [f.name for f in sorted(py_files)],
        file_count = len(all_files),
        symbols    = symbols[:50],
        commentary = snark(SNARK_TOUR),
    )


# ── stats ─────────────────────────────────────────────────────────────────────

def stats(conn: sqlite3.Connection) -> dict:
    n_dirs   = conn.execute("SELECT COUNT(*) FROM dirs").fetchone()[0]
    n_syms   = conn.execute("SELECT COUNT(*) FROM symbols").fetchone()[0]
    n_logs   = conn.execute("SELECT COUNT(*) FROM search_log").fetchone()[0]
    n_typos  = conn.execute("SELECT COUNT(*) FROM typo_log").fetchone()[0]
    top10    = conn.execute("""
        SELECT query, COUNT(*) c FROM search_log
        GROUP BY query ORDER BY c DESC LIMIT 10
    """).fetchall()
    return dict(dirs=n_dirs, symbols=n_syms,
                searches=n_logs, typos_caught=n_typos,
                top_queries=[dict(query=q, count=c) for q, c in top10])


# ── output helpers ────────────────────────────────────────────────────────────

def _print_results(results: list[dict], query: str):
    if not results:
        print(f"\n  {snark(SNARK_NOTHING)}\n")
        return

    max_score = results[0].get("score", 1)
    if max_score < SNARK_THRESHOLD:
        print(f"\n  {snark(SNARK_VAGUE)}")
    else:
        print(f"\n  {snark(SNARK_FOUND)}")

    print()
    for i, r in enumerate(results, 1):
        if r["source"] == "symbol":
            loc = f"{Path(r['filepath']).name}:{r.get('lineno','?')}"
            print(f"  {i:2}. [{r['kind']:5}] {r['name']:30} {loc}")
            if r.get("docstring"):
                doc = r["docstring"].split("\n")[0][:60]
                print(f"       \"{doc}\"")
        elif r["source"] == "dir":
            print(f"  {i:2}. [dir  ] {r['name']:30} {r['path']}")
        print()


def _print_tour(t: dict):
    if "error" in t:
        print(f"\n  {t['error']}\n")
        return
    print(f"\n  {t['commentary']}\n")
    print(f"  PATH: {t['path']}")
    print(f"  {t['file_count']} items total\n")
    if t["subdirs"]:
        print(f"  DIRS ({len(t['subdirs'])}):")
        for d in t["subdirs"]:
            print(f"    📁  {d}")
    if t["py_files"]:
        print(f"\n  PYTHON FILES ({len(t['py_files'])}):")
        for f in t["py_files"]:
            print(f"    🐍  {f}")
    if t["symbols"]:
        print(f"\n  SYMBOLS (first 20):")
        for s in t["symbols"][:20]:
            print(f"    {'fn' if s['kind']=='func' else s['kind']:5}  {s['name']}  ({s['file']}:{s['lineno']})")
    print()


def _print_predictions(preds: list[dict], prefix: str):
    if not preds:
        print(f"\n  no predictions for '{prefix}' yet. keep typing.\n")
        return
    print(f"\n  predictions for '{prefix}':\n")
    for p in preds:
        bar = "█" * int(p["weight"] * 2)
        print(f"  {p['candidate']:30} {bar} ({p['weight']:.1f})")
    print()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Meboard Sherpa — dir/symbol navigator with adaptive RL logging",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
            examples:
              python3 meboard_sherpa.py index ~/RootBase
              python3 meboard_sherpa.py search "jwt handler"
              python3 meboard_sherpa.py tour ~/RootBase/Unify
              python3 meboard_sherpa.py predict "borde"
              python3 meboard_sherpa.py stats
        """)
    )
    ap.add_argument("command", choices=["index","search","tour","predict","stats"])
    ap.add_argument("arg", nargs="?", help="path, query, or prefix depending on command")
    ap.add_argument("--db", default=str(DB_PATH), help=f"sqlite db path (default: {DB_PATH})")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--json", action="store_true", help="output raw JSON")
    args = ap.parse_args()

    conn = init_db(Path(args.db))

    if args.command == "index":
        root = Path(args.arg or ".").expanduser()
        print(f"indexing {root} ...")
        index_tree(root, conn)

    elif args.command == "search":
        if not args.arg:
            ap.error("search requires a query")
        results = search(args.arg, conn, limit=args.limit)
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            _print_results(results, args.arg)

    elif args.command == "tour":
        t = tour(args.arg or ".", conn)
        if args.json:
            print(json.dumps(t, indent=2))
        else:
            _print_tour(t)

    elif args.command == "predict":
        if not args.arg:
            ap.error("predict requires a prefix")
        preds = predict(args.arg, conn, top=args.limit)
        if args.json:
            print(json.dumps(preds, indent=2))
        else:
            _print_predictions(preds, args.arg)

    elif args.command == "stats":
        s = stats(conn)
        if args.json:
            print(json.dumps(s, indent=2))
        else:
            print(f"\n  dirs indexed:   {s['dirs']}")
            print(f"  symbols:        {s['symbols']}")
            print(f"  searches run:   {s['searches']}")
            print(f"  typos caught:   {s['typos_caught']}")
            if s["top_queries"]:
                print(f"\n  top queries:")
                for q in s["top_queries"]:
                    print(f"    {q['query']:30} x{q['count']}")
            print()

    conn.close()


if __name__ == "__main__":
    main()
