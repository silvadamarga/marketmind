"""Narrative cards (P8) — per-entity "story so far", direction-free.

For each entity that has accumulated enough recent news (a stock by ticker, or a
topic by category), build a FACTUAL digest card: the latest developments, the
recurring themes, how many sources over what span. It supersedes — one current
card per entity, rewritten as news arrives — never an append log.

Deliberately deterministic (no LLM): pure aggregation of facts already extracted
per event. That is the doctrine's safe first cut — narrative is the most potent
FOMO/panic fuel, so this layer informs, it never urges: no sentiment, no forecast,
no buy/sell. (An LLM synthesis can later enrich gated entities behind the
accumulation/embedding-drift triggers; the card shape here is the contract.)
"""
import json
import math
from collections import Counter
from datetime import datetime, timedelta, timezone

from database import get_db_connection
from story import MACRO_CATS

WINDOW_DAYS = 14           # how far back a story's events are gathered
MIN_EVENTS = 4             # accumulation gate — fewer = no card (not yet a story)
MAX_DEVELOPMENTS = 5       # top developments surfaced per card
NOISE_CATEGORIES = ("SENTIMENT", "RATING")
TOPIC_CATEGORIES = ("MACRO", "GEOPOLITICS", "REGULATION", "CENTRAL_BANK",
                    "CRYPTO", "REAL_ESTATE", "TECHNOLOGY")

# --- LLM synthesis gates (free pre-gates; Gemini only when one trips) ---
SYNTH_DEBOUNCE_HOURS = 48   # never resynthesize an entity more often than this
SYNTH_MIN_NEW_EVENTS = 4    # accumulation since last synth -> story moved enough
SYNTH_STALE_DAYS = 5        # still-active + this old -> refresh
DRIFT_THETA = 0.18         # cosine distance of event centroid -> story changed
HEADLINE_SHIFT = 0.30      # single headline this far from story centroid -> could shift it
HEADLINE_NUDGE = 0.24      # this far -> develops the story (calibrated: consistent Iran-deal
                           # repeats cluster ~0.17-0.24, off-thread/new events ~0.30-0.41)
MAX_SYNTH_PER_BUILD = 5     # cost cap: at most N Gemini calls per build
# --- bull/bear board (2026-11-21): counted from each headline's ingest-time
# sentiment label, so every tilt traces back to headlines anyone can recount ---
RECENT_DAYS = 3            # "now" side of the swing: last 72h vs the rest of the window
SWING_MIN_EVENTS = 5       # both sides need this many headlines or the swing is None
HEAT_WEEKS = 4             # a story's normal weekly volume = the 4 weeks before this one
MARKET_SHARE = 0.5         # a ticker whose news is mostly MACRO/GEO/CB is a market proxy
                           # (GBP, FTSE, SPY, GLD), not a company story
TOPIC_SNAP_THETA = 0.12    # topic-centroid cosine distance under which a smaller fine topic
                           # is aliased onto a bigger near-duplicate one (calibrated 2026-07-17:
                           # true duplicate pairs sit <=0.115 — us_iran_relations/us_iran_tensions
                           # 0.046, ai_hardware_boom/demand 0.046 — while the closest DISTINCT
                           # stories start at 0.128, fed_rate_path vs us_inflation_trends; note
                           # 0.24 would be far too loose on this basis: event-vs-centroid and
                           # centroid-vs-centroid distances live on different scales)


def _centroid(vectors):
    """Mean vector of a list of equal-length embeddings, or None if empty."""
    if not vectors:
        return None
    n, dim = len(vectors), len(vectors[0])
    return [sum(v[i] for v in vectors) / n for i in range(dim)]


def headline_impact(event_embedding, centroid):
    """How much one fresh headline could move an entity's narrative: cosine distance
    of the headline's embedding from the story centroid. Low = consistent with the
    established story (already known); high = diverges, could shift it. None when
    either vector is missing. Thresholds calibrated in tests/calibration below."""
    d = _cosine_dist(event_embedding, centroid)
    if d is None:
        return None
    tier = "high" if d >= HEADLINE_SHIFT else "moderate" if d >= HEADLINE_NUDGE else "low"
    return {"tier": tier, "distance": round(d, 3)}


