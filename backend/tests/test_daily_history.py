"""daily_history.py, the Daily Briefing's today-vs-normal block.
Runs under pytest or as a script:
    venv/bin/python tests/test_daily_history.py
"""
import datetime as dt
import os
import sqlite3
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import daily_history

NOW = dt.datetime(2026, 11, 19, 17, 0, tzinfo=dt.timezone.utc)   # Thursday, US session open


def _db():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("CREATE TABLE news_events (timestamp TEXT, sentiment TEXT, category TEXT, "
              "related_ticker TEXT, impact_score INTEGER, ai_analysis_json TEXT)")
    c.execute("CREATE TABLE market_data (timestamp TEXT, ticker TEXT, close REAL)")
    return c


def _news(c, t, ticker="", sentiment="NEUTRAL", category="OTHER"):
    c.execute("INSERT INTO news_events VALUES (?,?,?,?,?,?)",
              (t.isoformat(), sentiment, category, ticker, 3, '{"novelty_score": 2}'))


def test_weekdays_compare_with_weekdays_only():
    c = _db()
    for k in range(1, daily_history.BASELINE_DAYS + 1):
        end = NOW - dt.timedelta(days=k)
        n = 2 if end.weekday() >= 5 else 10          # weekends quiet
        for i in range(n):
            _news(c, end - dt.timedelta(hours=1, minutes=i), ticker="AAPL")
    for i in range(10):
        _news(c, NOW - dt.timedelta(hours=2, minutes=i), ticker="AAPL" if i < 5 else "ZZZ")
    out = daily_history.news_history(c, NOW, 8, 8)
    m = out["metrics"]["count"]
    assert out["day_kind"] == "weekday"
    assert m["today"] == 10 and m["median"] == 10      # weekend 2s left out of the baseline
    names = {n["name"]: n for n in out["names"]}
    assert names["ZZZ"]["new"] and names["ZZZ"]["unusual"]
    assert not names["AAPL"]["unusual"]


def test_pre_open_quote_is_not_a_session():
    c = _db()
    day = dt.date(2026, 7, 1)
    price = 100.0
    while day < NOW.date():
        if day.weekday() < 5:
            price += 1
            c.execute("INSERT INTO market_data VALUES (?,?,?)",
                      (f"{day.isoformat()}T20:00:00+00:00", "SPY", price))
        day += dt.timedelta(days=1)
    # 08:10 New York today: pre-market, must not count
    c.execute("INSERT INTO market_data VALUES (?,?,?)", ("2026-11-19T13:10:00+00:00", "SPY", 999.0))
    s = daily_history._sessions(c, "SPY", "2026-06-01", NOW)
    assert s[-1]["date"] == "2026-11-18" and not s[-1]["live"]
    # after the open it counts, marked live
    c.execute("INSERT INTO market_data VALUES (?,?,?)", ("2026-11-19T15:00:00+00:00", "SPY", 999.0))
    s = daily_history._sessions(c, "SPY", "2026-06-01", NOW)
    assert s[-1]["date"] == "2026-11-19" and s[-1]["live"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
