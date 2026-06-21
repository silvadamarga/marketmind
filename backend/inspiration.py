"""Trader-only "inspiration" page: narrate the forge's fundamental ranking with
Gemini, lazily on first open each day and cache by snapshot date.

The forge pushes forge_brief.json (deep-cohort composite digest). The first
request for a given `as_of` builds an opinionated narration (idea-generation, not
instruction — this page is private/gated, a deliberate carve-out from the public
anti-FOMO doctrine); subsequent requests that day serve the cache. The cache is a
plain file (not market_mind.db — the forge digest is external input, and a file
keeps the single-writer DB doctrine clean).
"""
import json
import os
from datetime import datetime, timezone

import analysis
import forge_brief
from database import get_db_connection

_CACHE_PATH = os.path.join(os.path.dirname(__file__), "forge_inspiration_cache.json")

# Recent-news lookback for the per-idea news indicator.
_NEWS_WINDOW_DAYS = 21

# How many top names to narrate (cost + focus). The digest is sorted best-first.
TOP_N = 10


def _pct(v):
    return f"{round(v * 100)}%" if isinstance(v, (int, float)) else "—"


def _signed(v, places=1):
    return f"{v:+.{places}%}" if isinstance(v, (int, float)) else "—"


def _format_brief(digest):
    """Render the digest into the prompt's INPUT DATA text — regime + top-N rows
    with factor percentiles, fair value, standout ProTips, and recent changes."""
    lines = [f"AS_OF: {digest.get('as_of')}  (staleness: {digest.get('staleness')})"]
    regime = digest.get("regime") or {}
    if regime:
        risk = "RISK-ON" if regime.get("regime.risk_on") else "RISK-OFF"
        dist = regime.get("regime.spy_dist_ma200")
        lines.append(f"MARKET REGIME: {risk}"
                     + (f" (SPY {dist:+.1%} vs 200d MA)" if isinstance(dist, (int, float)) else ""))
    lines.append("")
    lines.append("COHORT (top names by composite; factor values are cohort percentiles):")
    for r in digest.get("cohort", [])[:TOP_N]:
        f = r.get("factors", {})
        def fp(name):
            return _pct((f.get(name) or {}).get("pct"))
        sec = " / ".join(x for x in (r.get("sector"), r.get("industry")) if x)
        lines.append(
            f"\n{r['ticker']}  composite={r.get('composite')}  "
            f"FV={r.get('fv_label') or '—'} (upside {_signed(r.get('fv_upside'))})  "
            f"analyst_rec={r.get('analyst_rec')}"
            + (f"  [{sec}]" if sec else ""))
        lines.append(
            f"  factors: value {fp('value')}, health {fp('health')}, "
            f"analyst {fp('analyst')}, growth {fp('growth')}, "
            f"momentum {fp('momentum')}, sentiment {fp('sentiment')}")
        px = r.get("price") or {}
        if any(px.get(k) is not None for k in ("ret_1w", "ret_1m", "ret_3m")):
            lines.append(
                f"  price: {_signed(px.get('ret_1w'))} 1w, {_signed(px.get('ret_1m'))} 1m, "
                f"{_signed(px.get('ret_3m'))} 3m; {_pct(px.get('pct_52wh'))} of 52w high")
        tips = [t.get("brief") for t in (r.get("top_protips") or []) if t.get("brief")]
        if tips:
            lines.append("  protips: " + " | ".join(tips[:3]))
        chg = r.get("changes") or []
        if chg:
            cs = "; ".join(f"{c['field']} {c.get('from')}→{c.get('to')}" for c in chg[:3])
            lines.append(f"  changed: {cs}")
    return "\n".join(lines)


def _latest_news(tickers):
    """Most recent factual news_event per ticker from the live VPS DB, with a 21d
    recency count. {ticker: {headline, takeaway, date, impact, recent_count}}."""
    out = {}
    if not tickers:
        return out
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=_NEWS_WINDOW_DAYS)).isoformat()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            for t in tickers:
                row = cur.execute(
                    "SELECT title, ai_analysis_json, impact_score, timestamp "
                    "FROM news_events WHERE related_ticker = ? "
                    "AND (category IS NULL OR category NOT IN ('SENTIMENT','RATING')) "
                    "ORDER BY timestamp DESC LIMIT 1", (t,)).fetchone()
                if not row:
                    continue
                ai = {}
                if row["ai_analysis_json"]:
                    try:
                        ai = json.loads(row["ai_analysis_json"])
                    except (ValueError, TypeError):
                        ai = {}
                cnt = cur.execute(
                    "SELECT COUNT(*) n FROM news_events WHERE related_ticker = ? "
                    "AND timestamp >= ? "
                    "AND (category IS NULL OR category NOT IN ('SENTIMENT','RATING'))",
                    (t, since)).fetchone()["n"]
                out[t] = {
                    "headline": ai.get("headline") or row["title"],
                    "takeaway": ai.get("key_takeaway"),
                    "date": row["timestamp"],
                    "impact": row["impact_score"],
                    "recent_count": cnt,
                }
    except Exception as e:
        print(f"⚠️ inspiration news lookup failed: {e}")
    return out


def _enrich_ideas(narration, digest):
    """Attach factual per-ticker data to each narrated idea: price + sector from
    the forge digest, latest news from the live VPS DB. Gemini supplies the view;
    these are the facts."""
    ideas = (narration or {}).get("ideas") or []
    by_ticker = {r.get("ticker"): r for r in digest.get("cohort", [])}
    news = _latest_news([i.get("ticker") for i in ideas if i.get("ticker")])
    for idea in ideas:
        row = by_ticker.get(idea.get("ticker")) or {}
        idea["price"] = row.get("price")
        idea["sector"] = row.get("sector")
        idea["industry"] = row.get("industry")
        idea["fv_label"] = row.get("fv_label")
        idea["fv_upside"] = row.get("fv_upside")
        idea["latest_news"] = news.get(idea.get("ticker"))
    return narration


def _read_cache():
    try:
        with open(_CACHE_PATH) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _write_cache(payload):
    try:
        with open(_CACHE_PATH, "w") as fh:
            json.dump(payload, fh)
    except OSError as e:
        print(f"⚠️ inspiration cache write failed: {e}")


def get_inspiration(refresh=False):
    """Return the narrated inspiration payload, or a {message,...} dict when there
    is no forge brief yet. The Gemini narration is cached by snapshot `as_of`
    (one call/day); price + latest-news enrichment is re-applied every request so
    those stay live."""
    digest = forge_brief.load()
    if not digest:
        return {"message": "No forge brief yet — the forge has not pushed forge_brief.json."}

    as_of = digest.get("as_of")
    cache = _read_cache()
    stale_narration = False

    if not refresh and cache and cache.get("as_of") == as_of:
        narration = cache.get("narration")
    else:
        narration = analysis.generate_forge_inspiration(_format_brief(digest))
        if narration:
            _write_cache({"as_of": as_of,
                          "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                          "narration": narration})
        elif cache:                       # degrade: reuse prior narration
            narration, stale_narration = cache.get("narration"), True
        else:
            return {"message": "Narration unavailable (no API key or generation failed).",
                    "as_of": as_of, "freshness": digest.get("staleness")}

    return {
        "as_of": as_of,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "freshness": digest.get("staleness"),
        "age_days": digest.get("age_days"),
        "narration": _enrich_ideas(narration, digest),
        "summary": digest.get("summary"),
        "weights": digest.get("weights"),
        "stale_narration": stale_narration,
    }