def _cosine_dist(a, b):
    """1 - cosine similarity. None if either vector missing/degenerate."""
    if not a or not b or len(a) != len(b):
        return None
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return None
    return 1.0 - dot / (na * nb)

_CREATE = """
CREATE TABLE IF NOT EXISTS narratives (
    entity_type TEXT NOT NULL,        -- 'stock' | 'topic'
    entity      TEXT NOT NULL,        -- ticker or category
    narrative_json TEXT NOT NULL,
    event_count INTEGER,
    last_seen   TEXT,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity)
)
"""


_CREATE_TILT = """
CREATE TABLE IF NOT EXISTS narrative_tilt_history (
    as_of       TEXT NOT NULL,        -- UTC build day; first build of the day wins
    entity_type TEXT NOT NULL,
    entity      TEXT NOT NULL,
    lane        TEXT,                 -- stock | market | theme | mood
    n INTEGER, bull INTEGER, bear INTEGER, flat INTEGER,
    tilt INTEGER,                     -- (bull - bear) / n * 100 over the window
    recent_n INTEGER, recent_tilt INTEGER,
    swing INTEGER,                    -- recent tilt minus the earlier window's tilt
    model_direction TEXT, model_confidence INTEGER, model_as_of TEXT,
    built_at TEXT NOT NULL,
    PRIMARY KEY (as_of, entity_type, entity)
)
"""


def _ensure(cur):
    cur.execute(_CREATE)
    cur.execute(_CREATE_TILT)
    # additive migration for the LLM-synthesis layer (idempotent)
    for col, decl in (("centroid", "TEXT"), ("synthesis_json", "TEXT"),
                      ("last_synth", "TEXT"), ("aliases", "TEXT")):
        try:
            cur.execute(f"ALTER TABLE narratives ADD COLUMN {col} {decl}")
        except Exception:
            pass  # column already exists


def _snap_topics(counts, centroids):
    """Alias near-duplicate fine topics onto their biggest sibling (1C embedding-snap).
    Gemini fragments one story across spelling variants (us_iran_relations vs
    us_iran_tensions); string reuse alone can't heal it. Biggest-first: each topic
    either becomes a root or snaps to the nearest already-rooted topic whose centroid
    is within TOPIC_SNAP_THETA. Recomputed every build from window events only, so a
    wrong snap is never sticky. Returns {alias_topic: canonical_topic}."""
    aliases = {}
    roots = []
    for t in sorted(centroids, key=lambda t: (-counts.get(t, 0), t)):
        if centroids[t] is None:
            continue
        best, best_d = None, TOPIC_SNAP_THETA
        for r in roots:
            d = _cosine_dist(centroids[t], centroids[r])
            if d is not None and d < best_d:
                best, best_d = r, d
        if best:
            aliases[t] = best
        else:
            roots.append(t)
    return aliases


def _rows_for(cur, column, value, since, exclude_topics=None):
    """Recent, factual (noise-excluded) events for one entity, newest first.
    `value` may be a list (a snapped topic's canonical name + its aliases).
    `exclude_topics` drops events already claimed by a qualifying fine topic — used
    so a category catch-all card doesn't double-count events that have their own card."""
    values = list(value) if isinstance(value, (list, tuple)) else [value]
    sql = (f"SELECT title, body, ai_analysis_json, category, impact_score, sentiment, "
           f"timestamp, source_app, embedding FROM news_events "
           f"WHERE {column} IN ({','.join('?' * len(values))}) AND timestamp >= ? "
           f"AND (category IS NULL OR category NOT IN ('SENTIMENT','RATING')) ")
    params = [*values, since]
    if exclude_topics:
        sql += f"AND (topic IS NULL OR topic NOT IN ({','.join('?' * len(exclude_topics))})) "
        params.extend(exclude_topics)
    sql += "ORDER BY timestamp DESC"
    cur.execute(sql, params)
    return cur.fetchall()


