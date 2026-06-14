
import requests
import json

API_URL = "http://localhost:8000/api/feed"

def verify_search_reachability():
    # The frontend fetches ALL items page by page and filters locally.
    # To find item 27 (date 2025-12-01) from now (2026-01-21), we need to see if pagination bridges the gap.
    
    print("Tracing pagination path backwards from NOW...")
    
    cursor_id = None
    cursor_time = None
    
    steps = 0
    found = False
    
    while steps < 50: # limit to avoid infinite loop
        url = f"{API_URL}?limit=100"
        if cursor_id:
            url += f"&before_id={cursor_id}&before_time={cursor_time}"
            
        resp = requests.get(url)
        if resp.status_code != 200: break
        
        data = resp.json()
        if not data:
            print("End of stream reached.")
            break
            
        first = data[0]
        last = data[-1]
        print(f"Page {steps}: {len(data)} items. Range: {first['date']} (ID {first['id']}) -> {last['date']} (ID {last['id']})")
        
        # Check if ID 27 is in this batch
        ids = [d['id'] for d in data]
        if 27 in ids:
            print("✅ FOUND Item 27 in this batch!")
            found = True
            break
            
        # Prepare next cursor
        cursor_id = last['id']
        cursor_time = last['date']
        steps += 1
        
    if not found:
        print("❌ Did not find item 27 in 50 pages (5000 items).")

if __name__ == "__main__":
    verify_search_reachability()
