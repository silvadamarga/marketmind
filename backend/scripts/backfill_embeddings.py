"""Backfill missing embeddings on impact >= 5 news_events rows.

text-embedding-004 was retired by Google ~Feb 2026 and the silent except in
get_text_embedding hid it: zero embeddings stored 2026-03 until the d60c608
fix (gemini-embedding-001, 768 dims). This embeds every impact >= 5 row with
a NULL embedding — the live worker's threshold — using the same call and
storage format as the live path (JSON array string of the vector values).

Note: rows embedded before the outage carry text-embedding-004 vectors; this
fills the gap with gemini-embedding-001, same as live writes since the fix.
The column has no model stamp — any future similarity use must treat
pre-2026-03 vectors as a different space.

Safe to re-run: only NULL-embedding rows are selected, so an interrupted run
resumes where it left off.

Run on the production server from backend/:
    venv/bin/python scripts/backfill_embeddings.py --dry-run    # count + preview
    venv/bin/python scripts/backfill_embeddings.py --limit 20   # smoke test
    venv/bin/python scripts/backfill_embeddings.py              # full run
"""

import argparse
import os
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis import get_text_embedding
from config import DB_FILE


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_FILE)
    ap.add_argument("--limit", type=int, default=0, help="0 = all")
    ap.add_argument("--sleep", type=float, default=0.5,
                    help="seconds between embedding calls")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db, timeout=30)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, timestamp, title, body FROM news_events"
        " WHERE embedding IS NULL AND impact_score >= 5"
        " ORDER BY id").fetchall()
    print(f"{len(rows)} impact>=5 rows without embedding in {args.db}")
    if args.dry_run:
        for r in rows[:5]:
            print(f"  id {r['id']} ({r['timestamp'][:10]}): {(r['title'] or '')[:70]}")
        conn.close()
        return
    if args.limit:
        rows = rows[:args.limit]

    done = failed = 0
    for r in rows:
        emb = get_text_embedding(f"{r['title']} {r['body']}")
        if emb is None:
            failed += 1
            print(f"  id {r['id']}: embedding failed, left NULL")
            time.sleep(args.sleep)
            continue
        conn.execute("UPDATE news_events SET embedding = ? WHERE id = ?",
                     (emb, r["id"]))
        conn.commit()
        done += 1
        if done % 100 == 0:
            print(f"  {done}/{len(rows)} embedded ...")
        time.sleep(args.sleep)

    conn.close()
    print(f"done: {done} embedded, {failed} failed")


if __name__ == "__main__":
    main()