_SENT = {"BULLISH": "bull", "BEARISH": "bear"}


def _utc(iso):
    t = datetime.fromisoformat(iso)
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _tilt(events):
    """(bull - bear) / all headlines, -100..+100; neutral headlines dilute it.
    None when there are no headlines."""
    if not events:
        return None
    bull = sum(e["sentiment"] == "bull" for e in events)
    bear = sum(e["sentiment"] == "bear" for e in events)
    return round(100 * (bull - bear) / len(events))


def _mood(parsed, now):
    """The story's bull/bear tally: whole window, last RECENT_DAYS vs the rest (the
    swing), and one bar per UTC day. Counted, not judged: each headline's
    sentiment label was set once at ingest."""
    cut = now - timedelta(days=RECENT_DAYS)
    recent, prior = [], []
    for e in parsed:
        try:
            (recent if _utc(e["date"]) >= cut else prior).append(e)
        except (ValueError, TypeError):
            prior.append(e)
    rt, pt = _tilt(recent), _tilt(prior)
    swing = (rt - pt if len(recent) >= SWING_MIN_EVENTS and len(prior) >= SWING_MIN_EVENTS
             else None)
    count = Counter(e["sentiment"] for e in parsed)
    daily = []
    for i in range(WINDOW_DAYS - 1, -1, -1):
        d = (now - timedelta(days=i)).date().isoformat()
        c = Counter(e["sentiment"] for e in parsed if (e["date"] or "")[:10] == d)
        daily.append({"d": d, "bull": c["bull"], "bear": c["bear"], "flat": c["flat"]})
    return {"n": len(parsed), "bull": count["bull"], "bear": count["bear"],
            "flat": count["flat"], "tilt": _tilt(parsed),
            "recent": {"n": len(recent), "tilt": rt}, "prior": {"n": len(prior), "tilt": pt},
            "swing": swing, "daily": daily}


def _heat(cur, column, value, now):
    """This week's headline count against the story's own normal week (the
    HEAT_WEEKS before it). x is None when the story had no news before this week."""
    values = list(value) if isinstance(value, (list, tuple)) else [value]
    wk = (now - timedelta(days=7)).isoformat()
    since = (now - timedelta(days=7 * (HEAT_WEEKS + 1))).isoformat()
    r = cur.execute(
        f"SELECT COALESCE(SUM(timestamp >= ?), 0) wk, COALESCE(SUM(timestamp < ?), 0) prior "
        f"FROM news_events WHERE {column} IN ({','.join('?' * len(values))}) AND timestamp >= ? "
        f"AND (category IS NULL OR category NOT IN ('SENTIMENT','RATING'))",
        (wk, wk, *values, since)).fetchone()
    norm = r["prior"] / HEAT_WEEKS
    return {"week": r["wk"], "norm": round(norm, 1),
            "x": round(r["wk"] / norm, 1) if norm else None}


