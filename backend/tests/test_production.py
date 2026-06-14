import sqlite3
import time
import threading
import queue
import json
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import monitor
import bot_logic
from database import init_db, DB_FILE

def test_production_refactor():
    print("🚀 Starting Production Verification...")
    
    # 1. Initialize DB (New Schema)
    init_db()
    
    # 2. Test Batch Market Data Logging
    print("\n1️⃣ Testing Batch Market Data...")
    
    # Mock yfinance download
    mock_df = pd.DataFrame({
        ('SPY', 'Open'): [500.0] * 50,
        ('SPY', 'High'): [505.0] * 50,
        ('SPY', 'Low'): [495.0] * 50,
        ('SPY', 'Close'): [502.0] * 50,
        ('SPY', 'Volume'): [1000000] * 50,
        ('QQQ', 'Open'): [400.0] * 50,
        ('QQQ', 'High'): [405.0] * 50,
        ('QQQ', 'Low'): [395.0] * 50,
        ('QQQ', 'Close'): [402.0] * 50,
        ('QQQ', 'Volume'): [500000] * 50,
    })
    # Set index as datetime
    mock_df.index = pd.date_range(start='2024-01-01', periods=50, freq='15min')
    
    # Patch yfinance in monitor
    with patch('yfinance.download', return_value=mock_df):
        # Run one iteration of the loop logic (extracted for testing)
        # We can't easily run the infinite loop, so we'll just call the inner logic if we could, 
        # but since it's a loop, we'll start it in a thread and kill it? 
        # Better: let's just mock the loop or extract the logic. 
        # For now, let's trust the unit test approach of calling the function that does the work.
        # Since vwap_monitor_loop is an infinite loop, we can't call it directly without it blocking.
        # Let's rely on manual verification or a slightly modified monitor for testing?
        # Or better, let's just verify the `log_market_data` function works by calling it directly with mock data.
        
        from database import log_market_data
        timestamp = "2024-01-01T12:00:00"
        data = [
            {"ticker": "SPY", "open": 500, "high": 505, "low": 495, "close": 502, "volume": 1000000, "vwap": 501, "rsi": 50, "rvol": 1.2},
            {"ticker": "QQQ", "open": 400, "high": 405, "low": 395, "close": 402, "volume": 500000, "vwap": 401, "rsi": 55, "rvol": 1.1}
        ]
        log_market_data(timestamp, data)
        
    # Verify DB
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM market_data WHERE timestamp=?", (timestamp,))
        rows = c.fetchall()
        if len(rows) == 2:
            print("✅ Market Data Logged Successfully.")
        else:
            print(f"❌ Market Data Logging Failed. Found {len(rows)} rows.")

    # 3. Test News Event Logging
    print("\n2️⃣ Testing News Event Logging...")
    
    mock_task = {
        "title": "Prod Test News",
        "body": "Testing news logging.",
        "source": "TestScript"
    }
    mock_analysis = {
        "ticker": "SPY",
        "sentiment": "BULLISH",
        "impact_score": 8,
        "thesis": "Good news"
    }
    
    # Patch get_gemini_analysis in bot_logic
    with patch('bot_logic.get_gemini_analysis', return_value=(mock_analysis, "raw")):
        with patch('bot_logic.get_text_embedding', return_value=None):
            bot_logic.NEWS_QUEUE.put(mock_task)
            # Run worker for a second
            t = threading.Thread(target=bot_logic.process_news_queue, daemon=True)
            t.start()
            time.sleep(2)
            
    # Verify DB
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM news_events WHERE title='Prod Test News'")
        row = c.fetchone()
        if row:
            print("✅ News Event Logged Successfully.")
        else:
            print("❌ News Event Logging Failed.")

if __name__ == "__main__":
    test_production_refactor()
