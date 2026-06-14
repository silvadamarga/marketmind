
import sqlite3
import os

DB_PATH = "/home/sillu/dev/market-mind/marketmind/backend/market_mind.db"

def check_db():
    if not os.path.exists(DB_PATH):
        print(f"Error: DB file not found at {DB_PATH}")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
    except Exception as e:
        print(f"Could not connect to DB: {e}")
        return

    cursor = conn.cursor()
    
    # List all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    # Compare logs and news_events
    try:
        cursor.execute("SELECT count(*) FROM logs")
        logs_count = cursor.fetchone()[0]
        print(f"\nTotal rows in logs (legacy): {logs_count}")
        
        cursor.execute("SELECT count(*) FROM news_events")
        news_count = cursor.fetchone()[0]
        print(f"Total rows in news_events: {news_count}")
        
    except Exception as e:
        print(f"Error getting counts: {e}")
        return

    # Check for empty titles in logs
    cursor.execute("SELECT count(*) FROM logs WHERE title IS NULL OR title = ''")
    logs_empty_title = cursor.fetchone()[0]
    print(f"Logs with empty titles: {logs_empty_title}")

    # Check for items in logs that are NOT in news_events (matching by BODY instead of title)
    print("\nChecking for items in logs that are missing from news_events (matching by BODY)...")
    # Using body for matching might be safer if titles are generated differently
    cursor.execute("""
        SELECT l.id, l.timestamp, l.title, substr(l.body, 1, 50) as body_snippet
        FROM logs l 
        LEFT JOIN news_events n ON l.body = n.body 
        WHERE n.id IS NULL AND l.body IS NOT NULL AND l.body != ''
    """)
    missing_by_body = cursor.fetchall()
    
    # Check for empty body in logs
    cursor.execute("SELECT count(*) FROM logs WHERE body IS NULL OR body = ''")
    logs_empty_body = cursor.fetchone()[0]
    print(f"Logs with empty body: {logs_empty_body}")

    # Check statuses in logs
    cursor.execute("SELECT status, count(*) FROM logs GROUP BY status")
    statuses = cursor.fetchall()
    print(f"Log Statusses: {statuses}")

    # Check for items in logs that are missing from news_events (matching by TIMESTAMP)
    # This is the most robust check if content was modified during migration
    print("\nChecking for items in logs that are missing from news_events (matching by TIMESTAMP)...")
    cursor.execute("""
        SELECT l.id, l.timestamp, l.source_app
        FROM logs l 
        LEFT JOIN news_events n ON l.timestamp = n.timestamp 
        WHERE n.id IS NULL
    """)
    missing_by_ts = cursor.fetchall()
    
    print("\nSampling 5 rows from 'logs' to see their state in 'news_events'...")
    cursor.execute("SELECT id, timestamp, title FROM logs ORDER BY RANDOM() LIMIT 5")
    samples = cursor.fetchall()
    
    for log_row in samples:
        l_id, l_ts, l_title = log_row
        print(f"\nLog ID: {l_id} | TS: {l_ts}")
        print(f"Log Title: {l_title}")
        
        cursor.execute("SELECT id, title, context_json, ai_analysis_json FROM news_events WHERE timestamp = ?", (l_ts,))
        ne_row = cursor.fetchone()
        
        if ne_row:
            ne_id, ne_title, ne_ctx, ne_ai = ne_row
            print(f" -> MATCH in NewsEvents ID: {ne_id}")
            print(f" -> Context JSON length: {len(ne_ctx) if ne_ctx else 0}")
            print(f" -> Analysis JSON length: {len(ne_ai) if ne_ai else 0}")
            if not ne_ctx or len(ne_ctx) < 10:
                 print(" -> WARNING: Context JSON is suspiciously empty!")
        else:
            print(" -> NO MATCH FOUND in NewsEvents (despite previous check saying 0 missing?!)")

    conn.close()

if __name__ == "__main__":
    check_db()