def _card(entity_type, entity, rows, lane=None, now=None):
    """Build one digest card from an entity's recent events: the factual skeleton
    plus its counted bull/bear tally. `lane` is theme/mood for topics; a stock's
    lane is decided here from what its news is about."""
    now = now or datetime.now(timezone.utc)
    parsed = []
    for r in rows:
        ai = {}
        if r["ai_analysis_json"]:
            try:
                ai = json.loads(r["ai_analysis_json"])
            except (ValueError, TypeError):
                ai = {}
        parsed.append({
            "date": r["timestamp"],
            # real headline lives in `body`; `title` holds the publisher name
            "headline": r["body"] or r["title"],
            "source": r["source_app"],
            "impact": r["impact_score"] or 0,
            "novelty": ai.get("novelty_score") or 0,    # lives in ai_analysis_json
            "tags": ai.get("ml_tags") or [],
            "category": r["category"],
            "sentiment": _SENT.get(r["sentiment"] or ai.get("sentiment_label"), "flat"),
        })

    # Developments blend RECENCY and MAGNITUDE so the story tracks the current
    # thread, not just last week's biggest spike: guarantee the most recent
    # material events, then fill with the highest-impact ones. (Pure impact-ranking
    # over a 14d window lets an old high-impact cluster bury recent developments.)
    by_impact = sorted(parsed, key=lambda e: (e["impact"], e["novelty"]), reverse=True)
    recent = [e for e in parsed if e["impact"] >= 5]   # parsed is newest-first; drop noise
    picks, seen = [], set()
    for e in [*recent[:3], *by_impact]:
        key = (e["date"], e["headline"])
        if key in seen:
            continue
        seen.add(key)
        picks.append(e)
        if len(picks) >= MAX_DEVELOPMENTS:
            break
    top = sorted(picks, key=lambda e: e["date"], reverse=True)
    developments = [{"date": e["date"], "headline": e["headline"],
                     "source": e["source"], "sentiment": e["sentiment"]} for e in top]
    # the single newest event — the "what just changed" shown on the card face
    newest = parsed[0] if parsed else None
    latest_update = ({"date": newest["date"], "headline": newest["headline"],
                      "source": newest["source"], "impact": newest["impact"],
                      "sentiment": newest["sentiment"]}
                     if newest else None)

    themes = [t for t, _ in Counter(t for e in parsed for t in e["tags"]).most_common(6)]
    sources = sorted({e["source"] for e in parsed if e["source"]})
    dates = [e["date"] for e in parsed if e["date"]]
    last_seen, first_seen = (max(dates), min(dates)) if dates else (None, None)
    span_days = None
    if first_seen and last_seen:
        try:
            span_days = (datetime.fromisoformat(last_seen) - datetime.fromisoformat(first_seen)).days
        except (ValueError, TypeError):
            span_days = None

    if lane is None:
        macro = sum(e["category"] in MACRO_CATS for e in parsed)
        lane = "market" if parsed and macro / len(parsed) > MARKET_SHARE else "stock"

    label = entity if entity_type == "stock" else entity.replace("_", " ").title()
    summary = (f"{len(parsed)} development{'s' if len(parsed) != 1 else ''} on {label} "
               f"over {span_days if span_days is not None else '—'} days, "
               f"from {len(sources)} source{'s' if len(sources) != 1 else ''}.")

    return {
        "entity_type": entity_type, "entity": entity, "label": label,
        "summary": summary, "latest_update": latest_update,
        "developments": developments, "themes": themes,
        "event_count": len(parsed), "source_count": len(sources),
        "first_seen": first_seen, "last_seen": last_seen,
        "lane": lane, "mood": _mood(parsed, now),
        "as_of": now.date().isoformat(),
        "note": "story digest + headline bull/bear tally — mood, not a measured price edge",
    }


def _event_vectors(rows):
    """Parsed embeddings present on an entity's events (the rest are skipped)."""
    vecs = []
    for r in rows:
        if r["embedding"]:
            try:
                vecs.append(json.loads(r["embedding"]))
            except (ValueError, TypeError):
                pass
    return vecs


def _fmt_dev(d):
    return f"- ({d['date'][:10]}, {d.get('source','?')}) {d['headline']}"


def _events_text(card):
    """Synthesis prompt input (facts only). The newest-by-time development is
    surfaced as its own LATEST block — the rating keys off it, so the model must
    see it even when it isn't among the highest-impact developments."""
    lines = []
    lu = card.get("latest_update")
    if lu:
        lines.append("LATEST DEVELOPMENT (most recent — the `priority` must be about THIS one):")
        lines.append(_fmt_dev(lu))
        lines.append("")
    lines.append("BACKGROUND (notable developments in the story, for context):")
    for d in card["developments"]:
        lines.append(_fmt_dev(d))
    return "\n".join(lines)


