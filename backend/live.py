"""Serve side of the forge's Live desk (forge plan 37 V2): read the live.json the
forge's tape pushes every 5 minutes of the US session (scrape tape --push) and
hand the phone one name at a time.

Same transport as forge_cards.py: the forge builds, we read with an mtime cache
and surface the age. From the snapshot we only slice. Two things are added from
this box's own tables, because here they are fresher than anything the forge
holds: the name's news (`news_events`) and the market strip (`market_data`,
15-min). The file carries avg cost and stops, which is why the forge refuses to
push it while the public vhost answers.
"""
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from config import DB_FILE

_DIR = os.path.dirname(__file__)
_PATH = os.path.join(_DIR, "live.json")
HITS_PATH = os.path.join(_DIR, "live_hits.jsonl")   # forge plan 36 §6 / 37 §6 stop read
ET = ZoneInfo("America/New_York")
NEWS_DAYS = 7
REPEAT_WINDOW = timedelta(minutes=15)
STRIP = ("SPY", "QQQ", "^VIX")
POLL_S = 60

_CACHE = {"mtime": None, "data": None}


def _load_file():
    """Parsed snapshot, reloaded when the file changes. None if absent/corrupt."""
    try:
        mtime = os.path.getmtime(_PATH)
    except OSError:
        return None
    if _CACHE["mtime"] != mtime:
        try:
            with open(_PATH) as f:
                _CACHE["data"] = json.load(f)
            _CACHE["mtime"] = mtime
        except (OSError, ValueError):
            return None
    return _CACHE["data"]


def _utc(ts):
    """news_events ISO with offset, market_data naive UTC: both to aware UTC."""
    dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _rth(now_et):
    return now_et.weekday() < 5 and (9, 30) <= (now_et.hour, now_et.minute) < (16, 0)


def news(conn, ticker, now):
    """The name's news, newest first, times ET. The Investing apps push each
    item twice ('Investing' and 'Investing.com'): a headline repeated within
    15 minutes shows once, as on the forge."""
    since = (now - timedelta(days=NEWS_DAYS)).isoformat()
    rows = conn.execute(
        "SELECT timestamp, source_app, body, impact_score, category FROM news_events"
        " WHERE related_ticker = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT 200",
        (ticker, since)).fetchall()
    out, last = [], {}
    for ts, src, body, impact, cat in rows:
        at = _utc(ts)
        k = (body or "").strip()
        if k and k in last and last[k] - at <= REPEAT_WINDOW:
            continue
        last[k] = at
        out.append({"at_et": at.astimezone(ET).strftime("%m-%d %H:%M"), "source": src,
                    "headline": body, "impact": impact, "category": cat})
    return out


def strip(conn, tickers, now):
    """Latest weekday regular session per ticker: % from the last quote before
    09:30 ET (^VIX in points), with the session's 15-min series for a sparkline.
    The box polls around the clock and quotes freeze off-session, so only
    weekday 09:30-16:00 ET bars count as the session."""
    since = (now - timedelta(days=5)).replace(tzinfo=None).isoformat()
    q = ",".join("?" * len(tickers))
    rows = conn.execute(f"SELECT ticker, timestamp, close FROM market_data WHERE ticker IN ({q})"
                        " AND timestamp >= ? AND close IS NOT NULL ORDER BY timestamp",
                        (*tickers, since)).fetchall()
    bars = [(t, _utc(ts).astimezone(ET), c) for t, ts, c in rows]
    rth = [b for b in bars if _rth(b[1])]
    if not rth:
        return {"day": None, "items": []}
    day = max(b[1].date() for b in rth)
    open_at = datetime.combine(day, datetime.min.time(), ET).replace(hour=9, minute=30)
    items = []
    for t in tickers:
        sess = [(b[1], b[2]) for b in rth if b[0] == t and b[1].date() == day]
        pre = [b[2] for b in bars if b[0] == t and b[1] < open_at]
        if not sess:
            continue
        base = pre[-1] if pre else None
        last_at, last = sess[-1]
        items.append({
            "ticker": t, "last": round(last, 2), "at_et": last_at.strftime("%H:%M"),
            "pct": round((last / base - 1) * 100, 2) if base and t != "^VIX" else None,
            "chg": round(last - base, 2) if base and t == "^VIX" else None,
            "series": [round(c, 4) for _, c in sess],
        })
    return {"day": day.isoformat(), "items": items}


def log_hit(now):
    try:
        with open(HITS_PATH, "a") as f:
            f.write(json.dumps({"ts": now.isoformat(timespec="seconds")}) + "\n")
    except OSError:
        pass


def payload(ticker=None, poll=False, now=None, db_file=DB_FILE):
    now = now or datetime.now(timezone.utc)
    if not poll:
        log_hit(now)
    now_et = now.astimezone(ET)
    out = {"now_et": now_et.strftime("%Y-%m-%d %H:%M"), "rth": _rth(now_et),
           "poll_s": POLL_S if _rth(now_et) else None}
    snap = _load_file()
    if not snap:
        return {**out, "message": "No live snapshot from the forge yet.", "rows": []}
    rows = snap.get("rows", [])
    sel = (ticker or "").strip().upper() or (rows[0]["ticker"] if rows else None)
    chart = snap.get("charts", {}).get(sel)
    out.update({
        "built_at": snap.get("built_at"),
        "age_s": int((now - _utc(snap["built_at"])).total_seconds()) if snap.get("built_at") else None,
        "tape": snap.get("tape"), "book_at": snap.get("book_at"), "prices_date": snap.get("prices_date"),
        "lab": snap.get("lab"), "rows": rows, "sel": sel, "chart": chart,
    })
    conn = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True, timeout=5)
    try:
        out["news"] = news(conn, sel, now) if sel else []
        etf = (chart or {}).get("sector_etf")
        out["strip"] = strip(conn, [*STRIP, *([etf] if etf else [])], now)
        out["sector"] = {"etf": etf, "name": (chart or {}).get("sector")}
    finally:
        conn.close()
    return out
