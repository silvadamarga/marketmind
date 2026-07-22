# Pattern Lab — systematic pattern mining on the existing dataset

Research track complementary to `TRAINING_PLAN_V2.md` (which stays authoritative
for the ranker pipeline). Goal: extract more signal hypotheses from the ~16k
events already collected, with discipline strong enough that findings survive
contact with the walk-forward gate. Motivated by the delayed-drift finding
(2026-06-10): one user observation → event study → real effect. This makes that
workflow cheap and repeatable.

## Protocol (applies to every phase, non-negotiable)

- **Split-half**: explore on Dec 2025–Feb 2026, confirm on Mar–May 2026.
  A pattern must hold (same sign, meaningful size) in the confirm half or it
  dies. June 2026 stays burned; July 2026+ stays sealed until 2026-08-01.
- **Two evidence bars**:
  - *pre-registered* slice (hypothesis + expected direction written in this
    file before looking): day-clustered t ≥ 2 in the confirm half;
  - *mined* pattern (found by scanning, SHAP, clustering, residuals):
    day-clustered t ≥ 3 in the confirm half AND sign-consistent in ≥ 4 of 6
    months. Scanning ~20 slices yields ~2 fake t≈2 hits by chance.
- **Clustering correction**: t-stats computed on day-level (or story-cluster)
  means, never raw events — duplicates + same-day correlation inflate naive t
  (seen in the drift study).
- **Returns**: hedged (`exc_*`) on own-ticker rows, horizons 1d/3d/5d. Bearish
  side reported but expected dead (v1 Phase 4).
- **LLM version break**: any slice conditioned on an LLM feature (sentiment,
  impact, novelty, category, tags) must be checked per era (≤2026-04-19 vs
  ≥2026-05-04); a pattern that exists only post-switch is 5 weeks of data, park it.
- **Pattern ≠ feature**: survivors get a feature implementation and go through
  the existing 3-seed walk-forward gate (R3 amended rule) before touching the
  model. The 5d-label lesson: a true pattern can still fail deployment.
- **Everything gets recorded here** — negative results included, same culture
  as the training plans.

## P0 — Harness: `ml/pattern_lab.py` (~half day)

One function per concern, no framework:

- input: slice predicate over `events_final.parquet` (+ merged `features_r3`
  columns), optional comparison predicate (slice vs complement by default);
- output per horizon (1d/3d/5d): n events / n days, hedged mean bps,
  day-clustered t, per-month means, discovery-half vs confirm-half verdict;
- one-line registration: name, hypothesis, expected sign, date — appended to a
  results table in this file;
- `--era-split` flag for LLM-conditioned slices.

Done when: re-running the down/flat-tape drift study through the harness
reproduces the known numbers (regression test for the harness itself).

**P0 DONE (2026-06-11, `ml/pattern_lab.py`, commit `1376c0c`).** Gate passed:
weak-tape exc_5d +86 bps (expected ~+69..+108), up-tape −33. Sobering side
finding from the very first protocol run: the motivating drift pattern itself
would NOT clear the registered bar — confirm-half (Mar–May) t = +0.7, and the
era split shows it is g2-concentrated (+119 bps t 3.6 in g2 vs +9 t 0.1 in
g3.5; month means swing −28 to +331). Either the drift faded with the regime,
or Gemini 3.5's inflated BULLISH labeling (~50% of events) diluted the slice.
Downgrades the parked August 5d-hold idea from "promising" to "re-check on
post-break data first."

## P1 — Pre-registered conditional slices (~half day, all through P0 harness)

Registered now, before looking. All on bullish own-ticker events unless noted;
each also reports the bearish mirror for completeness.

| # | slice | hypothesis | expected |
|---|-------|------------|----------|
| 1 | session_phase ∉ RTH (after-hours/pre-market) | overnight news underreacts, drifts next sessions | AH/PM drift > RTH drift |
| 2 | `tick_count_24h` = 0–1 vs ≥ 5 | quiet-name news underpriced; crowded names instant | low-attention drift > high |
| 3 | `velocity_24h` = 0 (cluster leader) vs ≥ 3 (follower) | first telling moves, repetitions don't | leader edge > follower ≈ 0 |
| 4 | sector `rel_*` of event ticker's sector > 0 vs < 0 | with-the-current news travels further | strong-sector drift > weak |
| 5 | `days_until_fomc` ≤ 2 or `days_until_cpi` ≤ 1 | news shelved before macro prints, repriced after | pre-macro 1d muted, 3–5d catch-up |
| 6 | `vol_20d` top vs bottom tercile | jumpy names price instantly, sleepy names drift | low-vol drift > high-vol |

Slice 5 is the cleanest non-LLM one (calendar + price only). Slices using
`novelty_7d`/`velocity_24h` are embedding-derived → not version-confounded.
Gate to proceed: any ≥ 2 confirmed slices justify P2–P3 effort.

**P1 DONE (2026-06-11, `ml/p1_slices.py`; per-slice rows in the results log).
0/6 confirmed at the registered bar, two findings anyway:**

