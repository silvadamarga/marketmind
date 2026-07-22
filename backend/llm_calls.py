"""Serve side of the trader-call pipe (vps-trader-integration V2): read the
llm_decision.json snapshot the forge's pre-open chain pushes and look up a
ticker's trader call at alert time.

Mirror of forge_rank.py with one deliberate difference: calls decay fast,
unlike fundamentals. A call is annotated with its age up to 5 days (weekend-safe
— Friday's call still labels a Monday alert), then suppressed entirely; do not
copy forge_rank's 14-day staleness ladder here. Annotation only — never gates,
never boosts priority.
"""
import json
import os
from datetime import date, datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "llm_decision.json")

# Hard cutoff (days) past which a call is stale enough to be silence.
_MAX_AGE_DAYS = 5

_CACHE = {"mtime": None, "index": None, "as_of": None}


def _load():
    """Return ({ticker -> call}, as_of), reloading when the file changes.
    (None, None) if absent/unreadable (the forge has never pushed)."""
    try:
        mtime = os.path.getmtime(_PATH)
    except OSError:
        return None, None
    if _CACHE["mtime"] != mtime:
        try:
            with open(_PATH) as f:
                snap = json.load(f)
            _CACHE["index"] = {c["ticker"]: c for c in snap.get("calls", [])
                               if c.get("ticker")}
            _CACHE["as_of"] = snap.get("as_of")
            _CACHE["mtime"] = mtime
        except (OSError, ValueError, TypeError):
            return None, None
    return _CACHE["index"], _CACHE["as_of"]


def _age_days(as_of: str) -> int | None:
    try:
        d = date.fromisoformat(as_of)
    except (ValueError, TypeError):
        return None
    return (datetime.now(timezone.utc).date() - d).days


def lookup(ticker: str) -> dict | None:
    """The trader's call for `ticker` — {call, confidence, as_of, age_days} —
    or None when there is no snapshot, the ticker wasn't called, or the call
    is older than _MAX_AGE_DAYS (a week-old call is noise, not context)."""
    if not ticker:
        return None
    index, as_of = _load()
    if not index:
        return None
    entry = index.get(ticker)
    if entry is None:
        return None
    age = _age_days(as_of)
    if age is None or age > _MAX_AGE_DAYS:
        return None
    return {
        "call": entry.get("call"),
        "confidence": entry.get("confidence"),
        "as_of": as_of,
        "age_days": age,
    }
