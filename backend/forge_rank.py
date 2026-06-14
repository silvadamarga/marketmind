"""Serve side of pipe 2: read the forge_rank.json snapshot the forge pushes and
look up a ticker's rank + fundamentals at alert time.

The forge (heavy, may go dark) uploads a daily rank + fundamental snapshot; this
node joins a live news event to it by plain symbol. Fundamentals move slowly, so
a slightly stale snapshot is still useful — we read `as_of`, surface its age, and
let the alert annotate (priority boost), never suppress (a hard gate would kill
alerts whenever the forge is down). Cached + reloaded on file mtime so a freshly
pushed snapshot is picked up without a restart.
"""
import json
import os
from datetime import date, datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "forge_rank.json")

# Snapshot age (days) past which we flag the rank as decreasingly trustworthy.
# Fundamentals move ~quarterly, so a 2-week-old rank is still mostly valid.
_STALE_DAYS = 14
_VERY_STALE_DAYS = 30

_CACHE = {"mtime": None, "data": None}


def _load():
    """Return the parsed snapshot dict, reloading when the file changes. None if
    absent/unreadable (the forge has never pushed, or the file is corrupt)."""
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


def _age_days(as_of: str) -> int | None:
    try:
        d = date.fromisoformat(as_of)
    except (ValueError, TypeError):
        return None
    return (datetime.now(timezone.utc).date() - d).days


def lookup(ticker: str) -> dict | None:
    """Forge rank entry for `ticker`, enriched with snapshot freshness, or None
    if there is no snapshot or the ticker is absent from it."""
    if not ticker:
        return None
    snap = _load()
    if not snap:
        return None
    entry = snap.get("ranks", {}).get(ticker)
    if entry is None:
        return None

    age = _age_days(snap.get("as_of"))
    if age is None:
        staleness = "unknown"
    elif age <= _STALE_DAYS:
        staleness = "fresh"
    elif age <= _VERY_STALE_DAYS:
        staleness = "stale"
    else:
        staleness = "very_stale"

    return {
        **entry,
        "as_of": snap.get("as_of"),
        "age_days": age,
        "staleness": staleness,
        "model_version": snap.get("model_version"),
    }