- **⚠️ RETRACTED — P1.6 is a beta artifact, do not feature-ize.** The
  beta-matched re-check flagged as the "needs first" caveat below was run and
  **refuted this finding** (see `PROGRESS_TEXT_ML.md` §9): the low-vol-bullish
  "fade" does not survive beta matching. Kept here for the audit trail only; it is
  NOT an August retrain candidate. Original (falsified) claim follows.
- **P1.6 INVERTED, passes the mined bar**: bullish news on *low-vol* names is
  a fade — confirm-half exc_5d −113 bps, t −4.6, negative 6/7 months, both
  eras (g2 −41, g3.5 −88); the high-vol tercile drifts +169 bps (t 2.8).
  Hypothesis was exactly backwards. Caveat before feature-izing: exc_* hedges
  SPY only, so the high-vol side may be beta in an up-drifting tape — but the
  bearish mirror on low-vol is flat (+2 bps), so the fade is news-conditional,
  not a pure vol effect. → strongest candidate for August (`vol_20d` ×
  sentiment interaction or low-vol-bullish fade filter); needs a beta-matched
  re-check first.
- **P1.2 near-miss**: quiet-name bullish (tick_count≤1) +66 bps 5d, positive
  in **7/7 months** at 3d and 5d, both eras agree (+74/+79) — but confirm-half
  t only +1.3, and the crowded baseline (≥5 events/24h) is itself negative
  (−63). Fails the letter of the bar; the month consistency says re-test in
  August with two more months rather than discard.
- P1.1 wrong direction (RTH news outperforms overnight news — no overnight
  underreaction here); P1.4 weak n, if anything contrarian; both dead.
- P1.3 untestable as registered: velocity≥3 has zero bullish own-ticker rows
  (velocity_24h is almost always 0) — follower definition needs re-registering
  with ≥1, which is a new pre-registration, not a retry.
- P1.5 unresolvable: calendar features were dead (−1) from 2026-03-20, so the
  confirm half is empty. Discovery half *contradicts* the "muted 1d"
  hypothesis (pre-macro 1d +104 vs +9 baseline). Re-register once ~2 months of
  fixed-calendar data exist (~Aug); the live calendar fix shipped 2026-06-11.

Formal gate (≥2 confirmed) not met — but P2 runs regardless per its own line,
and P1.6+P1.2 already give the August retrain backlog two candidates. P3+
proceeds only if P2 adds nothing.

## P2 — Model introspection (~half day)

- **SHAP interactions**: `pred_interactions=True` on the current 5a model over
  Mar–May validation rows; rank feature *pairs* by mean |interaction|; top ~10
  pairs become event-study slices (mined bar applies).
- **Residual mining**: expanding refits (train < month m, score month m) give
  honest OOS scores for Jan–May; take top-decile-score events with
  `exc_1d` < −1%, cluster their bge embeddings, read headlines per cluster.
  Named failure modes become either filters (feature candidates) or prompt
  fixes (backend candidates).

**P2 DONE (2026-06-11, `ml/p2_introspect.py` + `ml/p2_followup.py`).**
Method note: LightGBM has no `pred_interactions` (that is XGBoost API) —
substituted co-path gain pairs (ancestor×descendant feature pairs per
root→leaf path, weighted by split gain, 3-seed sum).

*Part A (interaction pairs):* `vol_20d_f` is the model's interaction hub —
16 of the top 20 pairs involve it (vol × mom_5d/21d, × label_on_ticker,
× dist_high, × macro chgs). Independently corroborates P1.6: vol conditioning
is where the model's structure lives. LLM features are interaction-dead
(impact × anything ≈ 0 gain) — consistent with every prior gain table. No new
slice candidates beyond what P1.6 already covers.

*Part B (failure clusters):* 497 OOS top-decile picks Jan–May, 175 (35%) lost
≥1% next day. Readable failure modes: already-falling names bought
(INTC-crash cluster), "maintains rating + price target" reiterations,
earnings-beat-then-fade (TSLA), product-announcement hype (NVDA CES). Two
were testable and both **refuted at the population level** (results log):

- P2.1 "maintains" notes are NOT a fade — population is mildly *positive*
  (+51 bps 5d). The failure clusters over-represent them because they are
  frequent in the top decile, not because they are negative-EV. **Lesson
  recorded: mining on failures finds what the model buys often, not what
  loses — always test the full population slice before naming a failure mode.**
- P2.2 bullish news on an already-down name (ret_today ≤ −1.5%) is the
  opposite of knife-catching: **+70 bps exc_1d (t 2.4) vs −12 for flat-name
  baseline** — buy-the-dip-on-news works on average; the mined failures were
  its left tail. Not confirmed at the mined bar (confirm t +1.2, g2-heavy),
  but the spread vs baseline (~+82 bps 1d) makes `ret_today` the **strongest
  new feature candidate of the whole lab**: the model is blind to the name's
  same-day move (mom_5d/21d end at the prior close), which also explains the
  already-falling failure cluster. Deployability note: live scoring needs a
  real-time quote for the name (only watchlist tickers have one today).

