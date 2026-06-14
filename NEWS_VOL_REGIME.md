# News-Vol Regime (the posture nowcast) — how it works, how to read it, how to improve it

Authoritative reference for the **news-volatility posture** signal: a live gauge of
how much market movement the current news flow implies. Deployed on the VPS
(`/api/posture`, Discord regime-change alerts, frontend banner), **shadow / decision-
support only — it places no orders and gates no alerts.**

For the full research chain that produced it (and the many dead ends), see
`PROGRESS_TEXT_ML.md`. This doc is the focused explainer for the *one thing that
survived*.

---

## 1. What it is, in one breath

A rolling read of the last 24h of Gemini-tagged headlines, scored against their own
45-day baseline, into a single number + label (**CALM / NORMAL / ELEVATED / HIGH**)
that estimates the **size** of the next day's market move — **not its direction.**

If you remember one thing: **ELEVATED ≠ "go long" or "go short." It means "expect a
bigger move, either way."** It is a *risk* gauge, not an *alpha* signal.

---

## 2. Why it exists (the research in three sentences)

We tested whether the news corpus predicts the market across horizons 1h→10d.
**Direction was dead everywhere** (AUC ≤0.52; embeddings, sentiment, per-stock — all
null or beta-artifacts). The **only** signal that survived a 3-seed walk-forward gate
was a day-level *volatility* nowcast: a handful of news-flow features predict the
**magnitude** of the next day's SPY move (walk-forward OOS spearman ≈ **+0.18**,
concentrated in high-VIX regimes). The posture is the live, rolling version of that.

It is **marginal but real**: gate-passing (confirm-half day-clustered t = +3.08, 7/7
months sign-consistent), yet fit on only ~90 confirm days, so treat it as a soft
context cue, not a precise forecast.

---

## 3. How it works (mechanics)

Implementation: `backend/market_posture.py`. Pipeline per refresh:

### 3.1 The four features (current 24h window)

| feature | definition | why it predicts move-size | sign |
|---|---|---|---|
| `log_n` | log(1 + event count) | news bursts precede volatility | + |
| `mean_novelty` | avg Gemini `novelty_score` | genuinely new info reprices the tape; repeats don't | + |
| `macro_share` | share of events in MACRO / GEOPOLITICS / CENTRAL_BANK | macro news moves the index, single-name doesn't | + |
| `net_sent` | (n_bullish − n_bearish) / n | **bearish skew → fear → vol** (asymmetric) | **−** |

Two sentiment shapes that were tested and **failed**, so are deliberately absent:
*disagreement* (`sent_disp`, dispersion) and *consensus strength* (`abs_net_sent`).
Only the **signed bearish tilt** carries information. Impact score is also dead.

### 3.2 Baseline + z-scores

Each feature's current-24h value is turned into a z-score against the **trailing 45
days** of *daily* values of that same feature (today excluded):

```
z = (current_24h_value − mean_of_last_45_daily_values) / std_of_those
```

This makes the gauge self-calibrating: "elevated" means *elevated relative to this
market's recent normal*, not against a fixed constant — so it survives drift in news
volume or LLM labeling.

### 3.3 Orientation, weighting, composite

All z-scores are **oriented** so higher = more implied vol. `net_sent` is inverted
(`oriented = −z`) because bearish skew (low net_sent) predicts bigger moves.

The composite is a weighted sum, weights from the research per-feature |spearman|:

```
score = 0.32·novelty_z + 0.26·macro_z + 0.23·count_z + 0.19·(−net_sent_z)
```

Transparent by design (like `decision.py` on the forge): every posture decomposes
into its component z-scores, so you can always see *which driver* is firing. No
learned model artifact — the signal is too marginal and the codebase idiom is
trailing-window stats (`bot_logic.get_alert_thresholds`).

### 3.4 Label

Composite score → band:

| score | label |
|---|---|
| < −0.50 | CALM |
| −0.50 … 0.75 | NORMAL |
| 0.75 … 1.75 | ELEVATED |
| ≥ 1.75 | HIGH |

(`UNKNOWN` when the baseline is too thin — <12 days — so it degrades, never lies.)

### 3.5 VIX context

The research effect is **concentrated in high-VIX regimes** (novelty→|move| spearman
+0.30 when VIX elevated vs ~0 when calm). So the posture carries the live VIX and a
`high_vix` flag (VIX ≥ 20). The flag does **not** change the score today — it tells
you *when to trust it more*.

### 3.6 Plumbing

- **Refresh / cache**: `get_posture()` caches for 10 min. The `macro_monitor_loop`
  (every 15 min) recomputes and checks for a regime change.
- **Regime-change alert**: `check_regime_change()` compares the new label to the last
  one in `posture_state.json`. On a band crossing it sends a dedicated Discord embed
  (`notifications.send_posture_alert`). First observation after a restart **seeds**
  the state silently (no alert storm). Bands give natural hysteresis.
- **API**: `GET /api/posture` returns the full dict (score, label, components, vix,
  basis, note). VIX comes from the monitor cache (passed in to avoid a circular
  import).
- **Frontend**: `PostureBanner.jsx` polls `/api/posture` every 60s and renders the
  strip under the header (color-coded label, top drivers, VIX flag).

---

## 4. How to read it (operator guide)

### 4.1 The label

- **CALM** — news flow quiet / stale / bullish-tilted. Expect a small next-day move.
- **NORMAL** — nothing notable; baseline conditions.
- **ELEVATED** — news flow is unusually voluminous / novel / macro-heavy / fearful.
  Expect a **bigger** next-day move. Whipsaw risk up.
