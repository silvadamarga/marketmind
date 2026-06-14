"""Shadow-mode ML scorer (TRAINING_PLAN.md Phase 7).

Rebuilds the training feature vector from the live context (see
ml/train_lgbm.py build_features) and scores the event with the exported
LightGBM 1d-direction model. Predictions are logged for comparison against
realized returns — they must not gate alerts during the shadow period.

The backtest verdict was ranker/filter only: treat `score` (P(UP) - P(DOWN))
as a sort key, not a trade signal.
"""

import datetime
import json
import math
import os

import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml_model")

_BOOSTER = None
_SPEC = None

SENTIMENT_ORD = {"BEARISH": -1.0, "NEGATIVE": -1.0, "NEUTRAL": 0.0, "BULLISH": 1.0}
CANONICAL_CATEGORIES = {"RATING", "MACRO", "CENTRAL_BANK", "GEOPOLITICS",
                        "REGULATION", "SENTIMENT", "CRYPTO", "REAL_ESTATE", "OTHER"}

# Era calibration: the model was trained on ~95% Gemini-2 annotations, but
# live scores come from Gemini 3.5 with a shifted distribution (see CLAUDE.md
# "LLM version break"). Quantile-map live impact/novelty back onto the
# Gemini-2 scale before scoring. Anchors computed 2026-06-10 from root-DB era
# marginals (g2 = ≤2026-04-19, g3.5 = ≥2026-05-04, non-FAILED, non-backfill);
# recompute on the next model/config break or when the model is retrained on
# 3.5-era data.
ERA_CALIBRATION = {
    "impact": ([0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
               [0.55, 0.86, 1.73, 2.65, 3.31, 4.0, 4.6, 6.02, 7.22, 8.43]),
    "novelty": ([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
                [1.55, 2.99, 4.05, 5.36, 5.89, 6.18, 6.43, 7.02, 7.46, 8.77]),
}
# Confidence is pinned at ~9 post-switch (vs 7.39±0.70 in training data) —
# no variance left to map, so neutralize to the training-era mean.
CONFIDENCE_TRAIN_MEAN = 7.39


def _era_map(feat, v):
    if math.isnan(v):
        return v
    xs, ys = ERA_CALIBRATION[feat]
    return float(np.interp(v, xs, ys))


def _load():
    global _BOOSTER, _SPEC
    if _BOOSTER is None:
        import lightgbm as lgb
        with open(os.path.join(MODEL_DIR, "feature_spec.json")) as f:
            _SPEC = json.load(f)
        _BOOSTER = lgb.Booster(model_file=os.path.join(MODEL_DIR, _SPEC["model_file"]))
    return _BOOSTER, _SPEC


def _clean_ticker(raw, spec):
    if not raw:
        return None
    t = str(raw).strip().upper()
    t = spec["ticker_aliases"].get(t, t)
    if t in spec["ticker_null"] or "." in t:
        return None
    return t


def _clean_category(raw, spec):
    if not raw:
        return "OTHER"
    c = str(raw).strip().upper()
    c = spec["category_aliases"].get(c, c)
    return c if c in CANONICAL_CATEGORIES else "OTHER"


def _to_float(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else float("nan")
    except (TypeError, ValueError):
        return float("nan")


def _sent_count_3d(ticker):
    """Bullish-minus-bearish news_events count for the ticker, trailing 72h."""
    if not ticker:
        return 0.0
    from database import get_db_connection
    cutoff = (datetime.datetime.now(datetime.timezone.utc)
              - datetime.timedelta(hours=72)).isoformat()
    with get_db_connection() as conn:
        row = conn.execute(
            """SELECT SUM(CASE sentiment WHEN 'BULLISH' THEN 1
                          WHEN 'BEARISH' THEN -1 WHEN 'NEGATIVE' THEN -1
                          ELSE 0 END)
               FROM news_events WHERE related_ticker = ? AND timestamp >= ?""",
            (ticker, cutoff)).fetchone()
    return float(row[0] or 0)


def score_event(analysis, macro_data, session, sector_json):
    """Returns {"p_up","p_flat","p_down","score","model"} or None on failure.
    Must never raise into the worker loop."""
    try:
        booster, spec = _load()
        feats = {}

        sent = analysis.get("sentiment_label") or analysis.get("sentiment")
        feats["sentiment"] = SENTIMENT_ORD.get(sent, float("nan"))
        feats["impact"] = _era_map("impact", _to_float(analysis.get("impact_score")))
        feats["novelty"] = _era_map("novelty", _to_float(analysis.get("novelty_score")))
        conf = _to_float(analysis.get("confidence") or analysis.get("ai_confidence"))
        feats["confidence"] = CONFIDENCE_TRAIN_MEAN if not math.isnan(conf) else conf

        macro = macro_data or {}
        for k in ["market_vix", "yield_10y", "price_dxy", "spy_200d_sma_dist",
                  "market_breadth", "days_until_fomc", "days_until_cpi",
                  "days_until_nfp"]:
            feats[k] = _to_float(macro.get(k))

        rel = macro.get("sector_rel_strength")
        if isinstance(rel, str):
            try: rel = json.loads(rel)
            except Exception: rel = {}
        for k, v in (rel or {}).items():
            feats[f"rel_{k}"] = _to_float(v)

        sectors = sector_json
        if isinstance(sectors, str):
            try: sectors = json.loads(sectors)
            except Exception: sectors = {}
        for k, v in (sectors or {}).items():
            col = (str(k).replace("^", "").replace("-", "_")
                   .replace(".", "_").replace("=", ""))
            feats[f"chg_{col}"] = _to_float(v)

        tickers = analysis.get("tickers") or []
        raw_ticker = tickers[0] if tickers else analysis.get("ticker")
        ticker = _clean_ticker(raw_ticker, spec)
        feats["label_on_ticker"] = 1.0 if ticker in spec["instruments"] else 0.0

        cat = _clean_category(analysis.get("category")
                              or analysis.get("event_category"), spec)
        feats[f"cat_{cat}"] = 1.0
        if session:
            feats[f"phase_{session}"] = 1.0
        for t in analysis.get("ml_tags") or []:
            feats[f"tag_{str(t).strip().lower().replace(' ', '_')}"] = 1.0

        feats["sent_count_3d"] = _sent_count_3d(ticker)

        vec = np.array([[
            feats.get(name, 0.0 if name.startswith(("cat_", "phase_", "tag_"))
                      else float("nan"))
            for name in spec["features"]]])
        p_down, p_flat, p_up = booster.predict(vec)[0]
        return {
            "p_up": round(float(p_up), 4),
            "p_flat": round(float(p_flat), 4),
            "p_down": round(float(p_down), 4),
            "score": round(float(p_up - p_down), 4),
            "model": spec["model_version"],
        }
    except Exception as e:
        print(f"⚠️ ML scoring failed: {e}")
        return None
