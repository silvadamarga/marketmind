"""Today against its own history, for the Daily Briefing page.

The page used to show the last 24h as bare counts. A count alone says nothing:
180 events is a quiet weekday and a loud Sunday. This module puts every number
next to what is normal for it:

- News: the last 24h against the same 24h window (same clock time) on each of
  the last BASELINE_DAYS days, weekdays against weekdays and weekend days
  against weekend days (a weekend runs ~40 events, a weekday 150-350).
- Names and categories: today's mentions against their own daily average.
- Prices: SPY, VIX and the sector ETFs from market_data's 15-minute bars. A
  move is read against that ticker's median absolute daily move.

Decision support only. News counts follow how much the site collects, so a
source going quiet moves them as much as the market does; the page says so.
"""
import bisect
import datetime
import json
import statistics
from zoneinfo import ZoneInfo

BASELINE_DAYS = 90          # windows compared against today
MIN_BASELINE = 5            # fewer like-days than this -> no verdict
PRICE_SESSIONS = 60         # sessions in a price baseline (~90 calendar days)
UNUSUAL_MIN_COUNT = 3       # a name needs this many mentions today to be "unusual"
UNUSUAL_RATIO = 3.0         # ... and this many times its daily average
RATIO_FLOOR = 0.5           # daily average floor, so a first mention isn't "inf x"
SECTOR_TICKERS = ("XLB", "XLC", "XLE", "XLF", "XLI", "XLK", "XLP", "XLRE",
                  "XLU", "XLV", "XLY", "XBI", "XRT")
MACRO_CATEGORIES = ("MACRO", "GEOPOLITICS", "CENTRAL_BANK")
# Price-path table: every series market_data tracks, grouped. Yields move in
# points, not percent.
ASSET_GROUPS = (
    ("Indexes", ("SPY", "QQQ", "IWM", "DIA", "VTI")),
    ("Rates, credit, dollar", ("^TNX", "TLT", "JNK", "DX-Y.NYB")),
    ("Commodities", ("GLD", "SLV", "USO")),
    ("Crypto", ("BTC-USD", "ETH-USD")),
    ("Sectors", SECTOR_TICKERS + ("SMH", "ITB")),
)
POINTS_TICKERS = ("^TNX",)
# Plain names: the page never shows a bare fund ticker.
NAMES = {
    "SPY": "S&P 500", "QQQ": "Nasdaq 100", "IWM": "Small caps (Russell 2000)",
    "DIA": "Dow Jones", "VTI": "Whole US market",
    "^TNX": "10-year Treasury yield", "TLT": "Long-term Treasury bonds",
    "JNK": "High-yield (junk) bonds", "DX-Y.NYB": "US dollar",
    "GLD": "Gold", "SLV": "Silver", "USO": "Oil",
    "BTC-USD": "Bitcoin", "ETH-USD": "Ether", "^VIX": "VIX (expected volatility)",
    "XLB": "Materials", "XLC": "Communication services", "XLE": "Energy",
    "XLF": "Financials", "XLI": "Industrials", "XLK": "Technology",
    "XLP": "Consumer staples", "XLRE": "Real estate", "XLU": "Utilities",
    "XLV": "Health care", "XLY": "Consumer discretionary", "XBI": "Biotech",
    "XRT": "Retail", "SMH": "Semiconductors", "ITB": "Homebuilders",
}
NEAR_EDGE = 0.05            # within 5% of the 90-day range of its high/low = "at" it
AVG_SESSIONS = 50           # "vs its 50-day average"
NY = ZoneInfo("America/New_York")
US_OPEN = datetime.time(9, 30)


def _parse(ts):
    t = datetime.datetime.fromisoformat(ts)
    return t if t.tzinfo else t.replace(tzinfo=datetime.timezone.utc)


def _is_weekend(t):
    return t.weekday() >= 5


