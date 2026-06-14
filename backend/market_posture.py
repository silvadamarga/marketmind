"""News-volatility posture nowcast — shadow / decision-support only.

Research basis (forge `remote/ml/PROGRESS_TEXT_ML.md`, 2026-06-14): across 1h–10d
horizons, the news corpus predicts next-day MOVE SIZE, not direction. The one
signal that survived a 3-seed walk-forward gate is a day-level volatility nowcast
from {event_count, mean_novelty, macro_share, net_sentiment} → next-day |SPY move|
(walk-forward OOS spearman ≈ +0.18, concentrated in high-VIX regimes). Direction,
embeddings, and longer horizons were all dead/artifactual.

This module computes a LIVE rolling-24h version as a regime POSTURE gauge:
how much volatility the current news flow implies vs its own trailing baseline.

Doctrine (collection-doctrine.md / node-integration.md): decision-support only.
Places no orders, gates no alerts. Like the ml_scorer it runs in "shadow mode" —
surfaced to the human, never automated into a trade.

Transparent z-composite (no learned model): the signal is marginal and the
codebase idiom (bot_logic.get_alert_thresholds) is trailing-window stats, not
shipped model artifacts. Every posture decomposes into its component z-scores so
the human sees WHY it reads ELEVATED.
"""
import datetime
import json
import math
import os
import time

from database import get_db_connection

# Oriented weights from the research per-feature day-level |spearman| vs |move|
# (novelty .35, macro .28, count .25, net_sent .20), normalized. All oriented so
# HIGHER = more implied volatility; net_sentiment is INVERTED (bearish skew → vol).
WEIGHTS = {"count": 0.23, "novelty": 0.32, "macro": 0.26, "net_sent": 0.19}
MACRO_CATEGORIES = ("MACRO", "GEOPOLITICS", "CENTRAL_BANK")

WINDOW_HOURS = 24          # rolling "current news flow" window
BASELINE_DAYS = 45         # trailing baseline the current window is z-scored against
MIN_BASELINE_DAYS = 12     # below this the baseline is too thin to trust
CACHE_TTL = 600            # seconds (posture moves slowly; loop refreshes every 15m)
HIGH_VIX = 20.0            # research effect is high-VIX-concentrated; flag it

# z-composite → label thresholds (tunable; bands give the regime-change alert
# natural hysteresis since transitions need a full band crossing).
LEVELS = [(-0.50, "CALM"), (0.75, "NORMAL"), (1.75, "ELEVATED"), (math.inf, "HIGH")]
LEVEL_RANK = {"CALM": 0, "NORMAL": 1, "ELEVATED": 2, "HIGH": 3}

STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "posture_state.json")
_CACHE = {"ts": 0.0, "posture": None}

_AGG = """
    SELECT
        COUNT(*) AS n,
        AVG(CAST(json_extract(ai_analysis_json,'$.novelty_score') AS REAL)) AS nov,
        AVG(CASE WHEN category IN ('MACRO','GEOPOLITICS','CENTRAL_BANK') THEN 1.0 ELSE 0.0 END) AS macro,
        AVG(CASE WHEN sentiment='BULLISH' THEN 1.0 WHEN sentiment='BEARISH' THEN -1.0 ELSE 0.0 END) AS net
    FROM news_events
    WHERE timestamp >= ?
      AND COALESCE(json_extract(ai_analysis_json,'$.status'),'OK') != 'FAILED'
"""

_DAILY = """
    SELECT substr(timestamp,1,10) AS d,
        COUNT(*) AS n,
        AVG(CAST(json_extract(ai_analysis_json,'$.novelty_score') AS REAL)) AS nov,
        AVG(CASE WHEN category IN ('MACRO','GEOPOLITICS','CENTRAL_BANK') THEN 1.0 ELSE 0.0 END) AS macro,
        AVG(CASE WHEN sentiment='BULLISH' THEN 1.0 WHEN sentiment='BEARISH' THEN -1.0 ELSE 0.0 END) AS net
    FROM news_events
    WHERE timestamp >= ? AND timestamp < ?
      AND COALESCE(json_extract(ai_analysis_json,'$.status'),'OK') != 'FAILED'
    GROUP BY d
"""


def _mean_std(xs):
    xs = [x for x in xs if x is not None]
    if len(xs) < 2:
        return None, None
    m = sum(xs) / len(xs)
    var = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return m, math.sqrt(var)


