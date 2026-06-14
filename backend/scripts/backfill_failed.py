"""Re-analyze news_events rows whose Gemini analysis FAILED.

Most failures are the 2026-04-20 -> 2026-05-03 outage (Gemini 2.x died);
this re-runs the exact live analysis path (analysis.get_gemini_analysis,
current model = gemini-flash-latest / 3.5) on the stored title+body and
updates the row in place. Timestamps and context_json (the market snapshot
taken at event time) are never touched. Each backfilled analysis carries a
"backfill" key with date + model so audits and the ML ETL can tell these
rows apart from live annotations.

Safe to re-run: rows whose status is no longer FAILED are skipped, so an
interrupted run resumes where it left off. Embeddings are generated for
impact >= 5, same as the live worker.

Run on the production server from backend/:
    venv/bin/python scripts/backfill_failed.py --dry-run     # count + preview
    venv/bin/python scripts/backfill_failed.py --limit 20    # smoke test
    venv/bin/python scripts/backfill_failed.py               # full run (~25 min)
"""

import argparse
import datetime
import json
import os
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis import get_gemini_analysis, get_text_embedding
from config import DB_FILE
from database import json_safe


def is_failed(ai_json):
    try:
        return json.loads(ai_json).get("status") == "FAILED"
    except (json.JSONDecodeError, TypeError):
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_FILE)
    ap.add_argument("--limit", type=int, default=0, help="0 = all")
    ap.add_argument("--sleep", type=float, default=1.0,
                    help="seconds between Gemini calls")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db, timeout=30)
    conn.row_factory = sqlite3.Row
    rows = [r for r in conn.execute(
        "SELECT id, title, body, source_app, ai_analysis_json FROM news_events"
        " WHERE ai_analysis_json LIKE '%FAILED%' ORDER BY id").fetchall()
        if is_failed(r["ai_analysis_json"])]
    print(f"{len(rows)} FAILED rows in {args.db}")
    if args.dry_run:
        for r in rows[:5]:
            print(f"  id {r['id']}: {(r['title'] or '')[:70]}")
        conn.close()
        return
    if args.limit:
        rows = rows[:args.limit]

    stamp = {"date": datetime.date.today().isoformat(),
             "model": "gemini-flash-latest", "orig_status": "FAILED"}
    done = failed = 0
    for i, r in enumerate(rows):
        analysis, _ = get_gemini_analysis(r["title"] or "", r["body"] or "",
                                          r["source_app"])
        if not analysis or analysis.get("impact_score") is None \
                or not (analysis.get("sentiment_label") or analysis.get("sentiment")):
            failed += 1
            print(f"  id {r['id']}: analysis failed again, left as-is")
            time.sleep(args.sleep)
            continue

        analysis = json_safe(analysis)
        analysis["backfill"] = stamp
        sentiment = analysis.get("sentiment_label") or analysis.get("sentiment")
        tickers = analysis.get("tickers") or []
        ticker = tickers[0] if tickers else analysis.get("ticker")
        impact = analysis.get("impact_score", 0)
        embedding = None
        if impact >= 5:
            embedding = get_text_embedding(f"{r['title']} {r['body']}")

        conn.execute(
            """UPDATE news_events SET ai_analysis_json = ?, sentiment = ?,
               impact_score = ?, related_ticker = ?, category = ?,
               embedding = COALESCE(?, embedding) WHERE id = ?""",
            (json.dumps(analysis), sentiment, impact, ticker,
             analysis.get("category") or analysis.get("event_category"),
             embedding, r["id"]))
        conn.commit()
        done += 1
        if done % 25 == 0:
            print(f"  {done}/{len(rows)} backfilled ...")
        time.sleep(args.sleep)

    conn.close()
    print(f"done: {done} backfilled, {failed} failed again, "
          f"{len(rows) - done - failed} skipped")


if __name__ == "__main__":
    main()
