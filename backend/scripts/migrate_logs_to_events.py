import sqlite3
import json
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from config import DB_FILE
from database import init_db

def migrate_logs_to_events():
    print(f"🚀 Starting migration from 'logs' to 'news_events' in {DB_FILE}...")
    
    # Ensure schema is up to date
    init_db()
    
    try:
        with sqlite3.connect(DB_FILE) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            
            # 2. Fetch all logs
            print("📊 Fetching legacy logs...")
            c.execute("SELECT * FROM logs WHERE status='SUCCESS'")
            logs = c.fetchall()
            print(f"Found {len(logs)} logs to process.")
            
            migrated_count = 0
            skipped_count = 0
            
            for log in logs:
                # Check if already exists in news_events (by timestamp and title)
                c.execute("SELECT id, context_json FROM news_events WHERE timestamp = ? AND title = ?", (log['timestamp'], log['title']))
                existing = c.fetchone()
                
                # Construct Context JSON
                sector_data = {}
                if log['market_sector_json']:
                    try: sector_data = json.loads(log['market_sector_json'])
                    except: pass
                    
                context_data = {
                    "macro": {
                        "market_vix": log['market_vix'],
                        "price_spy": log['price_spy'],
                        "price_qqq": log['price_qqq'],
                        "price_iwm": log['price_iwm'],
                        "yield_10y": log['yield_10y'],
                        "price_dxy": log['price_dxy'],
                        "price_btc": log['price_btc'],
                        "days_until_fomc": log['days_until_fomc'],
                        "days_until_cpi": log['days_until_cpi'],
                        "days_until_nfp": log['days_until_nfp'],
                        "sector_rel_strength": log['sector_rel_strength'],
                        "spy_200d_sma_dist": log['spy_200d_sma_dist'],
                        "market_breadth": log['market_breadth']
                    },
                    "micro": {
                        "rsi": log['ticker_rsi'],
                        "rvol": log['ticker_rvol'],
                        "vwap_dist": log['ticker_vwap_dist']
                    },
                    "session": log['session_phase'],
                    "sectors": sector_data,
                    "novelty": log['novelty_score'],
                    "confidence": log['ai_confidence'],
                    "thesis": log['thesis'],
                    "source_pkg": log['source_package']
                }
                
                context_json_str = json.dumps(context_data)

                if existing:
                    # If exists but context_json is missing, UPDATE it
                    if not existing['context_json']:
                        c.execute("UPDATE news_events SET context_json = ? WHERE id = ?", (context_json_str, existing['id']))
                        migrated_count += 1
                    else:
                        skipped_count += 1
                    continue
                
                # Construct Analysis JSON (Partial reconstruction)
                analysis_data = {
                    "headline": log['title'],
                    "category": log['event_category'],
                    "sentiment_label": log['sentiment'],
                    "impact_score": log['impact_score'],
                    "novelty_score": log['novelty_score'],
                    "tickers": [log['ticker']] if log['ticker'] else [],
                    "key_takeaway": log['thesis'],
                    "confidence": log['ai_confidence']
                }

                # Insert into news_events
                c.execute('''INSERT INTO news_events 
                             (timestamp, source_app, title, body, sentiment, impact_score, related_ticker, category, ai_analysis_json, embedding, context_json)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                          (log['timestamp'], 
                           log['source_app'], 
                           log['title'], 
                           log['body'], 
                           log['sentiment'], 
                           log['impact_score'],
                           log['ticker'],
                           log['event_category'],
                           json.dumps(analysis_data),
                           log['text_embedding'],
                           context_json_str))
                
                migrated_count += 1
                if migrated_count % 100 == 0:
                    print(f"   ...processed {migrated_count} records")
            
            conn.commit()
            print(f"✅ Migration Complete. Processed (Inserted/Updated): {migrated_count}, Skipped (Already Complete): {skipped_count}")

    except Exception as e:
        print(f"❌ Migration Failed: {e}")

if __name__ == "__main__":
    migrate_logs_to_events()
