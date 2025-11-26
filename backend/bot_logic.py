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
DB_FILE = "market_mind.db"

# --- 2. GLOBAL SETTINGS ---
warnings.simplefilter(action='ignore', category=FutureWarning)
# Queue to handle news bursts without crashing threads
NEWS_QUEUE = queue.Queue()

# --- 3. NEWS INTELLIGENCE SETTINGS ---
MIN_IMPACT_SCORE = 7 
TARGET_APPS = [
    "yahoo finance", "cnbc", "bloomberg", "tradingview", "cnn", 
    "bbc news", "google news", "seeking alpha", "barron's",
    "wsj", "reuters", "financial times"
]
TARGET_PACKAGES = [
    "com.yahoo.mobile.client.android.finance", "com.cnbc.client",                         
    "com.bloomberg.android.plus", "com.tradingview.tradingviewapp",          
    "com.cnn.mobile.android.phone", "bbc.mobile.news.uk",                      
    "bbc.mobile.news.ww", "com.google.android.apps.magazines",       
    "com.seekingalpha.webwrapper", "com.barrons.android",
    "com.wsj.android.reader", "com.thomsonreuters.reuters"
]

# --- 4. TECHNICAL MONITOR SETTINGS (VWAP) ---
# NOTE: YFinance data is delayed 15m for Stocks, Realtime for Crypto.
VWAP_WATCHLIST = ["SPY", "COIN", "BTC-USD", "NVDA"]
VWAP_CHECK_INTERVAL = 300  # 5 Minutes
VWAP_BANDS = 2.0           # Standard Deviations
RSI_PERIOD = 14

# ================= SYSTEM INITIALIZATION =================

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    # Using Flash for speed/cost efficiency
    model = genai.GenerativeModel(
        'gemini-2.0-flash',
        generation_config={"response_mime_type": "application/json"}
    )

