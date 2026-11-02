"""live.py, the serve side of the forge's Live desk (forge plan 37 V2). Runs
under pytest or as a script:
    venv/bin/python tests/test_live.py
"""
import datetime as dt
import json
import os
import sqlite3
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import live

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 11, 2, 15, 0, tzinfo=UTC)       # 10:00 ET, Monday


def _setup(tmp):
    db = os.path.join(tmp, "mm.db")
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE news_events (timestamp TEXT, source_app TEXT, body TEXT,"
                 " impact_score INTEGER, category TEXT, related_ticker TEXT)")
    conn.execute("CREATE TABLE market_data (timestamp TEXT, ticker TEXT, close REAL)")
    news = [("2026-11-02T14:30:00+00:00", "Investing", "Nvidia up", 6),
            ("2026-11-02T14:29:50+00:00", "Investing.com", "Nvidia up", 6),   # the double push
            ("2026-11-02T12:00:00+00:00", "Investing", "Nvidia up", 6),       # same words, hours apart
            ("2026-10-20T12:00:00+00:00", "Barron's", "old", 5)]              # outside 7 days
    conn.executemany("INSERT INTO news_events VALUES (?,?,?,?,'X','NVDA')", news)
    mkt = [("2026-10-31T14:45:00", "SPY", 999.0),     # Saturday, inside RTH clock: frozen, ignored
           ("2026-11-02T14:15:00", "SPY", 100.0),     # 09:15 ET, pre-open
           ("2026-11-02T14:45:00", "SPY", 101.0),     # 09:45 ET
           ("2026-11-02T14:15:00", "^VIX", 20.0),
           ("2026-11-02T14:45:00", "^VIX", 21.5)]
    conn.executemany("INSERT INTO market_data VALUES (?,?,?)", mkt)
    conn.commit()
    conn.close()
    snap = {"built_at": "2026-11-02T14:55:00+00:00", "book_at": "2026-10-26", "prices_date": "2026-10-30",
            "tape": {"stopped_today": False}, "lab": {},
            "rows": [{"ticker": "NVDA"}, {"ticker": "TWLO"}],
            "charts": {"NVDA": {"ticker": "NVDA", "sector_etf": "XLK", "sector": "Technology"}}}
    with open(os.path.join(tmp, "live.json"), "w") as f:
        json.dump(snap, f)
    return db


def _with_tmp(fn):
    def run():
        with tempfile.TemporaryDirectory() as tmp:
            old = (live._PATH, live.HITS_PATH)
            live._PATH, live.HITS_PATH = os.path.join(tmp, "live.json"), os.path.join(tmp, "hits.jsonl")
            live._CACHE.update(mtime=None, data=None)
            try:
                fn(tmp, _setup(tmp))
            finally:
                live._PATH, live.HITS_PATH = old
    run.__name__ = fn.__name__
    return run


@_with_tmp
def test_payload_slices_one_chart_and_ages(tmp, db):
    p = live.payload(None, poll=True, now=NOW, db_file=db)
    assert p["sel"] == "NVDA" and p["chart"]["ticker"] == "NVDA"
    assert [r["ticker"] for r in p["rows"]] == ["NVDA", "TWLO"]
    assert p["age_s"] == 300
    assert p["rth"] and p["poll_s"] == 60
    assert live.payload("twlo", poll=True, now=NOW, db_file=db)["chart"] is None


@_with_tmp
def test_news_drops_double_push_only(tmp, db):
    p = live.payload("NVDA", poll=True, now=NOW, db_file=db)
    assert [(n["at_et"], n["source"]) for n in p["news"]] == [("11-02 09:30", "Investing"),
                                                              ("11-02 07:00", "Investing")]


@_with_tmp
def test_strip_session_pct_and_vix_points(tmp, db):
    s = live.payload("NVDA", poll=True, now=NOW, db_file=db)["strip"]
    assert s["day"] == "2026-11-02"
    by = {i["ticker"]: i for i in s["items"]}
    assert by["SPY"]["pct"] == 1.0 and by["SPY"]["last"] == 101.0
    assert by["^VIX"]["pct"] is None and by["^VIX"]["chg"] == 1.5


@_with_tmp
def test_only_human_loads_are_counted(tmp, db):
    live.payload("NVDA", poll=True, now=NOW, db_file=db)
    assert not os.path.exists(live.HITS_PATH)
    live.payload("NVDA", poll=False, now=NOW, db_file=db)
    with open(live.HITS_PATH) as f:
        assert len(f.readlines()) == 1


@_with_tmp
def test_closed_market_stops_polling(tmp, db):
    sat = dt.datetime(2026, 10, 31, 15, 0, tzinfo=UTC)
    p = live.payload("NVDA", poll=True, now=sat, db_file=db)
    assert not p["rth"] and p["poll_s"] is None


def test_no_snapshot_says_so():
    old = live._PATH
    live._PATH = "/nonexistent/live.json"
    live._CACHE.update(mtime=None, data=None)
    try:
        p = live.payload(None, poll=True, now=NOW)
        assert "No live snapshot" in p["message"] and p["rows"] == []
    finally:
        live._PATH = old


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