def _synth_trigger(stored, card, new_centroid, now):
    """Free pre-gate: should this entity be (re)synthesized? Returns (bool, reason,
    drift). Debounce always wins. Triggers: first-ever, accumulation, drift, stale."""
    last_synth = stored["last_synth"] if stored and "last_synth" in stored.keys() else None
    has_synth = bool(stored and stored["synthesis_json"]) if stored else False

    # debounce — never resynthesize too often (cost guard)
    if last_synth:
        try:
            if (now - datetime.fromisoformat(last_synth)).total_seconds() < SYNTH_DEBOUNCE_HOURS * 3600:
                return (False, "debounced", None)
        except (ValueError, TypeError):
            pass

    if not has_synth:
        return (True, "first", None)

    # embedding drift (only when vectors exist on both sides — degrade otherwise)
    drift = None
    if new_centroid and stored and stored["centroid"]:
        try:
            drift = _cosine_dist(new_centroid, json.loads(stored["centroid"]))
        except (ValueError, TypeError):
            drift = None
    if drift is not None and drift > DRIFT_THETA:
        return (True, f"drift {drift:.2f}", drift)

    # accumulation since last synth
    prev_n = stored["event_count"] if stored and stored["event_count"] else 0
    if card["event_count"] - prev_n >= SYNTH_MIN_NEW_EVENTS:
        return (True, "accumulation", drift)

    # staleness ceiling (still active but synthesis is old)
    if last_synth:
        try:
            if (now - datetime.fromisoformat(last_synth)).days >= SYNTH_STALE_DAYS:
                return (True, "stale", drift)
        except (ValueError, TypeError):
            pass
    return (False, "no-trigger", drift)


