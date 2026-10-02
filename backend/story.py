"""Story ids — which feed rows are the same story (reposts / rewordings).

At ingest each row's headline (`body`; `title` is the source name) is embedded
and joined to the story of the most similar row from the previous 48h, or starts
its own. The feed stacks rows that share a story_id; rows without one (embedding
failed, or older than the backfill) fall back to the frontend's word grouping.

Calibrated 2026-10-02 on 500 live feed rows, gemini-embedding-001 at 768 dims,
default task type (it separated same-story from different-story pairs better than
SEMANTIC_SIMILARITY: worst same 0.743 vs best different 0.837, against 0.865 vs
0.953). At 0.80 over 36 hand-labelled pairs: 1 reworded pair missed, 2 borderline
merges; 28 multi-headline stories, the largest 5 rows, no chaining.

Vectors are stored as float32 bytes (3 KB/row), not JSON like `embedding`
(~16 KB/row): the DB ships whole to the forge.
"""
import datetime
import json

import numpy as np

STORY_THETA = 0.80          # cosine similarity at/above which two headlines are one story
STORY_WINDOW_HOURS = 48     # how far back a new row looks for its story
# Macro/geo rows carry proxy tickers Gemini picks inconsistently (gold as GLD on
# one repost, XAU/USD on the next), so only company news is split by ticker.
MACRO_CATS = {"MACRO", "GEOPOLITICS", "CENTRAL_BANK"}


def to_blob(vec_json):
    """get_text_embedding's JSON string -> unit-norm float32 bytes, or None."""
    if not vec_json:
        return None
    v = np.asarray(json.loads(vec_json), dtype=np.float32)
    n = np.linalg.norm(v)
    return (v / n).tobytes() if n else None


def company_tickers(category, tickers):
    return set() if category in MACRO_CATS else set(tickers or [])


def find_story(cursor, blob, timestamp, category, tickers):
    """story_id of the most similar row in the STORY_WINDOW_HOURS before
    `timestamp` (ISO string, the news_events.timestamp format), or None if
    nothing reaches STORY_THETA. Two company-news rows whose tickers don't
    overlap never match ("Microchip is rising 5%" vs "Gartner is rising 5%")."""
    if blob is None:
        return None
    ts = datetime.datetime.fromisoformat(timestamp)
    since = (ts - datetime.timedelta(hours=STORY_WINDOW_HOURS)).isoformat()
    cursor.execute(
        "SELECT story_id, title_embedding, category, ai_analysis_json FROM news_events "
        "WHERE timestamp >= ? AND timestamp < ? "
        "AND title_embedding IS NOT NULL AND story_id IS NOT NULL",
        (since, timestamp))
    rows = cursor.fetchall()
    if not rows:
        return None
    v = np.frombuffer(blob, dtype=np.float32)
    sims = np.frombuffer(b"".join(r[1] for r in rows), dtype=np.float32).reshape(len(rows), -1) @ v
    mine = company_tickers(category, tickers)
    for i in np.argsort(-sims):
        if sims[i] < STORY_THETA:
            return None
        if mine:
            try:
                fa = json.loads(rows[i][3] or "{}")
            except ValueError:
                fa = {}
            theirs = company_tickers(rows[i][2], fa.get("tickers"))
            if theirs and not (mine & theirs):
                continue
        return rows[i][0]
    return None
