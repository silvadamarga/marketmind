"""Serve side of the forge's site feed (forge plan 41 M3): everything the forge
writes for the human to read rather than react to, the news flashes, the
Sunday card, the nightly status, the dev log, and a copy of every Signal page.

Same transport as live.py: the forge builds `feed.json` and pushes it when its
log changes (the minutely forge-outbox unit); we read with an mtime cache and
surface the age. Nothing is computed here. The file carries book lines, which
is why the forge refuses to push it while the public vhost answers.
"""
import json
import os
from datetime import datetime, timezone

_DIR = os.path.dirname(__file__)
_PATH = os.path.join(_DIR, "feed.json")

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


def payload(now=None):
    snap = _load_file()
    if not snap:
        return {"message": "No feed from the forge yet.", "items": []}
    now = now or datetime.now(timezone.utc)
    built = snap.get("built_at")
    age = None
    if built:
        age = int((now - datetime.fromisoformat(built.replace("Z", "+00:00"))).total_seconds())
    return {"built_at": built, "age_s": age, "days": snap.get("days"),
            "items": snap.get("items", [])}
