"""Serve side of the forge's history snapshot: read the history.json the forge
pushes after the pre-open chain (scrape history-build --push) and expose it to
the History tab.

Same transport as weekly_recap.py: the forge builds, we read with an mtime cache
and surface the age. Nothing is computed here. The file carries the human's own
fills and book events, which is why the forge refuses to push it while the
public vhost answers — this box only ever serves it on the tailnet.
"""
import json
import os
from datetime import date, datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "history.json")

# Built every weekday pre-open; past a long weekend plus a missed run it is late.
_STALE_DAYS = 4

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


def load():
    """The snapshot enriched with its age, or None if the forge has never pushed."""
    snap = _load_file()
    if not snap:
        return None
    try:
        built = datetime.fromisoformat(snap["built_at"]).date()
        age = (datetime.now(timezone.utc).date() - built).days
    except (KeyError, ValueError, TypeError):
        age = None
    return {**snap, "age_days": age, "stale": age is None or age > _STALE_DAYS}
