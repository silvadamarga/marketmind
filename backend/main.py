import threading
import sqlite3
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# --- IMPORT THE BRAIN ---
# This imports the logic from your bot_logic.py file
import bot_logic

# --- LIFECYCLE MANAGER ---
# This handles starting/stopping the background threads automatically
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Market Mind Engine...")
    
    # 1. Initialize Database
    bot_logic.init_db()
    
    # 2. Start the News Queue Worker (Processes incoming Pushbullet msgs)
    t_worker = threading.Thread(target=bot_logic.process_news_queue, daemon=True)
    t_worker.start()
    
    # 3. Start WebSocket Listener (Listens to Pushbullet)
    t_listener = threading.Thread(target=bot_logic.start_listening, daemon=True)
    t_listener.start()
    
    # 4. Start Technical Monitor (Watches VWAP/RSI)
    t_tech = threading.Thread(target=bot_logic.vwap_monitor_loop, daemon=True)
    t_tech.start()
    
    yield # The application runs while this yield is active
    
    print("🛑 Shutting down engine...")

# --- APP CONFIGURATION ---
app = FastAPI(title="Market Mind API", lifespan=lifespan)

# CORS: Allow the React frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In strict production, replace "*" with your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API ENDPOINTS ---

@app.get("/api/feed")
def get_intelligence_feed():
    """
    Fetches the last 50 analyzed news items from the SQLite database.
    Maps the DB columns to the JSON format expected by the React Frontend.
    """
    try:
        # Connect to DB in Read-Only mode to prevent locking
        with sqlite3.connect(f"file:{bot_logic.DB_FILE}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Fetch newest first
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
                # Logic to determine Badge color (Critical/High/Med/Low)
                score = row["impact_score"] if row["impact_score"] else 0
                impact_label = "LOW"
                if score >= 9: impact_label = "CRITICAL"
                elif score >= 7: impact_label = "HIGH"
                elif score >= 5: impact_label = "MEDIUM"

                results.append({
                    "id": row["id"],
                    "title": row["title"],
                    "source": row["source_app"],
                    "date": row["timestamp"],
                    "relevanceScore": score,
                    "impact": impact_label,
                    "sentiment": row["sentiment"] or "NEUTRAL",
                    # Use the AI Thesis if available, otherwise truncate the body
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
    Real-time check of the Technical Monitor.
    Loops through the watchlist and calculates current VWAP/RSI status.
    """
    signals = []
    
    # We use the watchlist defined in bot_logic.py
    for ticker in bot_logic.VWAP_WATCHLIST:
        try:
            # Fetch live technical data
            data = bot_logic.get_technical_confluence(ticker)
            
            if data is not None:
                price = data['Close']
                upper = data['Upper_Band']
                lower = data['Lower_Band']
                
                # Determine Status Label
                status = "NEUTRAL"
                if price > upper: status = "OVERBOUGHT"
                elif price < lower: status = "OVERSOLD"
                
                # Append to result
                signals.append({
                    "ticker": ticker,
                    "price": round(price, 2),
                    "vwap": round(data['VWAP'], 2),
                    "rsi": round(data['RSI'], 1) if data['RSI'] else 0,
                    "rvol": round(data['RVOL'], 1) if data['RVOL'] else 0,
                    "status": status
                })
        except Exception as e:
            print(f"Signal Error ({ticker}): {e}")
            continue
            
    return signals

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Market Mind V2"}

if __name__ == "__main__":
    # This block allows you to run 'python main.py' directly for testing
    uvicorn.run(app, host="0.0.0.0", port=8000)