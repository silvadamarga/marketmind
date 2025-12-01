import threading
import sqlite3
import json 
import uvicorn
import io
import csv
import datetime
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

# --- IMPORT MODULES ---
import bot_logic
import ingestor
import monitor
from database import init_db, DB_FILE

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

# --- API ENDPOINTS ---

@app.get("/api/feed")
def get_intelligence_feed(before_id: int = None, limit: int = 50):
    try:
        with sqlite3.connect(f"file:{DB_FILE}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            query = """
                SELECT id, title, source_app, source_package, 
                       timestamp, impact_score, sentiment, body, ticker, thesis,
                       market_vix, market_sector_json, 
                       ticker_rsi, ticker_rvol, session_phase,
                       event_category, ai_confidence, novelty_score
                FROM logs 
                WHERE status = 'SUCCESS'
            """
            params = []
            
            if before_id:
                query += " AND id < ?"
                params.append(before_id)
                
            query += " ORDER BY id DESC LIMIT ?"
            params.append(limit)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            results = []
            for row in rows:
                score = row["impact_score"] if row["impact_score"] else 0
                display_score = score if score <= 10 else round(score / 10)
                
                impact_label = "LOW"
                if display_score >= 9: impact_label = "CRITICAL"
                elif display_score >= 7: impact_label = "HIGH"
                elif display_score >= 5: impact_label = "MEDIUM"

                sector_data = {}
                if row["market_sector_json"]:
                    try: sector_data = json.loads(row["market_sector_json"])
                    except: pass

                tags = []
                if row["ticker"]: tags.append(row["ticker"])
                if row["event_category"]: tags.append(row["event_category"])

                results.append({
                    "id": row["id"],
                    "title": row["body"], 
                    "headline": row["title"], 
                    "source": row["source_app"],
                    "source_pkg": row["source_package"],
                    "icon": None,
                    "date": row["timestamp"],
                    "relevanceScore": display_score,
                    "impact": impact_label,
                    "sentiment": row["sentiment"] or "NEUTRAL",
                    "summary": row["thesis"] if row["thesis"] else "",
                    "thesis": row["thesis"],
                    "tags": tags,
                    "ml_context": {
                        "vix": row["market_vix"],
                        "rsi": row["ticker_rsi"],
                        "rvol": row["ticker_rvol"],
                        "session": row["session_phase"],
                        "sectors": sector_data,
                        "confidence": row["ai_confidence"],
                        "novelty": row["novelty_score"]
                    },
                    "novelty_score": row["novelty_score"]
                })
            return results
    except Exception as e:
        print(f"API Error: {e}")
        return []

@app.get("/api/analysis/weekly")
def get_weekly_analysis():
    try:
        with sqlite3.connect(f"file:{DB_FILE}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Calculate 7 days ago
            seven_days_ago = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat()
            
            # 1. Total Events & Sentiment
            cursor.execute("""
                SELECT sentiment, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= ? AND status = 'SUCCESS'
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
                SELECT ticker, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= ? AND status = 'SUCCESS' AND ticker IS NOT NULL AND ticker != ''
                GROUP BY ticker 
                ORDER BY count DESC 
                LIMIT 5
            """, (seven_days_ago,))
            top_tickers = [{"name": row["ticker"], "count": row["count"]} for row in cursor.fetchall()]

            # 3. Top Categories
            cursor.execute("""
                SELECT event_category, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= ? AND status = 'SUCCESS' AND event_category IS NOT NULL
                GROUP BY event_category 
                ORDER BY count DESC 
                LIMIT 5
            """, (seven_days_ago,))
            top_categories = [{"name": row["event_category"], "count": row["count"]} for row in cursor.fetchall()]

            # 4. Critical Events (Week in Review)
            cursor.execute("""
                SELECT id, title, body, impact_score, timestamp, source_app
                FROM logs 
                WHERE timestamp >= ? AND status = 'SUCCESS' AND impact_score >= 8
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

            return {
                "total_events": total_events,
                "sentiment_counts": sentiment_counts,
                "top_tickers": top_tickers,
                "top_categories": top_categories,
                "critical_events": critical_events
            }
    except Exception as e:
        print(f"Analysis API Error: {e}")
        return {"error": str(e)}

@app.get("/api/signals")
def get_active_signals():
    return list(monitor.LATEST_VWAP_DATA.values())

@app.get("/api/export")
def export_dataset():
    """Generates a CSV file of the logs."""
    try:
        with sqlite3.connect(f"file:{DB_FILE}?mode=ro", uri=True) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM logs")
            headers = [d[0] for d in cursor.description]
            rows = cursor.fetchall()
            
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            writer.writerows(rows)
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