import sqlite3
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "market_mind.db")

def migrate():
    if not os.path.exists(DB_FILE):
        print(f"❌ Database {DB_FILE} not found.")
        return

    print(f"🔧 Migrating {DB_FILE}...")
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # 1. Create New Tables
    print("   Creating tables if not exist...")
    c.execute('''CREATE TABLE IF NOT EXISTS market_data (
                    timestamp TEXT,
                    ticker TEXT,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL,
                    volume INTEGER,
                    vwap REAL,
                    rsi REAL,
                    rvol REAL,
                    PRIMARY KEY (timestamp, ticker)
                )''')

    c.execute('''CREATE TABLE IF NOT EXISTS news_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    source_app TEXT,
                    title TEXT,
                    body TEXT,
                    sentiment TEXT,
                    impact_score INTEGER,
                    related_ticker TEXT,
                    ai_analysis_json TEXT,
                    embedding BLOB
                )''')
    conn.commit()

    # 2. Check if logs table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='logs'")
    if not c.fetchone():
        print("   ⚠️ 'logs' table not found. Nothing to migrate.")
        conn.close()
        return

    # 3. Migrate Data
    print("   Migrating data from 'logs' to 'news_events'...")
    c.execute("SELECT * FROM logs")
    rows = c.fetchall()
    
    count = 0
    for row in rows:
        # Construct AI Analysis JSON
        analysis = {
            "thesis": row['thesis'],
            "sentiment": row['sentiment'],
            "impact_score": row['impact_score'],
            "ticker": row['ticker']
        }
        
        try:
            c.execute('''INSERT INTO news_events 
                         (timestamp, source_app, title, body, sentiment, impact_score, related_ticker, ai_analysis_json, embedding)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (row['timestamp'], 
                       row['source_app'], 
                       row['title'], 
                       row['body'], 
                       row['sentiment'], 
                       row['impact_score'],
                       row['ticker'],
                       json.dumps(analysis),
                       row['text_embedding']))
            count += 1
        except Exception as e:
            print(f"   ⚠️ Error migrating row {row['id']}: {e}")

    conn.commit()
    print(f"✅ Migration Complete! {count} rows migrated.")
    conn.close()

if __name__ == "__main__":
    migrate()
