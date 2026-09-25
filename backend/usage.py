"""Gemini API usage ledger — every generate_content call records its token cost
so spend is queryable and a daily budget breach can alert.

Every LLM call in the backend runs on `gemini-flash-latest`, an alias Google
hot-swaps with ~2-week notice — a silent model swap is a silent price change, so
we stamp the model and price the tokens against a constant WE control. When the
swap notice lands, bump PRICING/ALIAS_MODEL below.

Degrade-not-vanish (mirrors notifications.py): a logging failure must NEVER break
the underlying LLM call. `log_usage` swallows everything.
"""
from __future__ import annotations

import datetime

from database import get_db_connection

# USD per 1M tokens. gemini-flash-latest currently → gemini-3.5-flash.
# Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2026-07-02).
# The output rate BILLS THINKING TOKENS TOO — Google folds thoughts into output.
PRICING = {
    "gemini-3.5-flash": {"in": 1.50, "out": 9.00},
    "gemini-3.1-flash-lite": {"in": 0.25, "out": 1.50},  # tagging (pinned id)
}
# What the alias resolves to today; keep in sync with the 2-week swap notice.
ALIAS_MODEL = "gemini-3.5-flash"

UTC = datetime.timezone.utc


def _rate(model: str) -> dict:
    return PRICING.get(model, PRICING[ALIAS_MODEL])


def cost_usd(model, prompt_tokens, output_tokens, thought_tokens) -> float:
    """Input at the in-rate; everything generated (candidates + thoughts) at the
    out-rate — Google bills thinking as output, so we lump the two to stay correct
    regardless of how the split is reported."""
    r = _rate(model)
    billed_out = (output_tokens or 0) + (thought_tokens or 0)
    return (prompt_tokens or 0) / 1e6 * r["in"] + billed_out / 1e6 * r["out"]


def log_usage(call_type: str, usage_metadata, model: str = ALIAS_MODEL) -> None:
    """Persist one call's token usage + estimated cost. Best-effort, never raises.
    `call_type` is a coarse bucket: analysis | synthesis | inspiration | daily_report."""
    try:
        um = usage_metadata
        pt = getattr(um, "prompt_token_count", 0) or 0
        ot = getattr(um, "candidates_token_count", 0) or 0
        tt = getattr(um, "thoughts_token_count", 0) or 0
        cost = cost_usd(model, pt, ot, tt)
        with get_db_connection() as conn:
            conn.execute(
                "INSERT INTO gemini_usage(ts, call_type, model, prompt_tokens,"
                " output_tokens, thought_tokens, est_cost_usd) VALUES (?,?,?,?,?,?,?)",
                (datetime.datetime.now(UTC).isoformat(), call_type, model,
                 pt, ot, tt, round(cost, 6)))
            conn.commit()
    except Exception as e:
        print(f"⚠️ usage-log failed ({call_type}): {e}")
