import threading
import sqlite3
import json 
import uvicorn
import io   # <--- Added
import csv  # <--- Added
import time # <--- Added for filename timestamp
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse # <--- Added
from contextlib import asynccontextmanager

# --- IMPORT THE BRAIN ---
import bot_logic

# --- LIFECYCLE MANAGER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Market Mind Engine...")
    bot_logic.init_db()
    threading.Thread(target=bot_logic.process_news_queue, daemon=True).start()
    threading.Thread(target=bot_logic.start_listening, daemon=True).start()
    threading.Thread(target=bot_logic.vwap_monitor_loop, daemon=True).start()
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
def get_intelligence_feed():
    try:
        with sqlite3.connect(f"file:{bot_logic.DB_FILE}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, title, source_app, source_package, source_icon, 
                       timestamp, impact_score, sentiment, body, ticker, thesis,
                       market_vix, market_sector_json, 
                       ticker_rsi, ticker_rvol, session_phase,
                       event_category, ai_confidence
                FROM logs 
                WHERE status = 'SUCCESS'
                ORDER BY id DESC LIMIT 50
            """)
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
                    "icon": row["source_icon"],
                    "date": row["timestamp"],
                    "relevanceScore": display_score,
                    "impact": impact_label,
                    "sentiment": row["sentiment"] or "NEUTRAL",
                    "summary": row["thesis"] if row["thesis"] else "",
                    "tags": tags,
                    "ml_context": {
                        "vix": row["market_vix"],
                        "rsi": row["ticker_rsi"],
                        "rvol": row["ticker_rvol"],
                        "session": row["session_phase"],
                        "sectors": sector_data,
                        "confidence": row["ai_confidence"]
                    }
                })
            return results
    except Exception as e:
        print(f"API Error: {e}")
        return []

@app.get("/api/signals")
def get_active_signals():
    return list(bot_logic.LATEST_VWAP_DATA.values())

@app.get("/api/export")
def export_dataset():
    """Generates a CSV file of the logs."""
    try:
        with sqlite3.connect(f"file:{bot_logic.DB_FILE}?mode=ro", uri=True) as conn:
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