- **HIGH** — strong multi-driver volatility signal. Outsized move likely (direction
  unknown).

### 4.2 Read the drivers, not just the label

The components tell you *why*. Examples:
- `novelty +2.2σ, macro +1.1σ` → genuinely new macro news (FOMC surprise, geopolitical
  break). The "real" version of elevated.
- `count +2σ` alone, novelty flat → a news *burst* of repetitive headlines. Less
  reliable; volume without novelty is partly noise.
- `net_sent +1.5σ` (i.e. very bearish skew, oriented positive) → fear-driven. Often
  the most tradeable-as-risk flavor.

### 4.3 Trust it more when `high_vix` is set

In calm-VIX regimes the relationship is weak — read ELEVATED there as a soft hint. In
elevated-VIX regimes it's where the research signal actually lived.

### 4.4 What to DO with it (defensive only)

It's a **posture** knob: size down / widen stops / expect chop / favor optionality
when ELEVATED-HIGH; normal risk when CALM-NORMAL. It never tells you *which way*.

### 4.5 What it is NOT

- **Not a direction call.** Bearish skew predicts *size*, not down-moves.
- **Not a trade trigger.** Shadow-only by doctrine (degrade-not-vanish: a stale forge
  or dead gauge must not silence/forge trades).
- **Not precise.** WF OOS spearman +0.18, p≈0.08, ~90-day fit. A nudge, not a number
  to lever against.

### 4.6 Known artifacts to not be fooled by

- **Stale data**: if the VPS news ingest stalls, the 24h window empties → `count_z`
  craters and the score drops spuriously. Cross-check `n_events`.
- **Early-window**: not an issue with rolling-24h (always a full day), unlike a
  calendar-day version would be.

---

## 5. How to make it better (roadmap, ranked by expected value)

### Tier 1 — cheap, high-confidence
1. **Re-gate on sealed data (DUE 2026-08-01).** The binding constraint is independent
   samples, not the model. PATTERN_LAB seals Jul-2026+ until 2026-08-01; rerun
   `gate_vol.py` + `test_sentiment_balance.py` with extended date splits to confirm
   the feature set still clears the bar out-of-sample. If it degrades, retune/demote.
2. **Live skill monitoring.** Log each day's posture score against the *realized*
   next-day SPY |move|; track a rolling live IC. This is the honest test (the offline
   gate is small-sample) and gives an auto-demote trigger if the edge dies.
3. **Formalize VIX-conditioning.** The effect lives in high-VIX (E6). Either gate the
   ELEVATED/HIGH labels behind `high_vix`, or add `vix_z` / `vix × novelty` as an
   explicit interaction term, instead of just flagging it.

### Tier 2 — moderate effort
4. **Calendar/event-risk features.** `days_until_fomc / cpi / nfp` already exist in
   `context_json`. Imminent macro prints are a strong a-priori vol driver; fold them
   into the composite (or as a multiplier).
5. **Intra-window decay.** Weight recent headlines (last 2-4h) heavier than 20h-old
   ones within the 24h window — a fresher nowcast for the next session.
6. **Better novelty.** The Gemini scalar `novelty_score` is coarse. The forge research
   has an embedding-based `novelty_7d` (cosine distance to recent headlines); a
   continuous, label-drift-proof novelty would likely beat the scalar.
7. **Target refinement.** We predict |SPY move|. Realized intraday vol or a
   VIX-change target may be cleaner / more directly tradeable (vega). Re-gate before
   swapping.

### Tier 3 — bigger / structural
8. **Faster (intraday) posture.** 1h showed the same modest magnitude effect
   (spearman +0.11). A 2-4h rolling gauge could front-run the daily one for the
   trader, at the cost of noisier signal.
9. **Per-sector / per-name posture.** Currently index-level. A sector-news → sector-ETF
   vol nowcast is plausible (the ETF price feed exists). **Per single stock needs a
   per-stock price feed** — the current ETF-only `market_data` makes every hedged
   per-name result beta-confounded (this is exactly what killed the "low-vol fade").
10. **Productize into sizing.** Today it's display + alert only. The natural next step
    is wiring posture into position-sizing / gross-exposure guidance — a deliberate
    trading-logic change, only after live monitoring (#2) shows the edge holds.

### What NOT to do (already tested, dead)
- Don't add direction prediction, raw embeddings, impact score, sentiment dispersion,
  or consensus strength — all null in the research.
- Don't chase longer horizons (3d+) — they fail for lack of independent samples, not
  model capacity.
- Don't promote it to a hard alert gate — violates the degrade-not-vanish doctrine.

---

## 6. Code & config map

| concern | location |
|---|---|
| computation, scoring, regime-change | `backend/market_posture.py` |
| Discord regime-change alert | `backend/notifications.py::send_posture_alert` |
| 15-min refresh + alert hook | `backend/monitor.py::macro_monitor_loop` |
| API endpoint | `backend/main.py::/api/posture` |
| frontend banner | `frontend/src/components/PostureBanner.jsx` (+ `App.jsx`) |
| persisted last-level | `backend/posture_state.json` |
| research / validation scripts | `ml/gate_vol.py`, `ml/test_sentiment_balance.py`, `ml/baseline_vol.py` |

**Tuning knobs** (top of `market_posture.py`): `WEIGHTS`, `WINDOW_HOURS` (24),
`BASELINE_DAYS` (45), `MIN_BASELINE_DAYS` (12), `CACHE_TTL` (600s), `HIGH_VIX` (20.0),
`LEVELS` (band thresholds). Change weights/bands here; re-validate via the gate
scripts before trusting any change.