def _rank_line(value, base):
    """How many of the baseline days were below today's value."""
    if value is None or not base:
        return None
    return {"below": sum(1 for b in base if b < value), "of": len(base)}


def _metric(today, base):
    base = [b for b in base if b is not None]
    if today is None or len(base) < MIN_BASELINE:
        return {"today": today, "median": None, "low": None, "high": None,
                "rank": None, "days": len(base)}
    return {"today": today, "median": round(statistics.median(base), 3),
            "low": round(min(base), 3), "high": round(max(base), 3),
            "rank": _rank_line(today, base), "days": len(base)}


def _window_stats(rows, impact_thr, novelty_thr):
    n = len(rows)
    if n == 0:
        return {"count": 0, "net": None, "macro": None, "priority": 0}
    net = sum(1 if r["sentiment"] == "BULLISH" else -1 if r["sentiment"] == "BEARISH" else 0
              for r in rows) / n
    macro = sum(1 for r in rows if r["category"] in MACRO_CATEGORIES) / n
    priority = sum(1 for r in rows
                   if (r["impact"] is not None and r["impact"] >= impact_thr)
                   or (r["novelty"] is not None and r["novelty"] >= novelty_thr))
    return {"count": n, "net": round(net, 3), "macro": round(macro, 3), "priority": priority}


def news_history(conn, now, impact_thr, novelty_thr):
    lo = (now - datetime.timedelta(days=BASELINE_DAYS + 1)).isoformat()
    raw = conn.execute(
        """SELECT timestamp, sentiment, category, related_ticker, impact_score,
                  json_extract(ai_analysis_json,'$.novelty_score') AS novelty
           FROM news_events
           WHERE timestamp >= ?
             AND COALESCE(json_extract(ai_analysis_json,'$.status'),'OK') != 'FAILED'""",
        (lo,)).fetchall()
    rows = []
    for r in raw:
        try:
            t = _parse(r["timestamp"])
        except (TypeError, ValueError):
            continue
        try:
            nov = float(r["novelty"]) if r["novelty"] is not None else None
        except (TypeError, ValueError):
            nov = None
        rows.append({"t": t, "sentiment": r["sentiment"] or "NEUTRAL",
                     "category": r["category"], "ticker": (r["related_ticker"] or "").strip(),
                     "impact": r["impact_score"], "novelty": nov})

    # windows[k] = the 24h ending k days before now; k=0 is today
    rows.sort(key=lambda r: r["t"])
    times = [r["t"] for r in rows]
    windows = []
    for k in range(BASELINE_DAYS + 1):
        end = now - datetime.timedelta(days=k)
        start = end - datetime.timedelta(hours=24)
        windows.append({"end": end,
                        "rows": rows[bisect.bisect_left(times, start):bisect.bisect_left(times, end)]})

    today = windows[0]
    weekend = _is_weekend(now)
    like = [w for w in windows[1:] if _is_weekend(w["end"]) == weekend]

    t_stats = _window_stats(today["rows"], impact_thr, novelty_thr)
    l_stats = [_window_stats(w["rows"], impact_thr, novelty_thr) for w in like]
    metrics = {key: _metric(t_stats[key], [s[key] for s in l_stats])
               for key in ("count", "net", "macro", "priority")}

    strip = []
    for w in reversed(windows):
        s = _window_stats(w["rows"], impact_thr, novelty_thr)
        strip.append({"date": w["end"].date().isoformat(), "weekend": _is_weekend(w["end"]),
                      "count": s["count"], "net": s["net"]})

    # names: today's mentions vs mean per like-day
    def counts(ws, key):
        out = {}
        for w in ws:
            for r in w["rows"]:
                v = r[key]
                if v:
                    out[v] = out.get(v, 0) + 1
        return out

    n_like = max(len(like), 1)
    t_names, b_names = counts([today], "ticker"), counts(like, "ticker")
    names = []
    for name, c in t_names.items():
        avg = b_names.get(name, 0) / n_like
        ratio = c / max(avg, RATIO_FLOOR)
        names.append({"name": name, "today": c, "avg": round(avg, 2),
                      "ratio": round(ratio, 1),
                      "unusual": c >= UNUSUAL_MIN_COUNT and ratio >= UNUSUAL_RATIO,
                      "new": b_names.get(name, 0) == 0})
    names.sort(key=lambda x: (x["today"] - x["avg"], x["today"]), reverse=True)

    t_cats, b_cats = counts([today], "category"), counts(like, "category")
    t_total, b_total = sum(t_cats.values()), sum(b_cats.values())
    cats = [{"name": c, "today": n,
             "share": round(n / t_total, 3) if t_total else None,
             "norm_share": round(b_cats.get(c, 0) / b_total, 3) if b_total else None}
            for c, n in t_cats.items()]
    cats.sort(key=lambda x: x["today"], reverse=True)

    return {"day_kind": "weekend" if weekend else "weekday", "like_days": len(like),
            "metrics": metrics, "strip": strip, "names": names[:10], "categories": cats[:8]}


