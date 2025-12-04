import threading
import sqlite3
import json 
import uvicorn
import io
import csv
import datetime
import time
from functools import lru_cache
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

# --- IMPORT MODULES ---
import bot_logic
import ingestor
import monitor
from database import init_db, DB_FILE, get_db_connection

# --- LIFECYCLE MANAGER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Market Mind Engine...")
    init_db()
    threading.Thread(target=bot_logic.process_news_queue, daemon=True).start()
    threading.Thread(target=ingestor.start_listening, daemon=True).start()
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

# --- HELPER FUNCTIONS ---
def format_news_event(row):
    """Formats a database row into a standardized API response object."""
    score = row["impact_score"] if row["impact_score"] else 0
    display_score = score if score <= 10 else round(score / 10)
    
    impact_label = "LOW"
    if display_score >= 9: impact_label = "CRITICAL"
    elif display_score >= 7: impact_label = "HIGH"
    elif display_score >= 5: impact_label = "MEDIUM"

    context = {}
    if row["context_json"]:
        try: context = json.loads(row["context_json"])
        except: pass
    
    macro = context.get("macro", {})
    micro = context.get("micro", {})
    sector_data = context.get("sectors", {})
    thesis = context.get("thesis", "")
    confidence = context.get("confidence", 0)
    novelty = context.get("novelty", 0)
    source_pkg = context.get("source_pkg", None)

    tags = []
    if row["related_ticker"]: tags.append(row["related_ticker"])
    if row["category"]: tags.append(row["category"])

    # Try to parse full analysis JSON if available (for single item view)
    analysis_details = {}
    if "ai_analysis_json" in row.keys() and row["ai_analysis_json"]:
            try: analysis_details = json.loads(row["ai_analysis_json"])
            except: pass

    return {
        "id": row["id"],
        "title": row["body"], 
        "headline": row["title"], 
        "source": row["source_app"],
        "source_pkg": source_pkg,
        "icon": None,
        "date": row["timestamp"],
        "relevanceScore": display_score,
        "impact": impact_label,
        "sentiment": row["sentiment"] or "NEUTRAL",
        "summary": thesis,
        "thesis": thesis,
        "tags": tags,
        "ml_context": {
            "vix": macro.get("market_vix"),
            "rsi": micro.get("rsi"),
            "rvol": micro.get("rvol"),
            "session": context.get("session"),
            "sectors": sector_data,
            "confidence": confidence,
            "novelty": novelty
        },
        "novelty_score": novelty,
        "full_analysis": analysis_details
    }

# --- API ENDPOINTS ---



@app.get("/api/feed")
def get_intelligence_feed(before_id: int = None, limit: int = 50):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            query = """
                SELECT id, title, source_app, timestamp, impact_score, sentiment, body, related_ticker, category, ai_analysis_json, context_json
                FROM news_events 
                ORDER BY timestamp DESC LIMIT ?
            """
            
            params = []
            if before_id:
                query = """
                    SELECT id, title, source_app, timestamp, impact_score, sentiment, body, related_ticker, category, ai_analysis_json, context_json
                    FROM news_events 
                    WHERE id < ?
                    ORDER BY timestamp DESC LIMIT ?
                """
                params.append(before_id)
            
            params.append(limit)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            results = [format_news_event(row) for row in rows]
            return results
    except Exception as e:
        print(f"API Error: {e}")
        return []

@app.get("/api/feed/{item_id}")
def get_intelligence_item(item_id: int):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            query = """
                SELECT id, title, source_app, timestamp, impact_score, sentiment, body, related_ticker, category, ai_analysis_json, context_json
                FROM news_events 
                WHERE id = ?
            """
            cursor.execute(query, (item_id,))
            row = cursor.fetchone()
            
            if not row:
                return {"error": "Item not found"}

            return format_news_event(row)
    except Exception as e:
        print(f"API Error: {e}")
        return {"error": str(e)}

# Simple time-based cache for weekly analysis (10 minutes)
WEEKLY_CACHE = {
    "data": None,
    "timestamp": 0
}