def init_db():
    """Initializes SQLite with WAL mode for high concurrency."""
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
    """Logs every AI interaction to the database safely."""
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
    """Robustly cleans Markdown wrappers from LLM JSON responses."""
    text = text.strip()
    # Remove markdown code blocks if present
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
    1. FILTER: Ignore politics (unless economic), sports, crime, celebrity.
    2. ANALYZE: What is the immediate market impact?
    3. OUTPUT (JSON ONLY):
    {{
      "headline": "<Short 7-word summary>",
      "ticker": "NVDA" | "BTC" | "MACRO" | "EURUSD",
      "action": "BUY" | "SELL" | "WATCH" | "AVOID",
      "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
      "impact_score": 0-10,
      "timeframe": "SCALP" | "INTRADAY" | "SWING",
      "thesis": "<Max 10 words reason>",
      "counter": "<Max 5 words risk>"
    }}
    """
    
    raw_text = ""
    try:
        # Add retry logic for API stability
        response = model.generate_content(prompt)
        raw_text = response.text
        
        cleaned_text = clean_json_string(raw_text)
        data = json.loads(cleaned_text)
        
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
        "title": f"{action_emoji} {analysis.get('action')} {analysis.get('ticker')} | Score: {analysis.get('impact_score')}/10",
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
    except Exception as e:
        print(f"⚠️ Discord Error: {e}")

def process_news_queue():
    """Worker thread that processes the queue sequentially."""
    print("👷 News Worker Thread Started")
    while True:
        try:
            # Block until an item is available
            task = NEWS_QUEUE.get()
            title, body, source_app = task
            
            print(f"🔍 Analyzing: {title[:40]}...")
            analysis = get_gemini_analysis(title, body, source_app)
            
            if analysis:
                if analysis.get("impact_score", 0) >= MIN_IMPACT_SCORE or analysis.get("sentiment") != "NEUTRAL":
                    send_news_alert(analysis, title, source_app)
                    print(f"🚀 Alert Sent: {analysis.get('ticker')}")
                else:
                    print(f"⚖️  Withheld (Score: {analysis.get('impact_score')})")
            
            # Rate limit protection (Gemini Flash is high limit, but good practice)
            time.sleep(1) 
            NEWS_QUEUE.task_done()
            
        except Exception as e:
            print(f"⚠️ Worker Error: {e}")

# ================= MODULE 2: VWAP TECHNICAL MONITOR (SMART) =================

def calculate_rsi(series, period=14):
    """Calculates Relative Strength Index (RSI)"""
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    
    # Avoid division by zero
    loss = loss.replace(0, np.nan) 
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def get_technical_confluence(ticker):
    try:
        # Fetch 5 days of 5m data
        df = yf.download(ticker, period='5d', interval='5m', progress=False)
        
        if df.empty or len(df) < 50: 
            return None

        # Handle MultiIndex columns (common in new yfinance versions)
        if isinstance(df.columns, pd.MultiIndex):
            # Flatten to just Ticker if needed, or drop level
            try:
                df.columns = df.columns.get_level_values(0)
            except:
                pass

        # --- 1. VWAP Calculation (Rolling Approx) ---
        # Rolling 78 periods ~ 1 trading day (6.5 hours)
        df['Typical_Price'] = (df['High'] + df['Low'] + df['Close']) / 3
        df['TP_V'] = df['Typical_Price'] * df['Volume']
        
        df['VWAP'] = (df['TP_V'].rolling(window=78).sum() / df['Volume'].rolling(window=78).sum())

        rolling_std = df['Close'].rolling(window=78).std()
        df['Upper_Band'] = df['VWAP'] + (rolling_std * VWAP_BANDS)
        df['Lower_Band'] = df['VWAP'] - (rolling_std * VWAP_BANDS)

        # --- 2. RSI Calculation ---
        df['RSI'] = calculate_rsi(df['Close'], RSI_PERIOD)

        # --- 3. Relative Volume (RVOL) ---
        df['Avg_Vol'] = df['Volume'].rolling(window=20).mean()
        df['RVOL'] = df['Volume'] / df['Avg_Vol']
        
        # We return the LAST COMPLETED candle (iloc[-2]) to avoid false signals 
        # from a candle that just started (low volume, incomplete price action)
        # However, for SNIPER entries, sometimes we want current (-1). 
        # Compromise: Use -1 but require minimum volume threshold.
        
        return df.iloc[-1]

    except Exception as e:
        print(f"⚠️ Data Fetch Error ({ticker}): {e}")
        return None

def send_vwap_alert(ticker, alert_type, msg, data):
    # Determine color based on Long/Short
    color = 0x00FF00 if "LONG" in alert_type else 0xFF0000

    embed = {
        "title": f"{alert_type} | {ticker}",
        "description": f"**{msg}**\n\n> Price: `${float(data['Close']):.2f}`\n> RSI: `{float(data['RSI']):.1f}`\n> RVOL: `{float(data['RVOL']):.1f}x`",
        "color": color,
        "fields": [
            {"name": "VWAP", "value": f"${float(data['VWAP']):.2f}", "inline": True},
            {"name": "Bands", "value": f"L: ${float(data['Lower_Band']):.2f} / H: ${float(data['Upper_Band']):.2f}", "inline": True}
        ],
        "footer": {"text": "Market Mind • Technicals"},
        "timestamp": datetime.datetime.now().isoformat()
    }
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed], "username": "Market Mind Tech"})
    except Exception:
        pass

def vwap_monitor_loop():
    print(f"📈 Smart Monitor Started: {len(VWAP_WATCHLIST)} Tickers")
    # State tracking to prevent spamming the same alert every 5 mins
    last_alert_state = {ticker: "NEUTRAL" for ticker in VWAP_WATCHLIST}

    while True:
        for ticker in VWAP_WATCHLIST:
            try:
                row = get_technical_confluence(ticker)
                if row is None: continue

                price = row['Close']
                current_state = "NEUTRAL"
                alert_type = None
                msg = ""
                
                # Validation checks
                if pd.isna(row['RSI']) or pd.isna(row['VWAP']): continue

                # --- STRATEGY LOGIC ---
                is_high_vol = row['RVOL'] > 1.5 
                is_rsi_ob = row['RSI'] > 70
                is_rsi_os = row['RSI'] < 30
                
                # SHORT: Price > Upper Band + Overbought + Volume Spike (Reversion)
                if price > row['Upper_Band'] and is_rsi_ob and is_high_vol:
                    current_state = "SHORT_SIGNAL"
                    if last_alert_state[ticker] != "SHORT_SIGNAL":
                        alert_type = "🚨 SNIPER SHORT (Reversion)"
                        msg = f"Price extended {VWAP_BANDS}σ above VWAP with Volume."

                # LONG: Price < Lower Band + Oversold + Volume Spike (Reversion)
                elif price < row['Lower_Band'] and is_rsi_os and is_high_vol:
                    current_state = "LONG_SIGNAL"
                    if last_alert_state[ticker] != "LONG_SIGNAL":
                        alert_type = "🚨 SNIPER LONG (Reversion)"
                        msg = f"Price extended {VWAP_BANDS}σ below VWAP with Volume."

                if alert_type:
                    send_vwap_alert(ticker, alert_type, msg, row)
                    print(f"🔥 SIGNAL: {ticker} - {alert_type}")
                
                # Hysteresis: Reset state only when price returns inside bands
                if row['Lower_Band'] < price < row['Upper_Band']:
                    last_alert_state[ticker] = "NEUTRAL"
            
            except Exception as e:
                print(f"⚠️ Monitor Error {ticker}: {e}")

        time.sleep(VWAP_CHECK_INTERVAL)

# ================= MODULE 3: WEBSOCKET LISTENER =================

def on_message(ws, message):
    try:
        data = json.loads(message)
        if data.get("type") == "push":
            push = data.get("push", {})
            if push.get("type") == "mirror":
                app_name = push.get("application_name", "Unknown")
                pkg_name = push.get("package_name", "")

                is_target = any(t in app_name.lower() for t in TARGET_APPS) or pkg_name in TARGET_PACKAGES
                
                if is_target:
                    print(f"📨 Queued: {app_name}")
                    # Put into queue instead of spawning thread immediately
                    NEWS_QUEUE.put((push.get("title", ""), push.get("body", ""), app_name))
                    
    except Exception as e:
        print(f"⚠️ WS Msg Error: {e}")

def on_error(ws, error):
    print(f"🔴 WebSocket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("⚠️ Connection Closed")

def start_listening():
    # FIXED: Removed markdown syntax that was causing the crash
    ws_url = f"wss://stream.pushbullet.com/websocket/{PUSHBULLET_API_KEY}"
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
            time.sleep(10) # Backoff before reconnect
        time.sleep(5)