def _sessions(conn, ticker, lo, now):
    """Last close per New York date. Weekends and unchanged days are dropped
    (the poller keeps sampling a closed market, so they repeat the close), and
    today counts only once the US session has opened (before that the bars are
    pre-market quotes)."""
    bars = conn.execute(
        "SELECT timestamp, close FROM market_data WHERE ticker = ? AND timestamp >= ? "
        "AND close IS NOT NULL ORDER BY timestamp", (ticker, lo)).fetchall()
    today_ny = now.astimezone(NY).date()
    last = {}
    for b in bars:
        try:
            t = _parse(b["timestamp"]).astimezone(NY)
        except (TypeError, ValueError):
            continue
        if t.weekday() >= 5 or (t.date() == today_ny and t.time() < US_OPEN):
            continue
        last[t.date()] = (b["close"], t)
    out, prev = [], None
    for d in sorted(last):
        close, t = last[d]
        if prev is not None and close == prev:
            continue
        out.append({"date": d.isoformat(), "close": close, "at": t.isoformat(),
                    "live": d == today_ny,
                    "move": round((close / prev - 1) * 100, 2) if prev else None})
        prev = close
    return out


def _move_vs_norm(sessions):
    moves = [s["move"] for s in sessions if s["move"] is not None]
    if len(moves) < MIN_BASELINE + 1:
        return None
    today, base = moves[-1], [abs(m) for m in moves[-1 - PRICE_SESSIONS:-1]]
    norm = statistics.median(base)
    return {"move": today, "norm": round(norm, 2),
            "ratio": round(abs(today) / norm, 1) if norm else None,
            "rank": _rank_line(abs(today), base),
            "date": sessions[-1]["date"], "at": sessions[-1]["at"],
            "live": sessions[-1]["live"]}


def _price_path(sessions, now, ticker):
    """Where a price sits against its own last BASELINE_DAYS: returns over 1
    week, 1 month and the whole span, place in the span's low-high range, and
    distance from the high and from the 50-session average."""
    start = (now - datetime.timedelta(days=BASELINE_DAYS)).astimezone(NY).date().isoformat()
    span = [s for s in sessions if s["date"] >= start]
    if len(span) < MIN_BASELINE + 1:
        return None
    closes = [s["close"] for s in span]
    last, high, low = closes[-1], max(closes), min(closes)
    points = ticker in POINTS_TICKERS

    def change(n):
        if len(closes) <= n:
            return None
        ref = closes[-1 - n]
        return round(last - ref, 3) if points else round((last / ref - 1) * 100, 2)

    avg = statistics.mean(closes[-AVG_SESSIONS:])
    return {"ticker": ticker, "name": NAMES.get(ticker, ticker),
            "last": round(last, 4), "date": span[-1]["date"],
            "live": span[-1]["live"], "points": points,
            "d1": change(1), "w1": change(5), "m1": change(21),
            "span": round(last - closes[0], 3) if points else round((last / closes[0] - 1) * 100, 2),
            "high": round(high, 4), "low": round(low, 4),
            "pos": round((last - low) / (high - low), 3) if high > low else None,
            "off_high": round(last - high, 3) if points else round((last / high - 1) * 100, 2),
            "vs_avg": round(last - avg, 3) if points else round((last / avg - 1) * 100, 2),
            "avg": round(avg, 4),
            "spark": [round(c, 4) for c in closes],
            "dates": [x["date"] for x in span]}