def build_narratives(synthesize=True):
    """(Re)build narrative cards for every entity past the accumulation gate.
    Deterministic cards always upsert (supersede); LLM synthesis runs only on
    gated entities, budget-capped. Returns a summary."""
    import analysis
    since = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).isoformat()
    now = datetime.now(timezone.utc)
    built, candidates = [], []
    with get_db_connection() as conn:
        cur = conn.cursor()
        _ensure(cur)

        cur.execute(
            "SELECT related_ticker e, COUNT(*) n FROM news_events "
            "WHERE timestamp >= ? AND related_ticker IS NOT NULL AND related_ticker != '' "
            "AND (category IS NULL OR category NOT IN ('SENTIMENT','RATING')) "
            "GROUP BY related_ticker HAVING n >= ?", (since, MIN_EVENTS))
        stocks = [r["e"] for r in cur.fetchall()]
        # Topic narratives, two passes so no story ever loses a card:
        #  1. fine `topic`s that cleared the gate -> their own specific card, after
        #     embedding-snap merges near-duplicate spellings into one story (the
        #     gate applies to the MERGED count, so a story fragmented into sub-gate
        #     variants can still earn its card)
        #  2. category catch-all -> every OTHER event (null topic, or a topic still
        #     below the gate) rolled up by coarse category. This keeps a broad card
        #     alive for the long tail while specific stories split off as they earn it.
        cat_ph = ",".join("?" * len(TOPIC_CATEGORIES))
        cur.execute(
            "SELECT topic e, COUNT(*) n FROM news_events "
            "WHERE timestamp >= ? AND topic IS NOT NULL AND category IN (%s) "
            "GROUP BY topic" % cat_ph,
            (since, *TOPIC_CATEGORIES))
        topic_counts = {r["e"]: r["n"] for r in cur.fetchall()}
        cur.execute(
            "SELECT topic, embedding FROM news_events "
            "WHERE timestamp >= ? AND topic IS NOT NULL AND embedding IS NOT NULL "
            "AND category IN (%s)" % cat_ph,
            (since, *TOPIC_CATEGORIES))
        topic_vecs = {}
        for r in cur.fetchall():
            try:
                topic_vecs.setdefault(r["topic"], []).append(json.loads(r["embedding"]))
            except (ValueError, TypeError):
                pass
        snapped = _snap_topics(topic_counts, {t: _centroid(v) for t, v in topic_vecs.items()})
        topic_aliases = {}
        for alias, canon in snapped.items():
            topic_aliases.setdefault(canon, []).append(alias)
        fine_topics = [
            t for t, n in topic_counts.items() if t not in snapped
            and n + sum(topic_counts[a] for a in topic_aliases.get(t, ())) >= MIN_EVENTS]
        # events claimed by a fine card = the canonical topic AND its aliases
        claimed = [t for c in fine_topics for t in (c, *topic_aliases.get(c, ()))]

        catch_sql = ("SELECT category e, COUNT(*) n FROM news_events "
                     "WHERE timestamp >= ? AND category IN (%s) " % cat_ph)
        catch_params = [since, *TOPIC_CATEGORIES]
        if claimed:
            catch_sql += "AND (topic IS NULL OR topic NOT IN (%s)) " % ",".join("?" * len(claimed))
            catch_params.extend(claimed)
        catch_sql += "GROUP BY category HAVING n >= ?"
        catch_params.append(MIN_EVENTS)
        cur.execute(catch_sql, catch_params)
        catch_cats = [r["e"] for r in cur.fetchall()]

        for etype, col, ents, excl, lane in (
                ("stock", "related_ticker", stocks, None, None),
                ("topic", "topic", fine_topics, None, "theme"),
                ("topic", "category", catch_cats, claimed or None, "mood")):
            for ent in ents:
                names = [ent, *topic_aliases.get(ent, ())] if col == "topic" else ent
                rows = _rows_for(cur, col, names, since, exclude_topics=excl)
                if len(rows) < MIN_EVENTS:
                    continue
                card = _card(etype, ent, rows, lane=lane, now=now)
                # a catch-all's own norm would count events its fine topics now own
                card["heat"] = _heat(cur, col, names, now) if lane != "mood" else None
                aliases = topic_aliases.get(ent, []) if col == "topic" else []
                if aliases:
                    card["aliases"] = aliases
                centroid = _centroid(_event_vectors(rows))
                stored = cur.execute(
                    "SELECT * FROM narratives WHERE entity_type=? AND entity=?",
                    (etype, ent)).fetchone()
                # keep any prior synthesis on the card until it's refreshed
                if stored and stored["synthesis_json"]:
                    try:
                        card["synthesis"] = json.loads(stored["synthesis_json"])
                    except (ValueError, TypeError):
                        pass
                cur.execute(
                    "INSERT INTO narratives(entity_type,entity,narrative_json,event_count,last_seen,updated_at,centroid,aliases)"
                    " VALUES (?,?,?,?,?,?,?,?)"
                    " ON CONFLICT(entity_type,entity) DO UPDATE SET narrative_json=excluded.narrative_json,"
                    " event_count=excluded.event_count, last_seen=excluded.last_seen,"
                    " updated_at=excluded.updated_at, centroid=excluded.centroid,"
                    " aliases=excluded.aliases",
                    (etype, ent, json.dumps(card), card["event_count"], card["last_seen"],
                     now.isoformat(), json.dumps(centroid) if centroid else None,
                     json.dumps(aliases) if aliases else None))
                built.append(card)

                if synthesize:
                    trig, reason, drift = _synth_trigger(stored, card, centroid, now)
                    if trig:
                        # priority: drift magnitude, then activity
                        candidates.append(((drift or 0.0, card["event_count"]),
                                           etype, ent, card, reason))

        # a topic that just became an alias may carry its own card from an earlier
        # build — drop it so the merged canonical card is the story's ONE card
        if snapped:
            cur.execute(
                "DELETE FROM narratives WHERE entity_type='topic' AND entity IN (%s)"
                % ",".join("?" * len(snapped)), list(snapped))
        conn.commit()

        # synthesis pass — budget-capped, highest-priority first.
        # COMMIT PER ENTITY, not once at the end: each Gemini call takes seconds,
        # so holding the write lock across the loop starved usage.log_usage — it
        # opens its own connection, hit SQLite's 5s default timeout and dropped
        # the row (it swallows by design). Measured 2026-07-31: 1 of 5 synthesis
        # calls reached gemini_usage, so the cost ledger was undercounting this
        # call type ~5x. Committing between calls also makes each synthesis
        # durable on its own — a failure mid-loop no longer discards the ones
        # already paid for.
        synthesized = []
        candidates.sort(key=lambda c: c[0], reverse=True)
        for _, etype, ent, card, reason in candidates[:MAX_SYNTH_PER_BUILD]:
            syn = analysis.generate_narrative_synthesis(card["label"], _events_text(card))
            if not syn:
                continue
            syn["reason"] = reason
            syn["as_of"] = now.date().isoformat()
            card["synthesis"] = syn
            cur.execute(
                "UPDATE narratives SET narrative_json=?, synthesis_json=?, last_synth=? "
                "WHERE entity_type=? AND entity=?",
                (json.dumps(card), json.dumps(syn), now.isoformat(), etype, ent))
            conn.commit()
            synthesized.append((etype, ent, reason))

        # the tilt ledger: one immutable row per story per UTC day (first build
        # wins), so whether a tilt or a model call meant anything can be scored
        # later from what was on the board that day, never from a rebuilt card
        for card in built:
            m, syn = card["mood"], card.get("synthesis") or {}
            cur.execute(
                "INSERT OR IGNORE INTO narrative_tilt_history VALUES "
                "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (now.date().isoformat(), card["entity_type"], card["entity"], card["lane"],
                 m["n"], m["bull"], m["bear"], m["flat"], m["tilt"],
                 m["recent"]["n"], m["recent"]["tilt"], m["swing"],
                 syn.get("direction"), syn.get("confidence"), syn.get("as_of"),
                 now.isoformat()))
        conn.commit()

    return {"built": len(built), "synthesized": len(synthesized),
            "synth_entities": synthesized, "gated_candidates": len(candidates)}


