import threading
import sqlite3
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# --- IMPORT THE BRAIN ---
import bot_logic

# --- LIFECYCLE MANAGER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Market Mind Engine...")
    
    # 1. Initialize Database
    bot_logic.init_db()
    
    # 2. Start the News Queue Worker
    t_worker = threading.Thread(target=bot_logic.process_news_queue, daemon=True)
    t_worker.start()
    
    # 3. Start WebSocket Listener
    t_listener = threading.Thread(target=bot_logic.start_listening, daemon=True)
    t_listener.start()
    
    # 4. Start Technical Monitor (Watches VWAP/RSI)
    t_tech = threading.Thread(target=bot_logic.vwap_monitor_loop, daemon=True)
    t_tech.start()
    
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
    """
    Fetches the last 50 analyzed news items.
    """
    try:
        with sqlite3.connect(f"file:{bot_logic.DB_FILE}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT id, title, source_app, timestamp, impact_score, 
                       sentiment, body, ticker, thesis
                FROM logs 
                WHERE status = 'SUCCESS'
                ORDER BY id DESC LIMIT 50
            """)
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                score = row["impact_score"] if row["impact_score"] else 0
                impact_label = "LOW"
                if score >= 90: impact_label = "CRITICAL"
                elif score >= 70: impact_label = "HIGH"
                elif score >= 50: impact_label = "MEDIUM"

                results.append({
                    "id": row["id"],
                    "title": row["body"],
                    "source": row["source_app"],
                    "date": row["timestamp"],
                    "relevanceScore": score,
                    "impact": impact_label,
                    "sentiment": row["sentiment"] or "NEUTRAL",
                    "summary": row["thesis"] if row["thesis"] else (row["body"][:150] + "..." if row["body"] else ""),
                    "tags": [row["ticker"]] if row["ticker"] else ["GENERAL"]
                })
            return results
    except Exception as e:
        print(f"API Error: {e}")
        return []

@app.get("/api/signals")
def get_active_signals():
    """
    Returns the cached technical signals from the background thread.
    This is now instant and does not block.
    """
    # Return the values from the global cache in bot_logic
    return list(bot_logic.LATEST_VWAP_DATA.values())

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Market Mind V2"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)