def _label(score):
    for thr, name in LEVELS:
        if score < thr:
            return name
    return "HIGH"


def get_posture(vix=None, force=False):
    """Compute the current news-vol posture. `vix` is passed in by the caller
    (monitor cache / API) to avoid a circular import. Cached for CACHE_TTL.
    Returns a dict; on a too-thin baseline returns label 'UNKNOWN' (degrades,
    never raises)."""
    now = time.time()
    if not force and _CACHE["posture"] is not None and now - _CACHE["ts"] < CACHE_TTL:
        p = dict(_CACHE["posture"])
        p["vix"] = vix if vix is not None else p.get("vix")
        return p

    try:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        cur_cut = (now_utc - datetime.timedelta(hours=WINDOW_HOURS)).isoformat()
        base_lo = (now_utc - datetime.timedelta(days=BASELINE_DAYS)).isoformat()
        today = now_utc.date().isoformat()
        with get_db_connection() as conn:
            cur = conn.execute(_AGG, (cur_cut,)).fetchone()
            daily = conn.execute(_DAILY, (base_lo, today)).fetchall()  # excludes today
    except Exception as e:
        return _degraded(f"db error: {e}", vix)

    n_cur = (cur["n"] if cur else 0) or 0
    if len(daily) < MIN_BASELINE_DAYS:
        return _degraded(f"baseline too thin ({len(daily)}d < {MIN_BASELINE_DAYS})", vix,
                         n_events=n_cur)

    # current-window feature values
    feats = {
        "count": math.log1p(n_cur),
        "novelty": cur["nov"],
        "macro": cur["macro"],
        "net_sent": cur["net"],
    }
    # baseline distributions (per-day)
    base = {
        "count": [math.log1p(r["n"]) for r in daily],
        "novelty": [r["nov"] for r in daily],
        "macro": [r["macro"] for r in daily],
        "net_sent": [r["net"] for r in daily],
    }

    components, score = {}, 0.0
    for k in WEIGHTS:
        m, s = _mean_std(base[k])
        v = feats[k]
        z = (v - m) / s if (m is not None and s and v is not None) else 0.0
        oriented = -z if k == "net_sent" else z   # bearish skew (low net_sent) → vol
        score += WEIGHTS[k] * oriented
        components[k] = {
            "value": _round(v, 3), "baseline_mean": _round(m, 3),
            "z": _round(z, 2), "oriented_z": _round(oriented, 2),
            "weight": WEIGHTS[k],
        }

    posture = {
        "score": _round(score, 3),
        "label": _label(score),
        "n_events": n_cur,
        "components": components,
        "vix": _round(vix, 2) if vix else None,
        "high_vix": bool(vix and vix >= HIGH_VIX),
        "basis": f"rolling-{WINDOW_HOURS}h vs {BASELINE_DAYS}d baseline ({len(daily)}d)",
        "as_of": now_utc.isoformat(),
        "note": "shadow / decision-support — predicts move SIZE not direction; "
                "most reliable when VIX elevated",
    }
    _CACHE.update(ts=now, posture=posture)
    return posture


def _degraded(reason, vix, n_events=0):
    return {
        "score": None, "label": "UNKNOWN", "n_events": n_events,
        "components": {}, "vix": _round(vix, 2) if vix else None,
        "high_vix": bool(vix and vix >= HIGH_VIX),
        "basis": "unavailable", "as_of": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "note": f"posture unavailable: {reason}",
    }


# --- regime-change detection (drives the dedicated Discord alert) ---

def _load_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def _save_state(state):
    try:
        with open(STATE_PATH, "w") as f:
            json.dump(state, f)
    except Exception as e:
        print(f"⚠️ posture state save failed: {e}")


def check_regime_change(vix=None):
    """Compute posture; if the LEVEL changed since last check, return
    (old_label, new_label, posture) and persist the new level. Otherwise None.
    UNKNOWN never triggers an alert. Called from the macro monitor loop."""
    posture = get_posture(vix=vix, force=True)
    new = posture["label"]
    if new == "UNKNOWN":
        return None
    state = _load_state()
    old = state.get("label")
    if old == new:
        return None
    _save_state({"label": new, "score": posture["score"], "ts": posture["as_of"]})
    if old is None:               # first observation after deploy: seed, don't alert
        return None
    return old, new, posture


def _round(v, n):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, n) if math.isfinite(f) else None