def price_history(conn, now):
    lo = (now - datetime.timedelta(days=BASELINE_DAYS + 10)).isoformat()
    cache = {}

    def sessions(t):
        if t not in cache:
            cache[t] = _sessions(conn, t, lo, now)
        return cache[t]

    spy = sessions("SPY")
    vix = sessions("^VIX")
    out = {"spy": _move_vs_norm(spy), "vix": None, "sectors": [], "strip": []}

    if len(vix) > MIN_BASELINE:
        levels = [s["close"] for s in vix[-1 - PRICE_SESSIONS:-1]]
        out["vix"] = {"level": round(vix[-1]["close"], 2),
                      "move": vix[-1]["move"],
                      "median": round(statistics.median(levels), 2),
                      "low": round(min(levels), 2), "high": round(max(levels), 2),
                      "rank": _rank_line(vix[-1]["close"], levels),
                      "date": vix[-1]["date"], "live": vix[-1]["live"]}

    for t in SECTOR_TICKERS:
        m = _move_vs_norm(sessions(t))
        if m:
            out["sectors"].append({"ticker": t, "name": NAMES[t], **m})
    out["sectors"].sort(key=lambda s: s["move"], reverse=True)   # best to worst

    vix_by_date = {s["date"]: s["close"] for s in vix}
    out["strip"] = [{"date": s["date"], "move": s["move"], "vix": vix_by_date.get(s["date"])}
                    for s in spy[-PRICE_SESSIONS - 1:] if s["move"] is not None]

    out["paths"] = []
    for group, tickers in ASSET_GROUPS:
        rows = [r for r in (_price_path(sessions(t), now, t) for t in tickers) if r]
        if rows:
            out["paths"].append({"group": group, "rows": rows})
    return out


def _share(rank):
    return rank["below"] / rank["of"] if rank and rank.get("of") else None


def _size_word(rank):
    f = _share(rank)
    if f is None:
        return None
    return ("much bigger than usual" if f >= 0.9 else "bigger than usual" if f >= 0.75
            else "much smaller than usual" if f <= 0.1 else "smaller than usual" if f <= 0.25
            else "about usual")


def _level_word(rank):
    f = _share(rank)
    if f is None:
        return None
    return ("much higher than usual" if f >= 0.9 else "higher than usual" if f >= 0.75
            else "much lower than usual" if f <= 0.1 else "lower than usual" if f <= 0.25
            else "about usual")


def _when(p):
    if p.get("live"):
        return "so far today"
    return f"at {datetime.date.fromisoformat(p['date']).strftime('%a')}'s close"


def _pct(v, d=1):
    return f"{'+' if v > 0 else ''}{v:.{d}f}%"


