# Narratives — the "story so far" layer

How the VPS node turns a stream of individual news events into per-subject
narrative cards. Code lives in the VPS tree (`remote/` locally, gitignored on the
forge; `/var/www/market-mind/backend` on the VPS). Primary file: `narrative.py`.

## Doctrine

A **narrative** is the *story so far* for one subject, rebuilt from the news events
about it. Three rules (`narrative.py` module docstring):

- **Factual** — pure aggregation of facts already extracted per event. No
  sentiment, no forecast, no buy/sell. News has no proven tradeable *direction*
  edge, and narrative is the strongest FOMO/panic fuel, so this layer **informs,
  never urges**.
- **Direction-free** — the card carries materiality, not a bull/bear call.
- **Supersede, not append** — one current card per subject, rewritten as news
  arrives. Never a growing log.

## Subjects ("entities")

Two kinds:

- **stock** — grouped by `related_ticker` (one card per ticker).
- **topic** — built in two passes so no story ever loses a card:
  1. Fine `topic`s (Gemini emits a terse snake_case label per event, e.g.
     `us_iran_relations`) that clear the gate → their own specific card.
  2. **Category catch-all** — every other event (null topic, or a topic still
     below the gate) rolled up by the coarse 9-value `category` enum.

  So a specific story splits off once it earns `MIN_EVENTS`, while the long tail
  keeps a broad category card alive. `category` stays the load-bearing field for
  ML/posture/filters — untouched by this split. (Gemini is told to return an empty
  `topic` for one-off / non-market news so noise falls straight into the catch-all.)

## Pipeline

### 1. Per-event extraction (raw material)

Every incoming headline → one Gemini call (`prompts.py: GEMINI_ANALYSIS_PROMPT`)
emitting `headline`, `category`, `topic`, `impact_score`, `novelty_score`,
`key_takeaway`, `tickers`, `ml_tags`. Stored as a `news_events` row plus a text
**embedding** of the event. Done once, at ingest. Narratives reuse these facts —
they never re-call the LLM for extraction.

### 2. Build pass (`build_narratives`)

Runs periodically / on `POST /api/narratives/build`.

**Gate.** Find subjects with `≥ MIN_EVENTS (4)` events in the last
`WINDOW_DAYS (14)`, excluding noise categories (`SENTIMENT`, `RATING`). Under 4 =
"not yet a story" = no card. Long-tail topics below the gate never form a card by
design (still visible in the raw feed).

**Deterministic card** (`_card`, no LLM) — pure aggregation:

- **developments** — top 5, blending **recency + magnitude**: guarantee the most
  recent material events (impact ≥5), then fill with highest-impact, so an old
  spike can't bury fresh news.
- **latest_update** — the single newest event = "what just changed", shown on the
  card face.
- **themes** — most common `ml_tags` across the events.
- **summary** — "N developments on X over D days, from S sources".
- **centroid** — mean embedding of the story's events = its "center of mass" in
  vector space.

The card is always upserted — it supersedes the prior one.

### 3. Embedding / centroid uses

- **`headline_impact`** — cosine distance of a fresh headline's embedding from the
  story centroid → a pill. Low (`<0.24`) = consistent with the known story;
  moderate; high (`≥0.30`) = diverges, could shift the story. Calibrated on real
  repeats (~0.17–0.24) vs off-thread events (~0.30–0.41).
- In the feed, `main.py: _attach_narrative_impact` matches each headline to its
  entity's centroid (stock ticker first, else topic) for that pill.

### 4. Optional LLM synthesis (the prose)

The "story so far" narration, only for subjects that earn it. Gemini is expensive
and the doctrine is cautious, so it is **gated** behind free pre-checks
(`_synth_trigger`), in priority order:

- **debounce** always wins — never resynth within `48h`.
- **first** ever → synth.
- **drift** — new centroid moved `> θ=0.18` cosine from the stored centroid (story
  materially changed).
- **accumulation** — `≥4` new events since last synth.
- **stale** — still active but synthesis `≥5 days` old.

Then a **budget cap**: at most `5` Gemini calls per build, highest-drift first.
Output schema = `one_liner` (glance hero) + `arc` (2–4 sentences, behind expand) +
`priority` (high/notable/routine = *materiality*, not direction) + confidence /
sources footnote. Stored in `synthesis_json`; kept on the card until refreshed.

## Serving

- `GET /api/narratives` — the list (card faces: subject, take/one_liner,
  latest_update, materiality, provenance).
- `GET /api/narratives/{type}/{entity}` — full card (developments + synthesis),
  lazy-loaded on expand.
- Inline in the feed — `FeedCard` matches a headline to its story by ticker/topic
  and lazy-loads the arc on tap.

## Mental model

Two layers:

1. A **cheap deterministic skeleton** — facts, recency-ranked, always fresh —
   that every qualifying subject gets.
2. An **expensive LLM narration** — prose synthesis — sprinkled only on subjects
   that accumulated or shifted enough to be worth it.

Embeddings are the glue: they measure *did this story actually change?* so the LLM
fires on movement, not noise.

## Key constants (`narrative.py`)

| Constant | Value | Meaning |
|---|---|---|
| `WINDOW_DAYS` | 14 | how far back a story's events are gathered |
| `MIN_EVENTS` | 4 | accumulation gate — fewer = no card |
| `MAX_DEVELOPMENTS` | 5 | top developments per card |
| `SYNTH_DEBOUNCE_HOURS` | 48 | never resynth more often than this |
| `SYNTH_MIN_NEW_EVENTS` | 4 | new events since synth → story moved |
| `SYNTH_STALE_DAYS` | 5 | still active + this old → refresh |
| `DRIFT_THETA` | 0.18 | centroid cosine shift → story changed |
| `HEADLINE_SHIFT` / `HEADLINE_NUDGE` | 0.30 / 0.24 | headline-vs-centroid pill tiers |
| `MAX_SYNTH_PER_BUILD` | 5 | Gemini call cap per build |
