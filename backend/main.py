import threading
import os
import sqlite3
import json
import uvicorn
import io
import csv
import datetime
import time
import math
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

# --- IMPORT MODULES ---
import bot_logic
import ingestor
import monitor
from database import init_db, DB_FILE, get_db_connection, json_safe

# --- LIFECYCLE MANAGER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Market Mind Engine...")
    init_db()
    # MM_NO_WORKERS: serve the API read-only (local UI testing) — skip the live
    # pipeline so no Gemini calls, Discord posts, or Pushbullet ingestion fire.
    if os.getenv("MM_NO_WORKERS"):
        print("⚙️  MM_NO_WORKERS set — API only, background workers disabled.")
    else:
        # Start background threads for processing and monitoring
        threading.Thread(target=bot_logic.process_news_queue, daemon=True).start()
        threading.Thread(target=ingestor.start_listening, daemon=True).start()
        threading.Thread(target=ingestor.heartbeat_monitor, daemon=True).start()
        threading.Thread(target=monitor.vwap_monitor_loop, daemon=True).start()
        threading.Thread(target=monitor.macro_monitor_loop, daemon=True).start()
    yield
    print("🛑 Shutting down engine...")

# --- APP CONFIGURATION ---
app = FastAPI(title="Market Mind API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Direction scoring is retired from the PUBLIC feed: research proved news has no
# tradeable direction/timing edge (coin-flip every horizon), so broadcasting a
# direction call would imply an edge that doesn't exist. These keys are stripped
# from the served analysis; sentiment/ml_score are still COMPUTED for internal use
# (private Discord, market_posture shadow) — just not surfaced publicly.
# Categories never surfaced on the PUBLIC feed: SENTIMENT (mood-tags) and RATING
# (analyst up/downgrades) are direction noise, not factual events. Still stored
# and computed; just not shown publicly. The feed is factual-events-only.
PUBLIC_FEED_EXCLUDE_CATEGORIES = ("SENTIMENT", "RATING")

DIRECTION_KEYS = {
    "sentiment", "action", "verdict", "recommendation", "trading_advice",
    "trade_idea", "direction", "bias", "stance", "conviction",
    "price_target", "target", "target_price", "stop_loss", "entry",
}


def _strip_direction(d):
    """Drop direction-bearing keys from a Gemini analysis dict (public surface)."""
    if not isinstance(d, dict):
        return d
    return {k: v for k, v in d.items() if k.lower() not in DIRECTION_KEYS}


# --- HELPER FUNCTIONS ---
def format_news_event(row):
    """Formats a database row into a standardized API response object with JSON safety."""
    # Convert sqlite3.Row to dict to safely check keys
    row_dict = dict(row)
    
    score = row_dict.get("impact_score", 0) or 0
    display_score = score if score <= 10 else round(score / 10)
    
    impact_label = "LOW"
    if display_score >= 9: impact_label = "CRITICAL"
    elif display_score >= 7: impact_label = "HIGH"
    elif display_score >= 5: impact_label = "MEDIUM"

    context = {}
    if row_dict.get("context_json"):
        try: 
            context = json_safe(json.loads(row_dict["context_json"]))
        except: pass
    
    macro = context.get("macro", {})
    micro = context.get("micro", {})
    sector_data = context.get("sectors", {})
    thesis = context.get("thesis", "")
    confidence = context.get("confidence", 0)
    novelty = context.get("novelty", 0)
    source_pkg = context.get("source_pkg", None)

    tags = []
    if row_dict.get("related_ticker"): tags.append(row_dict["related_ticker"])
    if row_dict.get("category"): tags.append(row_dict["category"])

    analysis_details = {}
    if row_dict.get("ai_analysis_json"):
            try: analysis_details = json_safe(json.loads(row_dict["ai_analysis_json"]))
            except: pass

    ml_score = None
    if row_dict.get("ml_score_json"):
            try: ml_score = json_safe(json.loads(row_dict["ml_score_json"]))
            except: pass

    # Important: Headline and Title mapping
    # Frontend usually expects 'headline' for the big text and 'title' or 'body' for the snippet
    return {
        "id": row_dict.get("id"),
        "title": row_dict.get("body", ""), 
        "headline": row_dict.get("title", "No Headline"), 
        "source": row_dict.get("source_app", "Unknown"),
        "source_pkg": source_pkg,
        "icon": None,
        "date": row_dict.get("timestamp"),
        "relevanceScore": display_score,
        "impact": impact_label,
        # sentiment / ml_score retired from the public payload (direction is dead);
        # priority (relevanceScore) + novelty are attention signals, not direction.
        "summary": thesis,
        "thesis": thesis,
        "tags": tags,
        "ml_context": {
            "vix": macro.get("market_vix", 0),
            "rsi": micro.get("rsi", 0),
            "rvol": micro.get("rvol", 0),
            "session": context.get("session"),
            "sectors": sector_data,
            "confidence": confidence,
            "novelty": novelty
        },
        "novelty_score": novelty,
        "full_analysis": _strip_direction(analysis_details)
    }

# --- API ENDPOINTS ---

@app.get("/api/feed")
def get_intelligence_feed(before_id: int = None, before_time: str = None, limit: int = 100, search_term: str = None):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            params = []
            
            # Base Query Construction
            query_parts = ["SELECT * FROM news_events"]
            conditions = []

            # 0. Drop direction-noise categories from the public feed (always)
            _ph = ",".join("?" * len(PUBLIC_FEED_EXCLUDE_CATEGORIES))
            conditions.append(f"(category IS NULL OR category NOT IN ({_ph}))")
            params.extend(PUBLIC_FEED_EXCLUDE_CATEGORIES)

            # 1. Search Filter (Server-Side)
            if search_term and search_term.strip():
                term = f"%{search_term.strip()}%"
                conditions.append("""
                    (title LIKE ? OR body LIKE ? OR related_ticker LIKE ? OR category LIKE ? OR topic LIKE ?)
                """)
                params.extend([term, term, term, term, term])

            # 2. Pagination (Cursor-Based)
            if before_time and before_id:
                conditions.append("((timestamp < ?) OR (timestamp = ? AND id < ?))")
                params.extend([before_time, before_time, before_id])
            elif before_id: # Legacy fallback
                conditions.append("(id < ?)")
                params.append(before_id)
            
            # Combine Conditions
            if conditions:
                query_parts.append("WHERE " + " AND ".join(conditions))
            
            # Ordering and Limiting
            query_parts.append("ORDER BY timestamp DESC, id DESC LIMIT ?")
            params.append(limit)
            
            final_query = " ".join(query_parts)
            
            cursor.execute(final_query, params)
            rows = cursor.fetchall()
            items = [format_news_event(row) for row in rows]
            _attach_narrative_impact(cursor, rows, items)
            return items
    except Exception as e:
        print(f"API Feed Error: {e}")
        return []


def _attach_narrative_impact(cursor, rows, items):
    """Tag each fresh headline with how much it could move its entity's narrative
    (embedding distance from the story centroid). Best-effort: silently skips items
    with no embedding or no built narrative."""
    import narrative
    try:
        centroids = {}
        for r in cursor.execute(
                "SELECT entity_type, entity, centroid, aliases FROM narratives "
                "WHERE centroid IS NOT NULL"):
            centroids[(r["entity_type"], r["entity"])] = r["centroid"]
            # snapped topic spellings resolve to their canonical story's centroid
            if r["aliases"]:
                for a in json.loads(r["aliases"]):
                    centroids[(r["entity_type"], a)] = r["centroid"]
    except Exception:
        return  # narratives table not built yet (or pre-aliases schema)
    if not centroids:
        return
    for row, item in zip(rows, items):
        emb = row["embedding"]
        if not emb:
            continue
        # match the most specific narrative: stock (ticker) first, then the fine
        # `topic` card, then the coarse `category` catch-all (where sub-gate topics live).
        cen = None
        if row["related_ticker"]:
            cen = centroids.get(("stock", row["related_ticker"]))
        topic = row["topic"] if "topic" in row.keys() else None
        if cen is None and topic:
            cen = centroids.get(("topic", topic))
        if cen is None and row["category"]:
            cen = centroids.get(("topic", row["category"]))
        if not cen:
            continue
        try:
            imp = narrative.headline_impact(json.loads(emb), json.loads(cen))
        except (ValueError, TypeError):
            imp = None
        if imp:
            item["narrative_impact"] = imp

@app.get("/api/feed/{item_id}")
def get_intelligence_item(item_id: int):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM news_events WHERE id = ?", (item_id,))
            row = cursor.fetchone()
            if not row: return {"error": "Item not found"}
            return format_news_event(row)
    except Exception as e:
        return {"error": str(e)}

WEEKLY_CACHE = {"data": None, "timestamp": 0}

@app.get("/api/analysis/weekly")
def get_weekly_analysis():
    global WEEKLY_CACHE
    current_time = time.time()
    if WEEKLY_CACHE["data"] and (current_time - WEEKLY_CACHE["timestamp"] < 600):
        return WEEKLY_CACHE["data"]

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            seven_days_ago = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat()
            
            cursor.execute("SELECT sentiment, COUNT(*) as count FROM news_events WHERE timestamp >= ? GROUP BY sentiment", (seven_days_ago,))
            sentiment_counts = {"BULLISH": 0, "BEARISH": 0, "NEUTRAL": 0}
            total_events = 0
            for row in cursor.fetchall():
                s = row["sentiment"] or "NEUTRAL"
                sentiment_counts[s] = row["count"]
                total_events += row["count"]

            cursor.execute("""
                SELECT related_ticker, COUNT(*) as count FROM news_events 
                WHERE timestamp >= ? AND related_ticker IS NOT NULL AND related_ticker != ''
                GROUP BY related_ticker ORDER BY count DESC LIMIT 5
            """, (seven_days_ago,))
            top_tickers = [{"name": r[0], "count": r[1]} for r in cursor.fetchall()]

            cursor.execute("""
                SELECT category, COUNT(*) as count FROM news_events 
                WHERE timestamp >= ? AND category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 5
            """, (seven_days_ago,))
            top_categories = [{"name": r[0], "count": r[1]} for r in cursor.fetchall()]

            cursor.execute("""
                SELECT id, title, body, impact_score, timestamp, source_app FROM news_events 
                WHERE timestamp >= ? AND impact_score >= 8 ORDER BY impact_score DESC, timestamp DESC LIMIT 10
            """, (seven_days_ago,))
            critical_events = [{"id": r[0], "title": r[1], "summary": r[2], "impact": r[3], "date": r[4], "source": r[5]} for r in cursor.fetchall()]

            result = json_safe({
                "total_events": total_events,
                "sentiment_counts": sentiment_counts,
                "top_tickers": top_tickers,
                "top_categories": top_categories,
                "critical_events": critical_events
            })
            
            WEEKLY_CACHE = {"data": result, "timestamp": current_time}
            return result
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/analysis/daily")
def get_daily_analysis():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM daily_reports ORDER BY date DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                return {"date": row["date"], "report": json.loads(row["report_json"]), "created_at": row["created_at"]}
            return {"message": "No reports found."}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/analysis/daily/generate")
def generate_daily_analysis_endpoint():
    try:
        today_str = datetime.date.today().isoformat()
        yesterday = (datetime.datetime.now() - datetime.timedelta(hours=24)).isoformat()
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM daily_reports WHERE date = ?", (today_str,))
            if cursor.fetchone():
                return {"status": "exists", "message": "Report for today already exists."}

            cursor.execute("""
                SELECT * FROM news_events WHERE timestamp >= ? ORDER BY impact_score DESC
            """, (yesterday,))
            rows = cursor.fetchall()
            
            logs = []
            for r in rows:
                r_dict = dict(r)
                ctx = json.loads(r_dict["context_json"]) if r_dict.get("context_json") else {}
                logs.append({
                    "title": r_dict.get("title"), "body": r_dict.get("body"), "sentiment": r_dict.get("sentiment"),
                    "impact_score": r_dict.get("impact_score"), "ticker": r_dict.get("related_ticker"),
                    "vix": ctx.get("macro", {}).get("market_vix")
                })

        from analysis import generate_daily_report
        report, _ = generate_daily_report(logs)
        
        if report:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("INSERT OR REPLACE INTO daily_reports (date, report_json, created_at) VALUES (?, ?, ?)",
                              (today_str, json.dumps(report), datetime.datetime.now().isoformat()))
                conn.commit()
            return {"status": "success", "report": report}
        return {"status": "error", "message": "Report generation failed"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/inspiration")
def get_forge_inspiration(refresh: bool = Query(False)):
    """Opinionated narration of the forge's fundamental ranking — lazy-built +
    cached by snapshot date. Open, like the rest of the app."""
    try:
        import inspiration
        return json_safe(inspiration.get_inspiration(refresh=refresh))
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/signals")
def get_active_signals():
    return json_safe(list(monitor.LATEST_VWAP_DATA.values()))

@app.get("/api/posture")
def get_market_posture():
    """News-volatility posture nowcast (shadow / decision-support — predicts move
    SIZE, not direction; never gates alerts). VIX from the monitor cache."""
    try:
        import market_posture
        vix, _ = monitor.get_market_regime_from_cache()
        return json_safe(market_posture.get_posture(vix=vix or None))
    except Exception as e:
        return {"label": "UNKNOWN", "note": f"posture unavailable: {e}"}

@app.get("/api/regime")
def get_regime_state():
    """Market-regime state (VIX level/state, term structure, trend, deployment
    posture) — the forge's P1 substrate, the one real signal. Sizing/vol, never a
    direction call. Degrades to UNKNOWN if the forge snapshot is missing/stale."""
    try:
        import regime
        return json_safe(regime.get_regime())
    except Exception as e:
        return {"status": "UNKNOWN", "note": f"regime unavailable: {e}"}

@app.get("/api/narratives")
def list_narratives(limit: int = 50):
    """Per-entity 'story so far' cards (P8) — factual digests, no direction.
    Supersede: one current card per stock/topic, rebuilt as news arrives."""
    try:
        import narrative
        return json_safe(narrative.get_narratives(limit))
    except Exception as e:
        print(f"Narratives error: {e}")
        return []

@app.get("/api/narratives/{entity_type}/{entity}")
def get_narrative_detail(entity_type: str, entity: str):
    """Full narrative for one entity (all developments + LLM story arc) — loaded
    when a card is expanded."""
    try:
        import narrative
        card = narrative.get_narrative(entity_type, entity)
        return json_safe(card) if card else {}
    except Exception as e:
        print(f"Narrative detail error: {e}")
        return {}

@app.post("/api/narratives/build")
def build_narratives_endpoint():
    """(Re)build the narrative cards from recent news. Cheap + deterministic
    (no LLM) — safe to call on a schedule or on demand."""
    try:
        import narrative
        return json_safe(narrative.build_narratives())
    except Exception as e:
        return {"built": 0, "error": str(e)}

@app.get("/api/export")
def export_dataset():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM news_events")
            headers = [d[0] for d in cursor.description]
            rows = cursor.fetchall()
            
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            writer.writerows([tuple(row) for row in rows])
            output.seek(0)
            
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=market_mind_{int(time.time())}.csv"}
            )
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Market Mind V2.1 (Safe Mode)"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)