@app.get("/api/analysis/weekly")
def get_weekly_analysis():
    global WEEKLY_CACHE
    current_time = time.time()
    
    # Return cached data if valid (less than 10 minutes old)
    if WEEKLY_CACHE["data"] and (current_time - WEEKLY_CACHE["timestamp"] < 600):
        return WEEKLY_CACHE["data"]

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Calculate 7 days ago
            seven_days_ago = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat()
            
            # 1. Total Events & Sentiment
            cursor.execute("""
                SELECT sentiment, COUNT(*) as count 
                FROM news_events 
                WHERE timestamp >= ?
                GROUP BY sentiment
            """, (seven_days_ago,))
            sentiment_rows = cursor.fetchall()
            
            total_events = 0
            sentiment_counts = {"BULLISH": 0, "BEARISH": 0, "NEUTRAL": 0}
            for row in sentiment_rows:
                s = row["sentiment"] or "NEUTRAL"
                c = row["count"]
                sentiment_counts[s] = sentiment_counts.get(s, 0) + c
                total_events += c

            # 2. Top Tickers
            cursor.execute("""
                SELECT related_ticker, COUNT(*) as count 
                FROM news_events 
                WHERE timestamp >= ? AND related_ticker IS NOT NULL AND related_ticker != ''
                GROUP BY related_ticker 
                ORDER BY count DESC 
                LIMIT 5
            """, (seven_days_ago,))
            top_tickers = [{"name": row["related_ticker"], "count": row["count"]} for row in cursor.fetchall()]

            # 3. Top Categories
            cursor.execute("""
                SELECT category, COUNT(*) as count 
                FROM news_events 
                WHERE timestamp >= ? AND category IS NOT NULL
                GROUP BY category 
                ORDER BY count DESC 
                LIMIT 5
            """, (seven_days_ago,))
            top_categories = [{"name": row["category"], "count": row["count"]} for row in cursor.fetchall()]

            # 4. Critical Events (Week in Review)
            cursor.execute("""
                SELECT id, title, body, impact_score, timestamp, source_app
                FROM news_events 
                WHERE timestamp >= ? AND impact_score >= 8
                ORDER BY impact_score DESC, timestamp DESC
                LIMIT 10
            """, (seven_days_ago,))
            critical_events = []
            for row in cursor.fetchall():
                critical_events.append({
                    "id": row["id"],
                    "title": row["title"],
                    "summary": row["body"],
                    "impact": row["impact_score"],
                    "date": row["timestamp"],
                    "source": row["source_app"]
                })

            result = {
                "total_events": total_events,
                "sentiment_counts": sentiment_counts,
                "top_tickers": top_tickers,
                "top_categories": top_categories,
                "critical_events": critical_events
            }
            
            # Update cache
            WEEKLY_CACHE["data"] = result
            WEEKLY_CACHE["timestamp"] = current_time
            
            return result
    except Exception as e:
        print(f"Analysis API Error: {e}")
        return {"error": str(e)}

@app.get("/api/analysis/daily")
def get_daily_analysis():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Get today's report
            today_str = datetime.date.today().isoformat()
            cursor.execute("SELECT * FROM daily_reports WHERE date = ?", (today_str,))
            row = cursor.fetchone()
            
            if row:
                return {
                    "date": row["date"],
                    "report": json.loads(row["report_json"]),
                    "created_at": row["created_at"]
                }
            else:
                # Try to get the latest one if today's doesn't exist
                cursor.execute("SELECT * FROM daily_reports ORDER BY date DESC LIMIT 1")
                row = cursor.fetchone()
                if row:
                     return {
                        "date": row["date"],
                        "report": json.loads(row["report_json"]),
                        "created_at": row["created_at"],
                        "message": "Showing latest available report (not from today)."
                    }
                return {"message": "No reports found."}
    except Exception as e:
        print(f"Daily Analysis Error: {e}")
        return {"error": str(e)}

@app.post("/api/analysis/daily/generate")
def generate_daily_analysis_endpoint():
    try:
        # 1. Check if already exists for today
        today_str = datetime.date.today().isoformat()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM daily_reports WHERE date = ?", (today_str,))
            if cursor.fetchone():
                return {"status": "exists", "message": "Report for today already exists."}

            # 2. Fetch last 24h logs
            yesterday = (datetime.datetime.now() - datetime.timedelta(hours=24)).isoformat()
            cursor.execute("""
                SELECT title, body, source_app, sentiment, impact_score, related_ticker, context_json, ai_analysis_json
                FROM news_events 
                WHERE timestamp >= ?
                ORDER BY impact_score DESC
            """, (yesterday,))
            rows = cursor.fetchall()
            
            logs = []
            for r in rows:
                # Extract some extra context if needed
                context = {}
                if r["context_json"]:
                    try: context = json.loads(r["context_json"])
                    except: pass
                
                micro = context.get("micro", {})
                macro = context.get("macro", {})
                
                # Extract full analysis
                ai_analysis = {}
                if r["ai_analysis_json"]:
                    try: ai_analysis = json.loads(r["ai_analysis_json"])
                    except: pass

                logs.append({
                    "title": r["title"],
                    "body": r["body"],
                    "source_app": r["source_app"],
                    "sentiment": r["sentiment"],
                    "impact_score": r["impact_score"],
                    "novelty_score": context.get("novelty", 0),
                    "ticker_rsi": micro.get("rsi"),
                    "ticker_rvol": micro.get("rvol"),
                    "market_vix": macro.get("market_vix"),
                    "ai_analysis": ai_analysis
                })

        # 3. Generate Analysis
        from analysis import generate_daily_report
        report, raw = generate_daily_report(logs)
        
        if not report:
            return {"status": "error", "message": "Failed to generate report."}

        # 4. Save to DB
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO daily_reports (date, report_json, created_at)
                VALUES (?, ?, ?)
            """, (today_str, json.dumps(report), datetime.datetime.now().isoformat()))
            conn.commit()

        return {"status": "success", "date": today_str, "report": report}

    except Exception as e:
        print(f"Generate Daily Error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/signals")
def get_active_signals():
    return list(monitor.LATEST_VWAP_DATA.values())

@app.get("/api/export")
def export_dataset():
    """Generates a CSV file of the news events."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM news_events")
            # For CSV export, we might need column names which are not directly in Row object keys easily without description
            # But cursor.description works fine.
            headers = [d[0] for d in cursor.description]
            rows = cursor.fetchall()
            
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            # Convert Row objects to tuples/lists for writerows
            writer.writerows([tuple(row) for row in rows])
            output.seek(0)
            
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=market_mind_dataset_{int(time.time())}.csv"}
            )
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Market Mind V2"}



if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
