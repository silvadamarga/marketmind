import websocket
import json
import requests
import os
import threading
import time
from dotenv import load_dotenv

# 1. Load Keys
load_dotenv()
API_KEY = os.getenv("PUSHBULLET_API_KEY")

if not API_KEY:
    print("❌ CRITICAL: PUSHBULLET_API_KEY is missing from .env file!")
    exit()

print(f"🔑 API Key Loaded: {API_KEY[:4]}...****")

# 2. Define URLs
STREAM_URL = f"wss://stream.pushbullet.com/websocket/{API_KEY}"
API_URL = "https://api.pushbullet.com/v2/pushes?limit=1"

def fetch_latest_push():
    print("   ⬇️  Fetching details from API...")
    try:
        headers = {"Access-Token": API_KEY}
        r = requests.get(API_URL, headers=headers)
        
        if r.status_code == 200:
            data = r.json()
            pushes = data.get("pushes", [])
            if pushes:
                latest = pushes[0]
                print(f"   ✅ SUCCESS: Found Push! Title: '{latest.get('title')}' Body: '{latest.get('body')}'")
                return latest
            else:
                print("   ⚠️  API returned 200 OK, but 'pushes' list is empty.")
        else:
            print(f"   ❌ API Error: Status {r.status_code} | {r.text}")
    except Exception as e:
        print(f"   ❌ Network Error during fetch: {e}")

def on_message(ws, message):
    print(f"📨 RAW MSG: {message}")
    data = json.loads(message)
    msg_type = data.get("type")

    if msg_type == "nop":
        print("   (Heartbeat - Connection is Alive)")
    
    elif msg_type == "tickle":
        print("   🔔 TICKLE RECEIVED! (New data waiting)")
        fetch_latest_push()
        
    elif msg_type == "push":
        # Sometimes pushes come directly in the stream (ephemeral)
        push = data.get("push", {})
        print(f"   ⚡ DIRECT PUSH: {push.get('title')} - {push.get('body')}")

def on_error(ws, error):
    print(f"❌ WebSocket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print(f"⚠️ Connection Closed: {close_msg}")

def on_open(ws):
    print("✅ CONNECTED to Pushbullet Stream!")
    print("   👉 ACTION: Send a test note/notification to your phone now.")

if __name__ == "__main__":
    websocket.enableTrace(False)
    ws = websocket.WebSocketApp(STREAM_URL,
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.run_forever()