"""Serve side of the forge's weekly recap: read the weekly_recap.json the forge
pushes every Sunday (scrape weekly-log --push) and expose it to the Weekly page.

Same transport as forge_brief.py: the forge (heavy, may go dark) uploads a
snapshot, we read it with an mtime cache and surface its age. The file is the
PUBLIC projection only — recap, stories, themes, calendar. The forge's trade
ideas never leave the forge, so there is nothing here to strip.
"""
import json
import os
from datetime import date, datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "weekly_recap.json")

# A recap covers one week; past a second Sunday the next one is late.
_STALE_DAYS = 9

_CACHE = {"mtime": None, "data": None}


def _load_file():
    """Parsed recap dict, reloaded when the file changes. None if absent/corrupt."""
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
    """The recap enriched with its age, or None if the forge has never pushed."""
    snap = _load_file()
    if not snap:
        return None
    try:
        age = (datetime.now(timezone.utc).date() - date.fromisoformat(snap["window_end"])).days
    except (KeyError, ValueError, TypeError):
        age = None
    return {**snap, "age_days": age, "stale": age is None or age > _STALE_DAYS}
