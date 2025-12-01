import time
import json
import websocket
import requests
import threading
import logging
from config import PUSHBULLET_API_KEY, PUSHBULLET_STREAM_URL, PUSHBULLET_API_URL, PUSHBULLET_HEARTBEAT_TIMEOUT
import bot_logic
from notifications import send_system_alert

# Heartbeat State
LAST_HEARTBEAT_TIME = time.time()
HEARTBEAT_LOCK = threading.Lock()

# Configure Logging
logging.basicConfig(
    filename='pushbullet_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def fetch_latest_push():
    time.sleep(2)
    try:
        headers = {"Access-Token": PUSHBULLET_API_KEY}
        resp = requests.get(PUSHBULLET_API_URL, headers=headers)
        if resp.status_code == 200:
            pushes = resp.json().get("pushes", [])
            if pushes:
                logging.debug(f"Latest Push Fetched: {json.dumps(pushes[0])}")
                return pushes[0]
    except Exception as e:
        logging.error(f"Error fetching latest push: {e}")
    return None

def on_message(ws, message):
    try:
        print(f"📩 Raw Message: {message}")
        logging.info(f"Raw Message Received: {message}")
        data = json.loads(message)
        
        # Update Heartbeat on ANY message (including 'nop')
        global LAST_HEARTBEAT_TIME
        with HEARTBEAT_LOCK:
            LAST_HEARTBEAT_TIME = time.time()
        
        # 1. SERVER PUSHES (Notes/Links) - No Icon usually
        if data.get("type") == "tickle" and data.get("subtype") == "push":
            logging.info("Tickle received, fetching latest push...")
            latest = fetch_latest_push()
            if latest:
                if latest.get('type') in ["mirror", "note", "link"]:
                    logging.info(f"Processing Tickle Push: {latest.get('title')}")
                    bot_logic.NEWS_QUEUE.put({
                        "title": latest.get('title', ''),
                        "body": latest.get('body', ''),
                        "source": latest.get("application_name", "Pushbullet"),
                        "package": None,
                        "icon": None 
                    })
                else:
                    logging.info(f"Ignored Tickle Push Type: {latest.get('type')}")

        # 2. EPHEMERALS (Mirrored Notifications) - HAS ICON & PACKAGE
        elif data.get("type") == "push":
            push = data.get("push", {})
            logging.debug(f"Ephemeral Push Data: {json.dumps(push)}")
            
            # Filter: Ignore "dismissal" and "clip" (clipboard)
            if push.get('type') == 'mirror':
                app_name = push.get("application_name", "Unknown App")
                package = push.get("package_name", None) # Normalize source
                
                logging.info(f"Processing Mirror: {app_name} - {push.get('title')}")
                bot_logic.NEWS_QUEUE.put({
                    "title": push.get('title', ''),
                    "body": push.get('body', ''),
                    "source": app_name,
                    "package": package,
                    "icon": None
                })
                print(f"📱 Mirror: {app_name} ({package})")
            else:
                logging.info(f"Ignored Ephemeral Push Type: {push.get('type')}")

        else:
            logging.info(f"Ignored Message Type: {data.get('type')}")

    except Exception as e:
        print(f"⚠️ Pushbullet Message Error: {e}")
        logging.error(f"Pushbullet Message Error: {e}")

def on_error(ws, error):
    print(f"⚠️ Pushbullet WebSocket Error: {error}")
    logging.error(f"WebSocket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print(f"🔌 Pushbullet WebSocket Closed: {close_status_code} - {close_msg}")
    logging.info(f"WebSocket Closed: {close_status_code} - {close_msg}")

def start_listening():
    ws_url = f"{PUSHBULLET_STREAM_URL}{PUSHBULLET_API_KEY}"
    while True:
        try:
            ws = websocket.WebSocketApp(ws_url, 
                                      on_message=on_message,
                                      on_error=on_error,
                                      on_close=on_close)
            print("🔗 Connecting to Pushbullet Stream...")
            logging.info("Connecting to Pushbullet Stream...")
            ws.run_forever()
        except Exception as e:
            print(f"⚠️ Pushbullet Stream Error: {e}")
            logging.error(f"Stream Error: {e}")
            time.sleep(5)

def heartbeat_monitor():
    print("💓 Heartbeat Monitor Started")
    alert_sent = False
    while True:
        time.sleep(10)
        with HEARTBEAT_LOCK:
            last_time = LAST_HEARTBEAT_TIME
        
        elapsed = time.time() - last_time
        if elapsed > PUSHBULLET_HEARTBEAT_TIMEOUT:
            if not alert_sent:
                print(f"⚠️ Pushbullet Heartbeat Lost! ({int(elapsed)}s)")
                send_system_alert(
                    "⚠️ Pushbullet Connection Lost", 
                    f"No heartbeat received for {int(elapsed)} seconds. Check internet or Pushbullet API.",
                    color=0xFF0000
                )
                alert_sent = True
        else:
            if alert_sent:
                print("✅ Pushbullet Connection Restored")
                send_system_alert(
                    "✅ Pushbullet Connection Restored", 
                    "Heartbeat signal recovered.",
                    color=0x00FF00
                )
                alert_sent = False

if __name__ == "__main__":
    # Start the News Processing Worker
    t = threading.Thread(target=bot_logic.process_news_queue, daemon=True)
    t.start()
    
    # Start Heartbeat Monitor
    hm = threading.Thread(target=heartbeat_monitor, daemon=True)
    hm.start()

    # Start Listening to Pushbullet
    start_listening()
