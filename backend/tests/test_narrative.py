"""narrative.py's bull/bear board: the counted tally, the swing, lanes, heat, the
tilt ledger and the board's latest-build filter. Runs under pytest or as a script:
    venv/bin/python tests/test_narrative.py
"""
import datetime as dt
import os
import sqlite3
import sys
import tempfile
from contextlib import contextmanager

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import narrative

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 11, 21, 12, 0, tzinfo=UTC)


def _ts(days_ago, hour=0):
    return (NOW - dt.timedelta(days=days_ago, hours=hour)).isoformat()


def _setup(tmp):
    db = os.path.join(tmp, "mm.db")
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE news_events (id INTEGER PRIMARY KEY, timestamp TEXT, source_app TEXT,"
                 " title TEXT, body TEXT, sentiment TEXT, impact_score INTEGER, related_ticker TEXT,"
                 " ai_analysis_json TEXT, embedding TEXT, category TEXT, topic TEXT)")
    ev = []
    # ACME: bearish 5-10 days ago, bullish in the last 3 days -> swing up
    ev += [(_ts(d), "BEARISH", "ACME", "EARNINGS", None) for d in (5, 6, 7, 8, 9)]
    ev += [(_ts(0, h), "BULLISH", "ACME", "EARNINGS", None) for h in (1, 2, 3, 4)]
    ev += [(_ts(1), "NEUTRAL", "ACME", "EARNINGS", None)]
    # older ACME news, outside the 14-day window: only the heat norm sees it
    ev += [(_ts(d), "NEUTRAL", "ACME", "EARNINGS", None) for d in (15, 16, 22, 23, 29, 30, 31)]
    # GBP: a macro proxy ticker -> market lane, not a stock
    ev += [(_ts(d), "BEARISH", "GBP", "MACRO", None) for d in (1, 2, 3, 4)]
    # a fine topic -> theme lane; noise categories never count
    ev += [(_ts(d), "BULLISH", None, "MACRO", "fed_rate_path") for d in (1, 2, 3, 4)]
    ev += [(_ts(1), "BULLISH", "ACME", "RATING", None)] * 5
    conn.executemany(
        "INSERT INTO news_events (timestamp, sentiment, related_ticker, category, topic,"
        " source_app, body, impact_score) VALUES (?,?,?,?,?,'Wire','headline',5)", ev)
    conn.commit()
    conn.close()
    return db


def _with_db(fn):
    def run():
        with tempfile.TemporaryDirectory() as tmp:
            db = _setup(tmp)

            @contextmanager
            def conn():
                c = sqlite3.connect(db)
                c.row_factory = sqlite3.Row
                try:
                    yield c
                finally:
                    c.close()
            old_conn, old_book = narrative.get_db_connection, narrative._book
            narrative.get_db_connection = conn
            narrative._book = lambda: ({"ACME": "held"}, "2026-11-20")
            try:
                fn(db)
            finally:
                narrative.get_db_connection, narrative._book = old_conn, old_book
    run.__name__ = fn.__name__
    return run


def _build():
    real = narrative.datetime

    class Fixed(real):
        @classmethod
        def now(cls, tz=None):
            return NOW
    narrative.datetime = Fixed
    try:
        return narrative.build_narratives(synthesize=False)
    finally:
        narrative.datetime = real


@_with_db
def test_tally_swing_and_lanes(db):
    _build()
    b = narrative.get_board(now=NOW)
    cards = {c["entity"]: c for c in b["cards"]}
    m = cards["ACME"]["mood"]
    # inside 14 days: 4 bull, 5 bear, 1 neutral; the 5 RATING rows never count
    assert (m["n"], m["bull"], m["bear"], m["flat"], m["tilt"]) == (10, 4, 5, 1, -10)
    assert m["recent"] == {"n": 5, "tilt": 80}      # last 72h: 4 bull + 1 neutral
    assert m["prior"] == {"n": 5, "tilt": -100}     # days 5-9: 5 bear
    assert m["swing"] == 180
    assert sum(d["bull"] + d["bear"] + d["flat"] for d in m["daily"]) == m["n"]
    assert len(m["daily"]) == narrative.WINDOW_DAYS
    assert cards["ACME"]["lane"] == "stock" and cards["ACME"]["mine"] == "held"
    assert cards["GBP"]["lane"] == "market" and cards["GBP"]["mood"]["swing"] is None  # too few
    assert cards["fed_rate_path"]["lane"] == "theme"
    assert all(g["lane"] == "mood" for g in b["gauges"])
    assert b["book_at"] == "2026-11-20"


@_with_db
def test_heat_against_own_norm(db):
    _build()
    h = {c["entity"]: c for c in narrative.get_board(now=NOW)["cards"]}["ACME"]["heat"]
    # this week (the last 7x24h, edge included): 4 bull + 1 neutral + bears at 5, 6, 7 = 8
    # the 4 weeks before: bears at 8, 9 + 7 old neutrals = 9 -> 2.25 a week
    assert h == {"week": 8, "norm": 2.2, "x": 3.6}


@_with_db
def test_ledger_first_build_of_the_day_wins(db):
    _build()
    _build()
    conn = sqlite3.connect(db)
    n = conn.execute("SELECT count(*) FROM narrative_tilt_history WHERE entity='ACME'").fetchone()[0]
    assert n == 1


@_with_db
def test_board_hides_cards_from_older_builds(db):
    _build()
    conn = sqlite3.connect(db)
    conn.execute("UPDATE narratives SET updated_at='2026-11-01T00:00:00+00:00' WHERE entity='GBP'")
    conn.commit()
    assert "GBP" not in {c["entity"] for c in narrative.get_board(now=NOW)["cards"]}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
