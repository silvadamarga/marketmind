"""story.py + its ingest hook. Runs under pytest or as a script:
    venv/bin/python tests/test_story.py
"""
import datetime
import json
import os
import sqlite3
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import database
import story

T0 = datetime.datetime(2026, 10, 1, 12, tzinfo=datetime.timezone.utc)


def vec(*xs):
    """768-dim vector from a few leading components, as the JSON string
    get_text_embedding returns."""
    v = np.zeros(768)
    v[:len(xs)] = xs
    return json.dumps(v.tolist())


def ts(hours):
    return (T0 + datetime.timedelta(hours=hours)).isoformat()


def db():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE news_events (id INTEGER PRIMARY KEY, timestamp TEXT, category TEXT, "
                 "ai_analysis_json TEXT, title_embedding BLOB, story_id INTEGER)")
    return conn


def add(conn, rid, hours, v, category="OTHER", tickers=(), story_id=None):
    conn.execute("INSERT INTO news_events VALUES (?,?,?,?,?,?)",
                 (rid, ts(hours), category, json.dumps({"tickers": list(tickers)}),
                  story.to_blob(v), story_id if story_id is not None else rid))


def test_close_headline_joins_its_story():
    c = db()
    add(c, 1, 0, vec(1, 0), story_id=1)
    add(c, 2, 1, vec(1, 0.1), story_id=1)       # already in story 1
    add(c, 3, 2, vec(0, 1))                     # unrelated
    assert story.find_story(c.cursor(), story.to_blob(vec(1, 0.2)), ts(3), "OTHER", []) == 1


def test_far_headline_starts_a_story():
    c = db()
    add(c, 1, 0, vec(1, 0))
    # cos = 1/sqrt(2) ~ 0.71 < 0.80
    assert story.find_story(c.cursor(), story.to_blob(vec(1, 1)), ts(1), "OTHER", []) is None


def test_window_is_48h_and_backward_only():
    c = db()
    add(c, 1, 0, vec(1, 0))
    add(c, 2, 10, vec(1, 0))                    # later than the probe
    cur = c.cursor()
    assert story.find_story(cur, story.to_blob(vec(1, 0)), ts(47), "OTHER", []) == 1
    assert story.find_story(cur, story.to_blob(vec(1, 0)), ts(49), "OTHER", []) == 2
    assert story.find_story(cur, story.to_blob(vec(1, 0)), ts(59), "OTHER", []) is None
    assert story.find_story(cur, story.to_blob(vec(1, 0)), ts(5), "OTHER", []) == 1


def test_different_companies_never_match_but_macro_proxies_do():
    c = db()
    add(c, 1, 0, vec(1, 0), tickers=["MCHP"])
    add(c, 2, 0, vec(1, 0), category="MACRO", tickers=["GLD"])
    cur = c.cursor()
    blob = story.to_blob(vec(1, 0))
    # company news, disjoint tickers: skip row 1; row 2 is macro (no identity) -> joins it
    assert story.find_story(cur, blob, ts(1), "OTHER", ["IT"]) == 2
    # shared ticker -> the best match, row 1 (inserted first, equal score)
    assert story.find_story(cur, blob, ts(1), "OTHER", ["MCHP", "X"]) in (1, 2)
    # macro probe: tickers ignored on both sides
    assert story.find_story(cur, blob, ts(1), "MACRO", ["XAU/USD"]) in (1, 2)


def test_company_veto_falls_through_to_next_best():
    c = db()
    add(c, 1, 0, vec(1, 0), tickers=["MCHP"])           # best, but wrong company
    add(c, 2, 0, vec(1, 0.3), tickers=["IT"])           # second best, right company
    assert story.find_story(c.cursor(), story.to_blob(vec(1, 0)), ts(1), "OTHER", ["IT"]) == 2


def test_no_embedding_no_story():
    c = db()
    add(c, 1, 0, vec(1, 0))
    assert story.to_blob(None) is None
    assert story.find_story(c.cursor(), None, ts(1), "OTHER", []) is None


def test_log_news_event_assigns_story_ids():
    """The ingest hook end to end on a fresh schema: first row starts a story,
    a near-duplicate joins it, an unrelated row and an embedding-less row don't."""
    with tempfile.TemporaryDirectory() as d:
        old = database.DB_FILE
        database.DB_FILE = os.path.join(d, "t.db")
        try:
            database.init_db()
            pack = lambda b: {"source": "Investing", "title": "Investing.com", "body": b}
            an = {"impact_score": 3, "category": "OTHER", "tickers": ["TCEHY", "ORCL"]}
            a = database.log_news_event(pack("Tencent leases chips"), an, title_embedding=story.to_blob(vec(1, 0)))
            b = database.log_news_event(pack("Tencent Leases AI Chips"), an, title_embedding=story.to_blob(vec(1, 0.1)))
            u = database.log_news_event(pack("Gold falls"), {**an, "category": "MACRO"}, title_embedding=story.to_blob(vec(0, 1)))
            n = database.log_news_event(pack("no vector"), an)
            with database.get_db_connection() as conn:
                got = dict(conn.execute("SELECT id, story_id FROM news_events").fetchall())
            assert got == {a: a, b: a, u: u, n: None}, got
        finally:
            database.DB_FILE = old


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