def _light(card):
    """Compact card face in the UNIFIED CARD CONTRACT — one visual grammar shared by
    every card kind (narrative now; news/topic/forge-signal later). The glance fields
    (take/direction/materiality/confidence/provenance) ship with the list; the
    kind-specific body (arc, developments) stays server-side until expanded.

    Contract: {kind, subject{type,label,ticker}, take, direction, materiality,
    confidence, provenance, as_of, has_body}. Legacy keys kept for back-compat."""
    syn = card.get("synthesis") or {}
    sources = card.get("source_count")
    return {
        # --- discriminator + identity ---
        "kind": "narrative",
        "entity_type": card["entity_type"], "entity": card["entity"],
        "subject": {"type": card["entity_type"], "label": card["label"],
                    "ticker": card["entity"] if card["entity_type"] == "stock" else None},
        # --- glance grammar (shared by all kinds) ---
        "take": syn.get("one_liner"),               # the hero gut-read
        "direction": syn.get("direction"),          # bull|bear|neutral -> color/arrow
        "materiality": syn.get("priority"),         # high|notable|routine -> dots
        "confidence": syn.get("confidence"),        # conviction/grounding
        "provenance": {"sources": sources, "label": f"{sources} source{'s' if sources != 1 else ''}"
                       if sources else None},
        "as_of": card.get("last_seen"),
        "has_body": bool(card.get("synthesis")),
        # --- legacy keys (back-compat with current FeedCard inline) ---
        "label": card["label"], "summary": card["summary"],
        "latest_update": card.get("latest_update"),
        "event_count": card.get("event_count"), "source_count": sources,
        "last_seen": card.get("last_seen"),
        "has_synthesis": bool(card.get("synthesis")),
        "priority": syn.get("priority"),
        "one_liner": syn.get("one_liner"),
        # --- bull/bear board (absent on cards built before 2026-11-21) ---
        "lane": card.get("lane") or _old_lane(card),
        "mood": card.get("mood"), "heat": card.get("heat"),
        "model_as_of": syn.get("as_of"),
    }


def _old_lane(card):
    if card["entity_type"] == "stock":
        return "stock"
    return "mood" if card["entity"] in TOPIC_CATEGORIES else "theme"


