import bot_logic
import time

print("--- INJECTION TEST START ---")

# 1. Initialize DB (using the new absolute path)
bot_logic.init_db()

# 2. Inject a payload that is GUARANTEED to trigger an alert
# We use a high-impact headline to ensure impact_score > 60
print("💉 Injecting Fake News into Queue...")
bot_logic.NEWS_QUEUE.put((
    "NVIDIA Announces 10-for-1 Stock Split",   # Title
    "NVIDIA (NVDA) board has approved a 10-for-1 stock split effective immediately.", # Body
    "Bloomberg" # Source (One of your trusted apps)
))

# 3. Run the worker function directly (No threading, so we see errors immediately)
print("⚙️ Running Worker Logic (One Pass)...")

try:
    # We manually pull from the queue to simulate the thread
    if not bot_logic.NEWS_QUEUE.empty():
        task = bot_logic.NEWS_QUEUE.get()
        title, body, source_app = task
        
        print(f"   Processing: {title}")
        
        # Call the analysis function directly
        analysis = bot_logic.get_gemini_analysis(title, body, source_app)
        
        print(f"   Gemini Result: {analysis}")
        
        if analysis:
            print("✅ Analysis returned! Checking DB...")
            
            # 4. Verify it landed in the DB
            import sqlite3
            conn = sqlite3.connect(bot_logic.DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT title, impact_score FROM logs ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            print(f"   DB Verification: {row}")
            conn.close()
        else:
            print("❌ Gemini returned None (Check API Key)")

except Exception as e:
    print(f"❌ CRITICAL ERROR: {e}")

print("--- TEST COMPLETE ---")