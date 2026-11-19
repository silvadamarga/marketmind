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


def test_price_path_returns_and_range():
    sess = []
    day = dt.date(2026, 8, 3)
    price = 100.0
    while day < NOW.date():
        if day.weekday() < 5:
            price += 1
            sess.append({"date": day.isoformat(), "close": price, "live": False})
        day += dt.timedelta(days=1)
    r = daily_history._price_path(sess, NOW, "SPY")
    assert r["pos"] == 1.0 and r["off_high"] == 0.0        # straight line up: at the high
    assert r["w1"] == round((sess[-1]["close"] / sess[-6]["close"] - 1) * 100, 2)
    assert sess[0]["date"] < r["dates"][r["from90"]]          # stats trimmed to the 90-day span
    assert r["dates"][0] == sess[0]["date"]                   # the chart keeps the older sessions
    y = daily_history._price_path(sess, NOW, "^TNX")
    assert y["points"] and y["d1"] == 1.0                     # yields move in points

def test_chart_puts_older_daily_closes_first():
    sess = [{"date": "2026-11-17", "close": 10.0, "live": False},
            {"date": "2026-11-18", "close": 11.0, "live": False}]
    older = [("2025-11-01", 5.0), ("2026-06-01", 8.0), ("2026-11-17", 99.0)]
    closes, dates = daily_history._chart(sess, older, NOW)
    assert dates == ["2026-06-01", "2026-11-17", "2026-11-18"]  # past CHART_DAYS and overlap dropped
    assert closes == [8.0, 10.0, 11.0]


def test_chart_scales_closes_before_a_split():
    older = [("2025-12-03", 90.0), ("2025-12-04", 92.0), ("2025-12-05", 46.5), ("2026-01-30", 33.0)]
    closes, _ = daily_history._chart([], older, NOW)
    assert closes == [45.0, 46.0, 46.5, 33.0]                # 2-for-1 scaled; a real -29% day kept


def test_daily_closes_last_bar_of_each_weekday():
    c = _db()
    for ts, close in (("2026-06-01T15:00:00", 1.0), ("2026-06-01T23:50:00", 2.0),   # Mon: last bar wins
                      ("2026-06-02T23:50:00", 2.0),                                  # unchanged: dropped
                      ("2026-06-06T23:50:00", 7.0),                                  # Saturday: dropped
                      ("2026-06-08T23:50:00", 3.0)):
        c.execute("INSERT INTO market_data VALUES (?,?,?)", (ts, "SPY", close))
    out = daily_history._daily_closes(c, "2026-05-01", "2026-07-01")
    assert out["SPY"] == [("2026-06-01", 2.0), ("2026-06-08", 3.0)]


def test_news_daily_counts_and_tone_per_day():
    c = _db()
    _news(c, NOW - dt.timedelta(hours=1), sentiment="BULLISH")
    _news(c, NOW - dt.timedelta(hours=2), sentiment="BULLISH")
    _news(c, NOW - dt.timedelta(hours=3), sentiment="BEARISH")
    _news(c, NOW - dt.timedelta(hours=4))
    _news(c, NOW - dt.timedelta(days=400))                      # past the chart: left out
    assert daily_history.news_daily(c, NOW) == [{"date": "2026-11-19", "count": 4, "net": 0.25}]


def test_summary_names_and_drops_missing():
    prices = {"spy": {"move": -1.2, "norm": 0.6, "rank": {"below": 55, "of": 60},
                      "date": "2026-11-18", "live": False},
              "vix": None, "sectors": [],
              "paths": [{"group": "Sectors", "rows": [
                  {"ticker": "XLV", "name": "Health care", "pos": 0.0, "off_high": -4.0}]}]}
    out = {x["topic"]: x["text"] for x in daily_history.summary({}, prices)}
    assert out["Stocks"].startswith("S&P 500 -1.2% at Wed's close")
    assert "much bigger than usual" in out["Stocks"]
    assert out["90 days"] == "Near 90-day lows: Health care."
    assert "Fear gauge" not in out and "News" not in out     # no data, no sentence

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
