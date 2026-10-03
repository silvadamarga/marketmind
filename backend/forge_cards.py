"""Serve side of the forge's intraday position cards (forge plan 27, F1): read
the forge_cards.json the forge pushes after a selector run that wrote a card
(scrape flash-select --push) and expose it to the feed's per-name strip.

Same transport as history.py: the forge builds, we read with an mtime cache and
surface the age. Nothing is computed here. The file carries the human's held
quantities and P/L, which is why the forge refuses to push it while the public
vhost answers — this box only ever serves it on the tailnet.
"""
import json
import os
from datetime import date

_PATH = os.path.join(os.path.dirname(__file__), "forge_cards.json")

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
    """The day's cards, or None. A file for another day is not today's strip:
    the forge only rewrites it when a card lands, so a quiet morning still
    holds yesterday's — say so instead of showing it as current."""
    snap = _load_file()
    if not snap:
        return None
    today = snap.get("run_day") == date.today().isoformat()
    return {**snap, "today": today, "cards": snap.get("cards", []) if today else []}
