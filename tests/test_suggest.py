import os, sys, sqlite3, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "modules" / "navigation"))
import meboard_suggest as ms

SCHEMA = """
CREATE TABLE symbols (id INTEGER PRIMARY KEY, filepath TEXT, kind TEXT, name TEXT, lineno INTEGER, docstring TEXT, indexed_at TEXT);
CREATE TABLE typo_log (id INTEGER PRIMARY KEY, raw_input TEXT, corrected TEXT, confidence REAL, timestamp TEXT);
CREATE TABLE predictions (prefix TEXT, candidate TEXT, weight REAL DEFAULT 1.0, PRIMARY KEY (prefix, candidate));
"""

class TestSuggest(unittest.TestCase):
    def setUp(self):
        fd, p = tempfile.mkstemp(suffix=".db"); os.close(fd)
        self.path = Path(p)
        c = sqlite3.connect(self.path); c.executescript(SCHEMA)
        for n in ("jwt_handler", "jerry_matrix", "search", "index"):
            c.execute("INSERT INTO symbols (name, kind) VALUES (?, 'func')", (n,))
        c.commit(); c.close()
        self._old, ms.DB = ms.DB, self.path

    def tearDown(self):
        ms.DB = self._old
        self.path.unlink(missing_ok=True)

    def test_prefix_beats_fuzzy(self):
        r = ms.suggest("jwt")
        self.assertEqual(r[0]["text"], "jwt_handler")
        self.assertEqual(r[0]["via"], "prefix")

    def test_short_input_is_empty(self):
        self.assertEqual(ms.suggest("j"), [])

    def test_real_typo_is_logged(self):
        self.assertTrue(ms.accept("serch", "search")["typo_logged"])
        c = sqlite3.connect(self.path)
        self.assertEqual(c.execute("SELECT count(*) FROM typo_log").fetchone()[0], 1)

    def test_prefix_is_not_a_typo(self):
        self.assertFalse(ms.accept("sea", "search")["typo_logged"])

    def test_accept_boosts_future_rank(self):
        ms.accept("ind", "index")
        self.assertEqual(ms.suggest("ind")[0]["text"], "index")

if __name__ == "__main__":
    unittest.main()
