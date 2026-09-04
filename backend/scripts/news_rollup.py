"""Windowed news rollup — one summary card to the LOW Signal group.

Replaces the per-item news alert (notifications.send_news_alert, retired
2026-09-04). The per-item stream fired 2-7 cards a day into the low group and
the human read none of them: a card per story is the wrong shape for news the
human consults rather than reacts to. This script reads the window's stored
events, has Gemini write one factual recap, and sends that instead.

Window bookkeeping, not a fixed look-back: the start is the previous DELIVERED
rollup's window_end (news_rollups), so a missed cron tick or a weekend widens
the next window rather than dropping the news. Capped at MAX_HOURS — after a
long outage the recap covers the recent span honestly instead of a week of
stale headlines. A window with no events sends nothing and writes no ledger
row, which rolls that span into the next run.

Same doctrine as every other news surface here: factual recap only, no
direction call, no recommendation (the prompt forbids it, and the human's
trading calls come from the forge, not from this card).

Cron (production, UTC):
    0 8 * * 1-5  cd /var/www/market-mind/backend && venv/bin/python scripts/news_rollup.py
    30 20 * * 1-5 cd /var/www/market-mind/backend && venv/bin/python scripts/news_rollup.py

Local test (no send, no ledger row): venv/bin/python scripts/news_rollup.py --dry-run
"""
import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis import generate_daily_report
from bot_logic import get_alert_thresholds
from database import get_db_connection
from notifications import _post
import forge_rank
import llm_calls

DEFAULT_HOURS = 12        # first run ever, or after the ledger is emptied
MAX_HOURS = 72            # a Monday morning still covers the weekend
MAX_EVENTS = 40           # prompt size; the recap picks 3-5 of these anyway
SCAN_EVENTS = 150         # read this many before de-duping down to MAX_EVENTS
MAX_TRACKED = 8           # names listed in the tracked-names field


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def window_start(conn, end):
    """Previous delivered rollup's end, clamped to MAX_HOURS before `end`."""
    floor = end - datetime.timedelta(hours=MAX_HOURS)
    row = conn.execute("SELECT window_end FROM news_rollups "
                       "ORDER BY id DESC LIMIT 1").fetchone()
    if not row or not row[0]:
        return end - datetime.timedelta(hours=DEFAULT_HOURS)
    try:
        prev = datetime.datetime.fromisoformat(row[0])
    except ValueError:
        return end - datetime.timedelta(hours=DEFAULT_HOURS)
    if prev.tzinfo is None:
        prev = prev.replace(tzinfo=datetime.timezone.utc)
    return max(prev, floor)


def gather(conn, start, end, impact_thr, novelty_thr):
    """Stored events in the window, richest first, de-duped, capped. `flagged`
    marks the ones that would have fired a per-item card under the old
    thresholds. The de-dupe is the wire-copy rule the forge's packet uses: the
    same story arrives from several source apps (and over both transports), and
    NOTIF_DEDUPE_WINDOW_S only catches the copies close together in time."""
    rows = conn.execute(
        """SELECT title, body, related_ticker, impact_score, ai_analysis_json,
                  context_json
           FROM news_events
           WHERE timestamp >= ? AND timestamp < ?
             AND COALESCE(json_extract(ai_analysis_json,'$.status'),'OK') != 'FAILED'
           ORDER BY impact_score DESC NULLS LAST, timestamp DESC
           LIMIT ?""",
        (start.isoformat(), end.isoformat(), SCAN_EVENTS)).fetchall()
    logs = []
    seen = set()
    for r in rows:
        key = " ".join((r["body"] or r["title"] or "").lower().split())
        if not key or key in seen:
            continue
        seen.add(key)
        ai = json.loads(r["ai_analysis_json"]) if r["ai_analysis_json"] else {}
        ctx = json.loads(r["context_json"]) if r["context_json"] else {}
        impact = r["impact_score"] or 0
        novelty = ai.get("novelty_score") or 0
        logs.append({
            # `body` is the verbatim headline; `title` is the source app's label.
            "title": r["body"] or r["title"],
            "body": r["body"],
            "ticker": r["related_ticker"],
            "impact_score": r["impact_score"],
            "ai_analysis": ai,
            "market_vix": ctx.get("macro", {}).get("market_vix"),
            "flagged": impact >= impact_thr or novelty >= novelty_thr,
        })
        if len(logs) >= MAX_EVENTS:
            break
    return logs


