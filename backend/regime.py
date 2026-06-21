"""Serve side of the regime pipe: read the regime_latest.json the forge pushes
and expose the current market-regime state (VIX level/state, term structure,
trend, deployment posture).

This is the ONE real signal the research left standing (VIX -> forward vol, 16yr).
The forge computes it (regime_features.py) and pushes a tiny JSON; this node just
serves it. Degrade-not-vanish: if the snapshot is absent or stale, status flips to
UNKNOWN and the card says so — never a forced or guessed posture. Cached + reloaded
on file mtime so a freshly pushed snapshot appears without a restart.
"""
import json
import os
from datetime import date, datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "regime_latest.json")

# Daily market data: a few sessions (incl. weekend) is fine; past that it's stale.
_STALE_DAYS = 4

_CACHE = {"mtime": None, "data": None}


def _load():
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


def _age_days(as_of: str):
    try:
        d = date.fromisoformat(as_of)
    except (ValueError, TypeError):
        return None
    return (datetime.now(timezone.utc).date() - d).days


def get_regime() -> dict:
    """Current regime state for the public card. Always returns a dict; status is
    'ok' | 'stale' | 'UNKNOWN'. No direction call — VIX is a sizing/vol signal."""
    snap = _load()
    if not snap:
        return {"status": "UNKNOWN", "reason": "no regime snapshot pushed yet"}
    age = _age_days(snap.get("as_of"))
    status = "ok"
    if age is None:
        status = "UNKNOWN"
    elif age > _STALE_DAYS:
        status = "stale"
    # direction_tilt is CONTEXT (backwardation historically precedes mean-reversion),
    # explicitly not a trade call — mirrors the forge governor's L2 context.
    tilt = "stress / mean-reversion context" if snap.get("backwardation") else "neutral"
    trend = None
    if snap.get("above_200dma") is not None:
        trend = "uptrend (>200dma)" if snap["above_200dma"] else "downtrend (<200dma)"
    return {
        "status": status,
        "as_of": snap.get("as_of"),
        "age_days": age,
        "vix": snap.get("vix"),
        "vix_state": snap.get("vix_state"),
        "term": snap.get("term"),
        "backwardation": snap.get("backwardation"),
        "trend": trend,
        "rv21": snap.get("rv21"),
        "max_deployed": snap.get("max_deployed"),
        "satellite": snap.get("satellite"),
        "direction_tilt": tilt,
        "note": "VIX = volatility/sizing signal, not a direction call",
    }
