
import requests
import json

API_URL = "http://localhost:8000/api/feed"

def check_api():
    print("Fetching feed from API...")
    try:
        # 1. Fetch latest page
        resp = requests.get(f"{API_URL}?limit=10")
        if resp.status_code != 200:
            print(f"Error fetching API: {resp.status_code}")
            return
            
        data = resp.json()
        print(f"Latest 10 items:")
        if data:
            print(f"  First ID: {data[0].get('id')} Date: {data[0].get('date')}")
            print(f"  Last ID:  {data[-1].get('id')} Date: {data[-1].get('date')}")
        else:
            print("  No data returned")

        # 2. Try to fetch a known "legacy" item
        # From check_db output: Log ID 110 -> News Event ID 27 -> Date 2025-12-01
        print("\nFetching specific legacy item ID 27...")
        resp = requests.get(f"{API_URL}/27")
        if resp.status_code == 200:
            item = resp.json()
            print(f"SUCCESS: Found legacy item 27")
            print(f"  Date: {item.get('date')}")
            print(f"  Title: {item.get('title')}")
            print(f"  Headline: {item.get('headline')}")
        else:
             print(f"FAILED to fetch item 27. Status: {resp.status_code}")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    check_api()
