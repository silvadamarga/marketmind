import os
import json
import requests
import websocket
from dotenv import load_dotenv

# Load keys
load_dotenv()
API_KEY = os.getenv("PUSHBULLET_API_KEY")

print("🔍 --- STARTING PUSHBULLET DIAGNOSTIC ---")
print(f"🔑 Key Loaded: {API_KEY[:4]}...{API_KEY[-4:] if API_KEY else 'None'}")

# TEST 1: Check HTTP API (Can we fetch history?)
print("\n[1/3] Testing HTTP API Access...")
try:
    headers = {"Access-Token": API_KEY}
    resp = requests.get("https://api.pushbullet.com/v2/pushes?limit=1", headers=headers)
    
    if resp.status_code == 200:
        data = resp.json()
        pushes = data.get("pushes", [])
        print("✅ API Success: Access Granted")
        if pushes:
            latest = pushes[0]
            print(f"   Last Message: {latest.get('type')} | {latest.get('title', 'No Title')}")
        else:
            print("   ⚠️ API Account is empty (No pushes found). Send a test note now!")
    else:
        print(f"❌ API Failed: {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"❌ Connection Error: {e}")

# TEST 2: Listen for Real-Time Events
print("\n[2/3] Listening for WebSocket Events (Press Ctrl+C to stop)...")
print("👉 GO SEND A TEST NOTE ON PUSHBULLET NOW!")

def on_message(ws, message):
    print(f"\n📨 RAW PACKET: {message}")
    try:
        data = json.loads(message)
        if data.get("type") == "tickle":
            print("✅ Tickle Received! (The listener IS working)")
            # Trigger fetch
            r = requests.get("https://api.pushbullet.com/v2/pushes?limit=1", headers={"Access-Token": API_KEY})
            latest = r.json().get("pushes", [{}])[0]
            print(f"   Fetched Content: {latest.get('title')} | {latest.get('body')}")
            
    except Exception as e:
        print(f"   Parse Error: {e}")

def on_error(ws, error):
    print(f"❌ Socket Error: {error}")

def on_open(ws):
    print("✅ WebSocket Connected! Waiting for data...")

ws_url = f"wss://stream.pushbullet.com/websocket/{API_KEY}"
ws = websocket.WebSocketApp(ws_url, on_open=on_open, on_message=on_message, on_error=on_error)
ws.run_forever()