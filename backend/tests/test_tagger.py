"""Tagger v2: price-notice rule, tag cleaning, novelty, dedupe, the worker path.
Runs under pytest or as a script:
    venv/bin/python tests/test_tagger.py
"""
import datetime
import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
from unittest.mock import patch

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import analysis
import database
import story


def test_rule_tag_catches_price_notices():
    for body in [
        "Zoetis Inc (ZTS) is down -5.05% to 81.25",
        "Intel (INTC) is up 5.16% to 57.49 after market open",
        "Figure Tech Solutions (FIGR) is down -5.53% to 24.41. Check out Figure Tech Solutions's live quote now",
        "SpaceX (SPCX) is falling -7.47% to 128.09. Click to see SpaceX's real time price",
        "Oracle (ORCL) sinks to a 52 Week low at 108.48",
        "Qualys (QLYS) reached an all time high at 210.5 Check out Qualys's live quote now",
        "Mastercard (MA) reached a Record-High level at 600.1",
        "ADP (ADP) jumps to a 52 Week high at 310.2",
    ]:
        t = analysis.rule_tag(body)
        assert t is not None, body
        assert t["sentiment_label"] == "NEUTRAL" and t["category"] == "SENTIMENT"
        assert t["method"] == "rule_price_echo" and t["llm_config"] == analysis.ANALYSIS_LLM_CONFIG
    assert analysis.rule_tag("Zoetis Inc (ZTS) is down -5.05% to 81.25")["tickers"] == ["ZTS"]


def test_rule_tag_leaves_news_alone():
    for body in [
        "Nvidia (NVDA) Earnings EPS: $1.30 vs. $1.25 forecast",
        "Nasdaq tumbles, turns negative for 2026, as Anthropic leads AI stock sell-off",
        "Shares of Oracle are down 5% after the company (ORCL) cut guidance",
        "Wells Fargo maintains Pool at 'equal weight' with a price target of $190.00",
        "",
        None,
    ]:
        assert analysis.rule_tag(body) is None, body


def test_clean_tags():
    t = analysis._clean_tags({"tickers": ["nvda", "$AMD", "GOOG", "SPX", "USD/JPY", "NVDA"],
                              "topic": " Fed Rate-Path ", "impact_score": 14, "ml_tags": ["Fed_Speak"]})
    assert t["tickers"] == ["NVDA", "AMD", "GOOGL"]
    assert t["topic"] == "fed_rate_path"
    assert t["impact_score"] == 10
    assert t["ml_tags"] == ["fed_speak"]


def test_novelty_from_sim():
    assert story.novelty_from_sim(None) == 10
    assert story.novelty_from_sim(0.30) == 10
    assert story.novelty_from_sim(0.99) == 1
    assert 5 <= story.novelty_from_sim(0.714) <= 7
    vals = [story.novelty_from_sim(s) for s in np.linspace(0.4, 1.0, 50)]
    assert vals == sorted(vals, reverse=True)


def _db():
    d = tempfile.mkdtemp()
    path = os.path.join(d, "t.db")
    database.DB_FILE = path
    database.init_db()
    return path


def _insert(path, body, hours_ago, title="Investing.com", source="Investing.com", vec=None, topic=None):
    ts = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours_ago)).isoformat()
    with sqlite3.connect(path) as c:
        c.execute("INSERT INTO news_events (timestamp, source_app, title, body, topic, title_embedding) "
                  "VALUES (?,?,?,?,?,?)", (ts, source, title, body, topic, vec))


def test_is_duplicate_ignores_source_label_and_case():
    path = _db()
    _insert(path, "UBS maintains TJX at 'buy'", 0.01)
    _insert(path, "Old headline", 7)
    with database.get_db_connection() as c:
        assert database.is_duplicate(c, "Investing", "  ubs maintains tjx at 'BUY' ", 6 * 3600)
        assert not database.is_duplicate(c, "Investing", "Old headline", 6 * 3600)
        assert not database.is_duplicate(c, "Investing", "Something new", 6 * 3600)


def test_active_topics_orders_by_use():
    path = _db()
    for _ in range(3):
        _insert(path, "a", 1, topic="fed_rate_path")
    _insert(path, "b", 1, topic="nvidia_earnings")
    _insert(path, "c", 24 * 8, topic="stale_topic")
    with database.get_db_connection() as c:
        assert database.active_topics(c) == ["fed_rate_path", "nvidia_earnings"]


def _unit(*xs):
    v = np.zeros(768, dtype=np.float32)
    v[:len(xs)] = xs
    return (v / np.linalg.norm(v)).tobytes()


def test_novelty_reads_recent_rows():
    path = _db()
    _insert(path, "x", 1, vec=_unit(1, 0))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with database.get_db_connection() as c:
        assert story.novelty(c.cursor(), _unit(1, 0), now) == 1      # same headline vector
        assert story.novelty(c.cursor(), _unit(0, 1), now) == 10     # orthogonal
        assert story.novelty(c.cursor(), None, now) is None


def test_worker_drops_dupes_rules_price_notices_and_sets_novelty():
    path = _db()
    import bot_logic
    calls = []

    def fake_llm(title, body, source_app, topics=None, today=None):
        calls.append(body)
        return ({"category": "OTHER", "topic": "", "sentiment_label": "BULLISH",
                 "impact_score": 3, "tickers": ["REGN"], "ml_tags": ["fda_approval"],
                 "method": "llm", "llm_config": analysis.ANALYSIS_LLM_CONFIG}, "raw")

    vecs = iter([json.dumps(np.eye(768)[i].tolist()) for i in range(10)])
    with patch("bot_logic.get_gemini_analysis", side_effect=fake_llm), \
         patch("bot_logic.get_text_embedding", side_effect=lambda t: next(vecs)), \
         patch("bot_logic.fetch_market_context", return_value=({}, "OPEN", None)), \
         patch("bot_logic.score_event", return_value=None):
        for task in [
            {"title": "Investing.com", "body": "FDA approves Regeneron drug", "source": "Investing.com"},
            {"title": "Investing.com", "body": "FDA approves Regeneron drug", "source": "Investing"},
            {"title": "Investing.com", "body": "Zoetis Inc (ZTS) is down -5.05% to 81.25", "source": "Investing"},
        ]:
            bot_logic.NEWS_QUEUE.put(task)
        threading.Thread(target=bot_logic.process_news_queue, daemon=True).start()
        deadline = time.time() + 10
        while bot_logic.NEWS_QUEUE.unfinished_tasks and time.time() < deadline:
            time.sleep(0.05)

    assert calls == ["FDA approves Regeneron drug"]          # dupe and price notice never hit the model
    with sqlite3.connect(path) as c:
        rows = c.execute("SELECT body, sentiment, ai_analysis_json, story_id FROM news_events ORDER BY id").fetchall()
    assert [r[0] for r in rows] == ["FDA approves Regeneron drug", "Zoetis Inc (ZTS) is down -5.05% to 81.25"]
    first, echo = (json.loads(r[2]) for r in rows)
    assert first["novelty_score"] == 10 and echo["novelty_score"] == 10   # orthogonal vectors
    assert rows[1][1] == "NEUTRAL" and echo["method"] == "rule_price_echo"
    assert all(r[3] is not None for r in rows)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
