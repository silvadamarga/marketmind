import websocket
import json
import requests
import google.generativeai as genai
import time
import threading
import queue
import os
import datetime
import sqlite3
import yfinance as yf
import pandas as pd
import numpy as np
import warnings
import re
from dotenv import load_dotenv

# ================= CONFIGURATION =================

# --- 1. ENVIRONMENT & KEYS ---
load_dotenv()
PUSHBULLET_API_KEY = os.getenv("PUSHBULLET_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

# --- NEW: LOAD URLS FROM ENV TO PREVENT CORRUPTION ---
PUSHBULLET_STREAM_URL = os.getenv("PUSHBULLET_STREAM_URL", "wss://stream.pushbullet.com/websocket/")
PUSHBULLET_API_URL = os.getenv("PUSHBULLET_API_URL", "https://api.pushbullet.com/v2/pushes?limit=1")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "market_mind.db")
print(f"📂 Database Path Locked: {DB_FILE}") 

# --- 2. GLOBAL SETTINGS ---
warnings.simplefilter(action='ignore', category=FutureWarning)
NEWS_QUEUE = queue.Queue()

# --- 3. NEWS INTELLIGENCE SETTINGS ---
MIN_IMPACT_SCORE = 60 
TARGET_APPS = [
    "yahoo finance", "cnbc", "bloomberg", "tradingview", "cnn", 
    "bbc news", "google news", "seeking alpha", "barron's",
    "wsj", "reuters", "ft"
]
TARGET_PACKAGES = [
    "com.yahoo.mobile.client.android.finance", "com.cnbc.client",                         
    "com.bloomberg.android.plus", "com.tradingview.tradingviewapp",          
    "com.cnn.mobile.android.phone", "bbc.mobile.news.uk",                      
    "bbc.mobile.news.ww", "com.google.android.apps.magazines",       
    "com.seekingalpha.webwrapper", "com.barrons.android",
    "com.wsj.android.reader", "com.thomsonreuters.reuters",
    "com.ft.news"
]

# --- 4. TECHNICAL MONITOR SETTINGS (VWAP) ---
VWAP_CHECK_INTERVAL = 900  # 15 Minutes
VWAP_BANDS = 2.0           
RSI_PERIOD = 14

# Global Cache
LATEST_VWAP_DATA = {}

# MAPPING TICKERS TO FRIENDLY NAMES
TICKER_MAP = {
    # --- INDICES ---
    "SPY": "S&P 500", "QQQ": "Nasdaq 100", "IWM": "Russell 2000", "DIA": "Dow Jones", "VTI": "Total Market",
    # --- SECTORS ---
    "XLK": "Technology", "XLF": "Financials", "XLV": "Healthcare", "XLE": "Energy", 
    "XLC": "Comms", "XLY": "Discretionary", "XLP": "Staples", "XLI": "Industrials", 
    "XLB": "Materials", "XLRE": "Real Estate", "XLU": "Utilities",
    # --- COMMODITIES & BONDS ---
    "GLD": "Gold", "SLV": "Silver", "USO": "Crude Oil", "TLT": "20y Treasury", "HYG": "Corp Bonds",
    # --- CRYPTO & VOL ---
    "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "VIXY": "Volatility", "COIN": "Coinbase", "NVDA": "Nvidia"
}

VWAP_WATCHLIST = list(TICKER_MAP.keys())

# ================= SYSTEM INITIALIZATION =================

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        'gemini-2.0-flash',
        generation_config={"response_mime_type": "application/json"}
    )

def init_db():
    try:
        with sqlite3.connect(DB_FILE) as conn:
            conn.execute('PRAGMA journal_mode=WAL;') 
            c = conn.cursor()
            c.execute('''CREATE TABLE IF NOT EXISTS logs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp TEXT,
                            source_app TEXT,
                            title TEXT,
                            body TEXT,
                            ticker TEXT,
                            action TEXT,
                            sentiment TEXT,
                            impact_score INTEGER,
                            thesis TEXT,
                            raw_response TEXT,
                            status TEXT,
                            error_msg TEXT
                        )''')
            conn.commit()
        print(f"✅ Database initialized: {DB_FILE} (WAL Mode Active)")
    except Exception as e:
        print(f"❌ Database Error: {e}")

def log_transaction(source_app, title, body, prompt, raw_response, parsed_data, error=None):
    timestamp = datetime.datetime.now().isoformat()
    status = "ERROR" if error else "SUCCESS"
    error_msg = str(error) if error else None
    
    ticker = parsed_data.get("ticker") if parsed_data else None
    action = parsed_data.get("action") if parsed_data else None
    sentiment = parsed_data.get("sentiment") if parsed_data else None
    impact_score = parsed_data.get("impact_score", 0) if parsed_data else 0
    thesis = parsed_data.get("thesis") if parsed_data else None

    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO logs 
                         (timestamp, source_app, title, body, ticker, action, sentiment, impact_score, thesis, raw_response, status, error_msg)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (timestamp, source_app, title, body, ticker, action, sentiment, impact_score, thesis, raw_response, status, error_msg))
            conn.commit()
    except Exception as e:
        print(f"⚠️ Logging Failed: {e}")