**Pattern-lab outcome after P0–P2 — August retrain backlog:**
1. `ret_today` feature (P2.2; walk-forward gate will judge it)
2. `vol_20d` × sentiment interaction / low-vol-bullish fade (P1.6, mined-bar
   pass; beta-matched re-check first)
3. quiet-name drift re-test with +2 months data (P1.2, 7/7 month consistency)
4. re-register P1.5 (calendar fixed 2026-06-11) and P1.3 (velocity ≥ 1)

P3 (taxonomy) and P4/P5 stay on the shelf per the order-and-effort gate: P2
produced candidates, and the backlog is now deeper than August can absorb.

## P3 — Embedding story-type taxonomy (~half day–1 day)

- MiniBatchKMeans, k ≈ 40, on normalized `embeddings.npy` **fit on the
  discovery half only**, assign all events.
- Per cluster: n, sample headlines, hedged exc per horizon, month stability.
- Keep rule (mined bar): n ≥ 100, |exc_1d| ≥ 30 bps, day-clustered t ≥ 3 in
  confirm half, sign-consistent ≥ 4/6 months.
- Survivors → categorical `story_cluster` feature → walk-forward gate.
  (Raw embeddings stay banned as features per v1 5b; a 40-way category is a
  different, lower-variance object.)

## P4 — Cross-ticker spillover (~1 day, new label construction)

- Static sector map for the 82 priced tickers (one-time, hardcoded dict).
- For each own-ticker event on A: forward `exc` of same-sector peers B≠A,
  anchored at the event ts (reuse `forward_price` from `build_dataset.py`).
- Tests: does bullish A-news predict peer drift at 1d/3d? Leader→follower by
  market cap tercile? Is peer drift bigger when A itself gapped (move already
  taken on A, sympathy not yet)?
- Notification lag matters less here (second-order move) — this is the one
  place our slow feed isn't structurally handicapped.

## P5 — Intraday market-path conditioner (~half day; `market_data`, 550k rows, never used)

- SPY 15-min closes: market path in the 2h/4h after each event — did the tape
  confirm (same sign as sentiment) or fight the news.
- Hypothesis (pre-registered): confirmation → momentum continues; fight →
  the delayed-drift case from 2026-06-10, payoff at 3–5d.
- Caveats baked in: `market_data` timestamps are naive UTC; closes only
  (open/high/low stale); SPY unaffected by the 2025-12-05 sector-ETF splits.
- Note: usable as *analysis conditioner* freely, but as a *live feature* only
  with values as-of event time + small delay — no peeking at the post-event
  path beyond what live deployment would have (scoring at event time has none
  of it; this phase mostly informs hold/exit policy, not entry scoring).

## Order and effort

| Phase | Work | Gate to continue |
|-------|------|------------------|
| P0 harness | half day | reproduces drift-study numbers |
| P1 slices | half day | ≥ 2 confirmed → P2/P3 worth it |
| P2 introspection | half day | — (always cheap, run regardless) |
| P3 taxonomy | half day–1 day | survivors → feature → walk-forward gate |
| P4 spillover | 1 day | only if P1–P3 didn't fill the August retrain backlog |
| P5 market path | half day | informs hold policy for the August 5d-hold question |

Total ~3–4 days spread out. Hard stop for feature adoption: everything that
survives lands as candidate features for the **version-aware August retrain**
(TRAINING_PLAN_V2 R6) — no mid-cycle model swaps, July one-shot stays locked.

## Results log

(appended by harness runs; format: date | slice | n | exc_1d/3d/5d bps | t_confirm | verdict)

| date | slice | n | exc 1d/3d/5d bps | t_confirm | verdict |
|---|---|---|---|---|---|
| 2026-06-11 | P1.1 bullish outside RTH | 1721 | +11 / +20 / +17 | +0.7 | not confirmed |
| 2026-06-11 | P1.2 quiet name (tick_count<=1) | 1401 | +21 / +57 / +66 | +1.3 | not confirmed |
| 2026-06-11 | P1.3 story leader (velocity=0) | 2534 | +14 / +37 / +32 | +0.5 | not confirmed |
| 2026-06-11 | P1.4 strong-sector bullish (sec_rel>0) | 446 | +12 / -12 / +12 | +0.6 | not confirmed |
| 2026-06-11 | P1.5 pre-macro shadow (FOMC<=2d | CPI<=1d) | 221 | +104 / +105 / +104 | +nan | not confirmed |
| 2026-06-11 | P1.6 sleepy name (vol_20d bottom tercile) | 815 | -1 / -34 / -50 | -4.6 | not confirmed |
| 2026-06-11 | P2.1 'maintains' analyst notes | 1200 | +9 / +35 / +51 | +1.1 | not confirmed |
| 2026-06-11 | P2.2 bullish on already-down name (ret_today<=-1.5%) | 320 | +70 / +116 / +116 | +1.2 | not confirmed |
