"""Serve side of the G5 decide pipe: read the decide.json shortlist the forge's
daily pipeline pushes and look up a ticker's blended conviction at alert time.

Mirror of llm_calls.py, and deliberately on its 5-day hard cutoff rather than
forge_rank's 14-day ladder: the artifact carries governor sizes/stops computed
off a specific book + regime day, and a week-old size is misinformation, not
context. Annotation only — never gates an alert, never boosts priority.
"""
import json
import os
from datetime import date, datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "decide.json")

# Hard cutoff (days) past which the shortlist is stale enough to be silence.
_MAX_AGE_DAYS = 5

_CACHE = {"mtime": None, "index": None, "as_of": None, "n": None}


def _load():
    """Return ({ticker -> (position, row)}, as_of, n), reloading when the file
    changes. (None, None, None) if absent/unreadable (the forge has never
    pushed). Rows arrive sorted by conviction, so 1-based position = the
    name's standing in the day's blend."""
    try:
        mtime = os.path.getmtime(_PATH)
    except OSError:
        return None, None, None
    if _CACHE["mtime"] != mtime:
        try:
            with open(_PATH) as f:
                snap = json.load(f)
            rows = snap.get("rows") or []
            _CACHE["index"] = {r["ticker"]: (i, r) for i, r in enumerate(rows, 1)
                               if r.get("ticker")}
            _CACHE["as_of"] = snap.get("as_of")
            _CACHE["n"] = len(rows)
            _CACHE["mtime"] = mtime
        except (OSError, ValueError, TypeError):
            return None, None, None
    return _CACHE["index"], _CACHE["as_of"], _CACHE["n"]


def _age_days(as_of: str):
    try:
        d = date.fromisoformat(as_of)
    except (ValueError, TypeError):
        return None
    return (datetime.now(timezone.utc).date() - d).days


def lookup(ticker: str):
    """The forge's blended read on `ticker` — conviction, standing (#pos/n),
    and the governor's verdict (size/stop when actionable, block reason when
    not) — or None when there is no snapshot, the ticker isn't in it, or the
    snapshot is older than _MAX_AGE_DAYS."""
    if not ticker:
        return None
    index, as_of, n = _load()
    if not index:
        return None
    hit = index.get(ticker)
    if hit is None:
        return None
    age = _age_days(as_of)
    if age is None or age > _MAX_AGE_DAYS:
        return None
    pos, row = hit
    return {
        "conviction": row.get("conviction"),
        "position": pos,
        "n": n,
        "actionable": row.get("actionable"),
        "block": row.get("block"),
        "size_eur": row.get("size_eur"),
        "stop_price": row.get("stop_price"),
        "as_of": as_of,
        "age_days": age,
    }
