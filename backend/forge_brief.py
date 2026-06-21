"""Serve side of the forge briefing transport: read the forge_brief.json digest
the forge pushes (deep-cohort fundamental composite ranking) and expose it to the
inspiration page.

Like forge_rank.py, the forge (heavy, may go dark) uploads a daily snapshot; we
read it with an mtime cache and surface its age. Fundamentals move slowly, so a
slightly stale digest is still useful — we read `as_of`, flag staleness, never
hard-gate. None when the forge has never pushed or the file is corrupt.
"""
import json
import os
from datetime import date, datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "forge_brief.json")

# Snapshot age (days). Fundamentals move ~quarterly; a 2-week-old digest is fine.
_STALE_DAYS = 14
_VERY_STALE_DAYS = 30

_CACHE = {"mtime": None, "data": None}


def _load_file():
    """Parsed digest dict, reloaded when the file changes. None if absent/corrupt."""
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


def _age_days(as_of):
    try:
        d = date.fromisoformat(as_of)
    except (ValueError, TypeError):
        return None
    return (datetime.now(timezone.utc).date() - d).days


def _staleness(age):
    if age is None:
        return "unknown"
    if age <= _STALE_DAYS:
        return "fresh"
    if age <= _VERY_STALE_DAYS:
        return "stale"
    return "very_stale"


def load():
    """The forge digest enriched with freshness, or None if no snapshot. Shape:
    {as_of, generated_at, regime, weights, cohort:[...], summary, brief_version,
     age_days, staleness}."""
    snap = _load_file()
    if not snap:
        return None
    age = _age_days(snap.get("as_of"))
    return {
        **snap,
        "age_days": age,
        "staleness": _staleness(age),
    }
