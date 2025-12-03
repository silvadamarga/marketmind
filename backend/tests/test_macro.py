import sys
import os
import json
import sqlite3
from monitor import get_macro_context
from database import log_transaction, DB_FILE

# Mock data for logging
mock_task = {
    "title": "Test Macro Log",
    "body": "This is a test entry to verify macro data logging.",
    "source": "TestScript",
    "package": "com.test",
    "icon": None
}

def test_macro_pipeline():
    print("🚀 Starting Macro Pipeline Test...")
    
    # 1. Test Data Fetching
    print("\n1️⃣ Fetching Macro Context...")
    try:
        context = get_macro_context()
        print("✅ Macro Context Fetched:")
        print(json.dumps(context, indent=2))
        
        if not context.get('price_spy'):
            print("⚠️ Warning: SPY price missing (Market might be closed or API issue)")
    except Exception as e:
        print(f"❌ Fetch Failed: {e}")
        return

    # 2. Test Database Logging
    print("\n2️⃣ Testing Database Logging...")
    try:
        log_transaction(
            mock_task, 
            "", "Raw Response", {"ticker": "TEST", "action": "WATCH", "impact_score": 5},
            macro_context=context
        )
        print("✅ Transaction Logged.")
    except Exception as e:
        print(f"❌ Logging Failed: {e}")
        return

    # 3. Verify Data in DB
    print("\n3️⃣ Verifying Database Entry...")
    try:
        with sqlite3.connect(DB_FILE) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM logs WHERE source_app='TestScript' ORDER BY id DESC LIMIT 1")
            row = c.fetchone()
            
            if row:
                print("✅ Row Found in DB.")
                print(f"   - SPY Price: {row['price_spy']}")
                print(f"   - 10Y Yield: {row['yield_10y']}")
                print(f"   - Days until FOMC: {row['days_until_fomc']}")
                print(f"   - Sector Strength: {row['sector_rel_strength']}")
                
                if row['price_spy'] == round(context.get('price_spy'), 2):
                    print("✅ Data Match Confirmed!")
                else:
                    print(f"❌ Data Mismatch! DB: {row['price_spy']}, Context: {context.get('price_spy')}")
            else:
                print("❌ Row NOT found in DB.")
    except Exception as e:
        print(f"❌ Verification Failed: {e}")

if __name__ == "__main__":
    test_macro_pipeline()