def summary(news, prices):
    """The day in short plain lines, built only from the numbers on the page.
    Each item: {topic, text, tone}; tone is up/down/flat for the icon. A missing
    input drops its line, never guesses."""
    out = []
    spy, vix = prices.get("spy"), prices.get("vix")
    paths = {r["ticker"]: r for g in prices.get("paths", []) for r in g["rows"]}

    if spy:
        line = (f"S&P 500 {_pct(spy['move'])} {_when(spy)}: {_size_word(spy['rank']) or 'about usual'} "
                f"(typical ±{spy['norm']:.1f}%).")
        sp = paths.get("SPY")
        if sp and sp["pos"] is not None and sp["pos"] <= NEAR_EDGE:
            line += f" Lowest in {BASELINE_DAYS} days, {abs(sp['off_high']):.1f}% off the high."
        elif sp and sp["pos"] is not None and sp["pos"] >= 1 - NEAR_EDGE:
            line += f" Highest in {BASELINE_DAYS} days."
        elif sp:
            line += f" {abs(sp['off_high']):.1f}% off its {BASELINE_DAYS}-day high."
        out.append({"topic": "Stocks", "text": line,
                    "tone": "up" if spy["move"] > 0 else "down" if spy["move"] < 0 else "flat"})

    if vix:
        f = _share(vix["rank"]) or 0.5
        out.append({"topic": "Fear gauge", "text":
                    f"VIX {vix['level']:.1f}: {_level_word(vix['rank']) or 'about usual'} "
                    f"(normal ~{vix['median']:.0f}, above {vix['rank']['below']} of {vix['rank']['of']} sessions).",
                    "tone": "down" if f >= 0.75 else "up" if f <= 0.25 else "flat"})

    sectors = prices.get("sectors") or []
    if len(sectors) >= 2:
        best, worst = sectors[0], sectors[-1]
        line = f"Best {best['name']} {_pct(best['move'])}, worst {worst['name']} {_pct(worst['move'])}."
        odd = [s["name"] for s in sectors if (_share(s["rank"]) or 0) >= 0.9]
        if odd:
            line += " Unusually big: " + ", ".join(odd) + "."
        out.append({"topic": "Sectors", "text": line, "tone": "flat"})

    lows = [r["name"] for r in paths.values() if r["pos"] is not None and r["pos"] <= NEAR_EDGE]
    highs = [r["name"] for r in paths.values() if r["pos"] is not None and r["pos"] >= 1 - NEAR_EDGE]

    def few(names):
        return ", ".join(names[:4]) + (f" +{len(names) - 4} more" if len(names) > 4 else "")

    if lows or highs:
        parts = []
        if lows:
            parts.append(f"Near {BASELINE_DAYS}-day lows: {few(lows)}.")
        if highs:
            parts.append(f"Near highs: {few(highs)}.")
        out.append({"topic": "90 days", "text": " ".join(parts),
                    "tone": "down" if len(lows) > len(highs) else "up" if highs else "flat"})

    m = (news or {}).get("metrics", {})
    c, t = m.get("count"), m.get("net")
    if c and c.get("median") is not None:
        line = f"{c['today']} stories in 24h vs ~{c['median']:.0f} normal: {_level_word(c['rank'])}."
        if t and t.get("median") is not None:
            line += f" Tone {t['today'] * 100:+.0f} vs {t['median'] * 100:+.0f} normal."
        out.append({"topic": "News", "text": line, "tone": "flat"})

    odd = [n for n in (news or {}).get("names", []) if n["unusual"] or n["new"]][:3]
    if odd:
        out.append({"topic": "Attention", "text": ", ".join(
            f"{n['name']} ({n['today']} vs {n['avg']:.1f}/day)" for n in odd) + ".", "tone": "flat"})
    return out

def build(conn, now, impact_thr, novelty_thr):
    news = news_history(conn, now, impact_thr, novelty_thr)
    prices = price_history(conn, now)
    return {"as_of": now.isoformat(),
            "baseline_days": BASELINE_DAYS,
            "price_sessions": PRICE_SESSIONS,
            "news": news,
            "prices": prices,
            "summary": summary(news, prices)}


if __name__ == "__main__":  # quick look against any db: python daily_history.py <db>
    import sqlite3
    import sys
    c = sqlite3.connect(sys.argv[1])
    c.row_factory = sqlite3.Row
    print(json.dumps(build(c, datetime.datetime.now(datetime.timezone.utc), 8, 8), indent=1))