def tracked_names(logs):
    """The window's tickers that the forge already has an opinion on, most-newsy
    first. The per-item card carried this annotation (rank / trader call) and it
    is the one thing the summary would otherwise lose: news about a name the
    human was told about this morning reads differently from news about a name
    they have never seen. Annotation only — never a call."""
    counts = {}
    for l in logs:
        if l["ticker"]:
            counts[l["ticker"]] = counts.get(l["ticker"], 0) + 1
    lines = []
    for ticker, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        call = llm_calls.lookup(ticker)
        rank = forge_rank.lookup(ticker)
        if not (call or rank):
            continue
        bits = [f"{ticker} ×{n}"]
        if call:
            conf = call.get("confidence")
            bits.append(f"trader {call.get('call')}"
                        + (f" {conf:.2f}" if isinstance(conf, (int, float)) else ""))
        if rank:
            bits.append(f"rank #{rank['rank']}")
        lines.append(" · ".join(bits))
        if len(lines) >= MAX_TRACKED:
            break
    return lines


def build_embed(report, start, end, n_events, n_flagged, tracked):
    span = (f"{start.strftime('%a %H:%M')}–{end.strftime('%H:%M')} UTC"
            if start.date() == end.date() else
            f"{start.strftime('%a %H:%M')} → {end.strftime('%a %H:%M')} UTC")
    parts = [report.get("summary", "").strip()]
    for d in (report.get("key_developments") or [])[:5]:
        bits = [b for b in (d.get("what_happened"), d.get("context")) if b]
        parts.append(f"- {d.get('headline', '?')}: " + " ".join(bits))
    fields = []
    themes = report.get("themes") or []
    if themes:
        fields.append({"name": "Themes", "value": ", ".join(themes[:5])})
    if report.get("on_the_radar"):
        fields.append({"name": "On the radar", "value": report["on_the_radar"]})
    if tracked:
        fields.append({"name": "Names the forge tracks", "value": "\n".join(tracked)})
    return {
        "title": f"📰 News rollup · {span}",
        "description": "\n\n".join(p for p in parts if p),
        "fields": fields,
        "footer": {"text": f"Market Mind · {n_events} events "
                           f"({n_flagged} over the old alert bar) · recap, not a call"},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="print the card, send nothing, write no ledger row")
    ap.add_argument("--hours", type=float,
                    help="override the window (ignores the rollup ledger)")
    args = ap.parse_args()

    end = _now()
    impact_thr, novelty_thr = get_alert_thresholds()
    with get_db_connection() as conn:
        start = (end - datetime.timedelta(hours=args.hours) if args.hours
                 else window_start(conn, end))
        logs = gather(conn, start, end, impact_thr, novelty_thr)

    if not logs:
        print(f"no events in {start.isoformat()}..{end.isoformat()} — nothing sent")
        return 0

    report, _ = generate_daily_report(logs, window_hours=round(
        (end - start).total_seconds() / 3600, 1))
    if not report:
        print("rollup generation failed", file=sys.stderr)
        return 1

    embed = build_embed(report, start, end, len(logs),
                        sum(1 for l in logs if l["flagged"]), tracked_names(logs))
    if args.dry_run:
        print(json.dumps(embed, indent=2, ensure_ascii=False))
        return 0

    # Send-then-ledger: a failed send leaves no row, so the next run re-covers
    # this window instead of silently swallowing it.
    if not _post(embed, channel="low"):
        print("rollup send failed — no ledger row written", file=sys.stderr)
        return 1
    with get_db_connection() as conn:
        conn.execute("INSERT INTO news_rollups (window_start, window_end, n_events, "
                     "report_json, created_at) VALUES (?, ?, ?, ?, ?)",
                     (start.isoformat(), end.isoformat(), len(logs),
                      json.dumps(report), end.isoformat()))
        conn.commit()
    print(f"rollup sent: {len(logs)} events, {start.isoformat()}..{end.isoformat()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