# ================= MODULE 1: AI NEWS ANALYST =================

def clean_json_string(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE | re.DOTALL).strip()
    return text

def get_gemini_analysis(title, body, source_app):
    prompt = f"""
    You are a High-Frequency Trading Assistant.
    Goal: Filter noise, identify tradeable catalysts.

    INPUT:
    Source: {source_app}
    Title: "{title}"
    Body: "{body}"

    TASK:
    1. FILTER: Ignore politics (unless impactful), sports, crime, celebrity.
    2. ANALYZE: What is the immediate market impact?
    3. OUTPUT (JSON ONLY):
    {{
      "headline": "<Short 10-word summary>",
      "ticker": "NVDA" | "BTC" | "MACRO" | "EURUSD",
      "action": "BUY" | "SELL" | "WATCH" | "AVOID",
      "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
      "impact_score": 0-100,
      "timeframe": "SCALP" | "INTRADAY" | "SWING",
      "thesis": "<Max 20 words reason>",
      "counter": "<Max 10 words risk>"
    }}
    """
    
    raw_text = ""
    try:
        response = model.generate_content(prompt)
        raw_text = response.text
        
        cleaned_text = clean_json_string(raw_text)
        data = json.loads(cleaned_text)
        
        if isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                data = data[0]
            else:
                data = {}

        log_transaction(source_app, title, body, prompt, raw_text, data)
        return data

    except Exception as e:
        print(f"❌ Gemini Processing Error: {e}")
        log_transaction(source_app, title, body, prompt, raw_text, None, error=e)
        return None

def send_news_alert(analysis, original_title, source_app):
    color_map = {"BULLISH": 0x00FF00, "BEARISH": 0xFF0000, "NEUTRAL": 0x3498DB}
    color = color_map.get(analysis.get("sentiment"), 0x95A5A6)
    action_emoji = {"BUY": "🟢", "SELL": "🔴", "WATCH": "👀", "AVOID": "⛔"}.get(analysis.get('action'), "⚪")

    embed = {
        "title": f"{action_emoji} {analysis.get('action')} {analysis.get('ticker')} | Score: {analysis.get('impact_score')}/100",
        "description": f"**{analysis.get('headline', original_title)}**\n\n> *Thesis: \"{analysis.get('thesis')}\"*\n> *Risk: \"{analysis.get('counter')}\"*",
        "color": color,
        "fields": [
            {"name": "Sentiment", "value": analysis.get("sentiment"), "inline": True},
            {"name": "Source", "value": source_app, "inline": True},
            {"name": "Timeframe", "value": analysis.get("timeframe"), "inline": True}
        ],
        "footer": {"text": "Market Mind • AI News"},
        "timestamp": datetime.datetime.now().isoformat()
    }
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed], "username": "Market Mind AI"})
    except Exception:
        pass

def process_news_queue():
    print("👷 News Worker Thread Started")
    while True:
        try:
            task = NEWS_QUEUE.get()
            title, body, source_app = task
            
            if not title and body:
                title = (body[:50] + '...') if len(body) > 50 else body
            
            print(f"🔍 Analyzing: {title[:40]}...")
            analysis = get_gemini_analysis(title, body, source_app)
            
            if analysis:
                if analysis.get("impact_score", 0) >= MIN_IMPACT_SCORE:
                    send_news_alert(analysis, title, source_app)
                    print(f"🚀 Alert Sent: {analysis.get('ticker')}")
                else:
                    print(f"⚖️  Withheld (Score: {analysis.get('impact_score')})")
            
            time.sleep(1) 
            NEWS_QUEUE.task_done()
            
        except Exception as e:
            print(f"⚠️ Worker Error: {e}")

# ================= MODULE 2: VWAP TECHNICAL MONITOR =================

def calculate_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    loss = loss.replace(0, np.nan) 
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def get_technical_confluence(ticker):
    try:
        df = yf.download(ticker, period='5d', interval='15m', progress=False)
        if df.empty or len(df) < 50: return None
        if isinstance(df.columns, pd.MultiIndex):
            try: df.columns = df.columns.get_level_values(0)
            except: pass

        df['Typical_Price'] = (df['High'] + df['Low'] + df['Close']) / 3
        df['TP_V'] = df['Typical_Price'] * df['Volume']
        df['VWAP'] = (df['TP_V'].rolling(window=26).sum() / df['Volume'].rolling(window=26).sum())
        
        rolling_std = df['Close'].rolling(window=26).std()
        df['Upper_Band'] = df['VWAP'] + (rolling_std * VWAP_BANDS)
        df['Lower_Band'] = df['VWAP'] - (rolling_std * VWAP_BANDS)
        df['RSI'] = calculate_rsi(df['Close'], RSI_PERIOD)
        df['Avg_Vol'] = df['Volume'].rolling(window=20).mean()
        df['RVOL'] = df['Volume'] / df['Avg_Vol']
        
        return df.iloc[-1]
    except Exception:
        return None

