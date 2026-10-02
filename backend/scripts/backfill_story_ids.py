"""Backfill story ids (story.py) over the last N days of news_events.

Two passes:
  1. embed every row in the window whose title_embedding is NULL (the headline,
     `body`), 100 per Gemini call — same model/config as the live path;
  2. rebuild story_id for the whole window, oldest first, with the live rule
     (story.find_story), so the result is what live ingest would have written.

Pass 2 rewrites story_ids already in the window — safe, story_id is display
grouping only. Rows before the window keep theirs and are matched against.
Safe to re-run.

Run on the production server from backend/ (after a restart has applied the
title_embedding/story_id migration):
    venv/bin/python scripts/backfill_story_ids.py --dry-run
    venv/bin/python scripts/backfill_story_ids.py --days 7
"""

import argparse
import datetime
import json
import os
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import story
from config import DB_FILE

BATCH = 100


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_FILE)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    since = (datetime.datetime.now(datetime.timezone.utc)
             - datetime.timedelta(days=args.days)).isoformat()
    conn = sqlite3.connect(args.db, timeout=30)
    cur = conn.cursor()
    cur.execute("SELECT id, COALESCE(NULLIF(body, ''), title) FROM news_events "
                "WHERE timestamp >= ? AND title_embedding IS NULL ORDER BY timestamp", (since,))
    todo = cur.fetchall()
    total = cur.execute("SELECT COUNT(*) FROM news_events WHERE timestamp >= ?", (since,)).fetchone()[0]
    print(f"window since {since}: {total} rows, {len(todo)} need a headline embedding")
    if args.dry_run:
        return

    # pass 1: embed
    from analysis import client, EMBED_CONFIG
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        res = client.models.embed_content(model="gemini-embedding-001",
                                          contents=[t or "" for _, t in chunk],
                                          config=EMBED_CONFIG)
        cur.executemany("UPDATE news_events SET title_embedding = ? WHERE id = ?",
                        [(story.to_blob(json.dumps(e.values)), rid)
                         for (rid, _), e in zip(chunk, res.embeddings)])
        conn.commit()
        print(f"  embedded {min(i + BATCH, len(todo))}/{len(todo)}")
        time.sleep(0.5)

    # pass 2: rebuild story ids oldest first, one transaction
    cur.execute("UPDATE news_events SET story_id = NULL WHERE timestamp >= ?", (since,))
    rows = cur.execute(
        "SELECT id, timestamp, title_embedding, category, ai_analysis_json FROM news_events "
        "WHERE timestamp >= ? AND title_embedding IS NOT NULL ORDER BY timestamp, id",
        (since,)).fetchall()
    joined = 0
    for rid, ts, blob, category, fa in rows:
        try:
            tickers = json.loads(fa or "{}").get("tickers")
        except ValueError:
            tickers = None
        sid = story.find_story(cur, blob, ts, category, tickers)
        joined += sid is not None
        cur.execute("UPDATE news_events SET story_id = ? WHERE id = ?", (sid or rid, rid))
    conn.commit()
    print(f"story ids: {len(rows)} rows, {joined} joined an earlier story, "
          f"{len(rows) - joined} started one")


if __name__ == "__main__":
    main()