def get_narratives(limit=50):
    """Serve compact cards, most-recently-active first (a new event bumps an
    entity's last_seen, so its card returns to the top). Light payload."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        _ensure(cur)
        cur.execute(
            "SELECT narrative_json FROM narratives ORDER BY last_seen DESC, event_count DESC LIMIT ?",
            (limit,))
        return [_light(json.loads(r["narrative_json"])) for r in cur.fetchall()]


def get_narrative(entity_type, entity):
    """Full card for one entity (developments + LLM synthesis) — fetched on
    expand, not shipped with the list."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        _ensure(cur)
        row = cur.execute(
            "SELECT narrative_json FROM narratives WHERE entity_type=? AND entity=?",
            (entity_type, entity)).fetchone()
        return json.loads(row["narrative_json"]) if row else None


def _book():
    """{ticker: 'held'|'watch'} from the Live desk's snapshot (live.json, pushed by
    the forge). Empty when the file is absent — then the board shows no marks."""
    try:
        import live
        snap = live._load_file() or {}
    except Exception:
        return {}, None
    marks = {}
    for r in snap.get("rows", []):
        sets = r.get("sets") or ""
        marks[r["ticker"]] = "held" if "held" in sets.split() else "watch"
    return marks, snap.get("book_at")


def get_board(now=None):
    """The Narratives tab: every story the latest build carried, the catch-all
    categories as mood gauges, and the whole news tape's own tilt —
    last RECENT_DAYS against the full window — as the header."""
    now = now or datetime.now(timezone.utc)
    since = (now - timedelta(days=WINDOW_DAYS)).isoformat()
    cut = (now - timedelta(days=RECENT_DAYS)).isoformat()
    marks, book_at = _book()
    with get_db_connection() as conn:
        cur = conn.cursor()
        _ensure(cur)
        # one build stamps every card it wrote with the same updated_at; a card
        # from an older build is a story that fell under the gate since, and its
        # tally would be frozen at that build's counts
        rows = cur.execute(
            "SELECT narrative_json, updated_at FROM narratives "
            "WHERE updated_at = (SELECT max(updated_at) FROM narratives) "
            "ORDER BY last_seen DESC").fetchall()
        tape = cur.execute(
            "SELECT sentiment, substr(timestamp, 1, 10) d, timestamp >= ? recent, COUNT(*) n "
            "FROM news_events WHERE timestamp >= ? "
            "AND (category IS NULL OR category NOT IN ('SENTIMENT','RATING')) "
            "GROUP BY 1, 2, 3", (cut, since)).fetchall()

    events = [{"sentiment": _SENT.get(r["sentiment"], "flat"), "d": r["d"], "recent": r["recent"]}
              for r in tape for _ in range(r["n"])]
    recent = [e for e in events if e["recent"]]
    prior = [e for e in events if not e["recent"]]
    daily = []
    for i in range(WINDOW_DAYS - 1, -1, -1):
        d = (now - timedelta(days=i)).date().isoformat()
        c = Counter(e["sentiment"] for e in events if e["d"] == d)
        daily.append({"d": d, "bull": c["bull"], "bear": c["bear"], "flat": c["flat"]})
    rt, pt = _tilt(recent), _tilt(prior)
    count = Counter(e["sentiment"] for e in events)

    cards, gauges = [], []
    for r in rows:
        c = _light(json.loads(r["narrative_json"]))
        c["mine"] = marks.get(c["entity"]) if c["entity_type"] == "stock" else None
        (gauges if c["lane"] == "mood" else cards).append(c)
    return {
        "as_of": now.isoformat(),
        "built_at": max((r["updated_at"] for r in rows), default=None),
        "book_at": book_at,
        "tape": {"n": len(events), "bull": count["bull"], "bear": count["bear"],
                 "flat": count["flat"], "tilt": _tilt(events),
                 "recent": {"n": len(recent), "tilt": rt}, "prior": {"n": len(prior), "tilt": pt},
                 "swing": rt - pt if rt is not None and pt is not None else None,
                 "daily": daily},
        "gauges": gauges, "cards": cards,
        "window_days": WINDOW_DAYS, "recent_days": RECENT_DAYS,
    }