def send_vwap_alert(ticker, alert_type, msg, data):
    color = 0x00FF00 if "LONG" in alert_type else 0xFF0000
    embed = {
        "title": f"{alert_type} | {ticker}",
        "description": f"**{msg}**\n\n> Price: `${float(data['Close']):.2f}`",
        "color": color,
        "footer": {"text": "Market Mind • Technicals"}
    }
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed], "username": "Market Mind Tech"})
    except Exception:
        pass

def vwap_monitor_loop():
    print(f"📈 Monitor Started: {len(VWAP_WATCHLIST)} Tickers")
    while True:
        print(f"🔄 Refreshing VWAP Data...")
        for ticker in VWAP_WATCHLIST:
            try:
                row = get_technical_confluence(ticker)
                if row is None: continue
                
                price = row['Close']
                if pd.isna(row['RSI']) or pd.isna(row['VWAP']): continue

                status = "NEUTRAL"
                if price > row['Upper_Band']: status = "OVERBOUGHT"
                elif price < row['Lower_Band']: status = "OVERSOLD"

                LATEST_VWAP_DATA[ticker] = {
                    "ticker": ticker,
                    "name": TICKER_MAP.get(ticker, ticker),
                    "price": round(float(price), 2),
                    "vwap": round(float(row['VWAP']), 2),
                    "rsi": round(float(row['RSI']), 1),
                    "rvol": round(float(row['RVOL']), 1) if not pd.isna(row['RVOL']) else 0,
                    "status": status,
                }
            except Exception as e:
                print(f"⚠️ Monitor Error {ticker}: {e}")
        time.sleep(VWAP_CHECK_INTERVAL)

# ================= MODULE 3: WEBSOCKET LISTENER (ENV CONFIG) =================

def fetch_latest_push():
    """Manually fetches the latest push with delay and debugging."""
    print("   ⏳ Waiting 2 seconds for API indexing...")
    time.sleep(2) # <--- CRITICAL FIX for Race Condition
    
    try:
        headers = {"Access-Token": PUSHBULLET_API_KEY}
        resp = requests.get(PUSHBULLET_API_URL, headers=headers)
        
        # DEBUG PRINT: Verify what the API actually replies
        print(f"   📥 API Response: {resp.status_code}") 
        
        if resp.status_code == 200:
            data = resp.json()
            pushes = data.get("pushes", [])
            
            if pushes:
                latest = pushes[0]
                # Filter out dismissed/inactive pushes if necessary
                if latest.get('active'):
                    print(f"   ✅ Fetched: {latest.get('title', 'No Title')}")
                    return latest
                else:
                    print("   🗑️ Latest push is marked inactive/dismissed.")
            else:
                print("   ⚠️ API returned 200 OK, but list is empty.")
                print(f"   🔎 Raw Data: {data}") # See if 'accounts' or other data exists
        else:
            print(f"   ❌ API Error: {resp.text}")
            
    except Exception as e:
        print(f"   ⚠️ Fetch Error: {e}")
    return None

def handle_push_content(push):
    p_type = push.get('type')
    title = push.get('title', '')
    body = push.get('body', '')
    app_name = push.get("application_name", "Unknown App")
    
    print(f"📦 Processing: {p_type} | {app_name} | {title[:30]}...")

    # --- MODIFIED: REMOVED ALL FILTERS ---
    # We now accept 'mirror' (apps) and 'note' (manual pushes) unconditionally.
    if p_type in ["mirror", "note"]:
        # If the app name is missing, use a fallback so the DB doesn't crash
        safe_source = app_name if app_name else "Pushbullet Raw"
        
        print(f"✅ Queueing: {safe_source}")
        NEWS_QUEUE.put((title, body, safe_source))
        
    else:
        print(f"⚠️ Skipped unsupported type: {p_type}")

def on_message(ws, message):
    try:
        data = json.loads(message)
        msg_type = data.get("type")

        if msg_type == "nop": return

        if msg_type == "tickle" and data.get("subtype") == "push":
            print("🔔 Tickle received! Fetching latest push...")
            latest = fetch_latest_push()
            if latest:
                handle_push_content(latest)
        
        elif msg_type == "push":
            handle_push_content(data.get("push", {}))

    except Exception as e:
        print(f"⚠️ WS Msg Error: {e}")

def on_error(ws, error):
    print(f"🔴 WebSocket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("⚠️ Connection Closed")

def start_listening():
    # Use the variable loaded from .env
    ws_url = f"{PUSHBULLET_STREAM_URL}{PUSHBULLET_API_KEY}"
    
    while True:
        try:
            print(f"🎧 News Listener Connecting...")
            ws = websocket.WebSocketApp(
                ws_url,
                on_open=lambda ws: print("✅ News Listener Connected"),
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            ws.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            print(f"❌ Connection Failed: {e}")
            time.sleep(10)
        time.sleep(5)