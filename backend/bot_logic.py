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
import math
from dotenv import load_dotenv

# ================= CONFIGURATION =================

load_dotenv()
PUSHBULLET_API_KEY = os.getenv("PUSHBULLET_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

PUSHBULLET_STREAM_URL = os.getenv("PUSHBULLET_STREAM_URL", "wss://stream.pushbullet.com/websocket/")
PUSHBULLET_API_URL = os.getenv("PUSHBULLET_API_URL", "https://api.pushbullet.com/v2/pushes?limit=1")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "market_mind.db")

warnings.simplefilter(action='ignore', category=FutureWarning)
NEWS_QUEUE = queue.Queue()
DATA_LOCK = threading.Lock() 
MIN_IMPACT_SCORE = 6

# --- ASSET UNIVERSE ---
TICKER_MAP = {
    "SPY": "S&P 500", "QQQ": "Nasdaq 100", "IWM": "Russell 2000", "DIA": "Dow Jones", "VTI": "Total Market",
    "^TNX": "10Y Treasury Yield",  "DX-Y.NYB": "US Dollar Index", "^VIX": "Volatility Index",
    "XLK": "Technology", "XLF": "Financials", "XLV": "Healthcare", "XLE": "Energy", 
    "XLC": "Comms", "XLY": "Discretionary", "XLP": "Staples", "XLI": "Industrials", 
    "XLB": "Materials", "XLRE": "Real Estate", "XLU": "Utilities",
    "SMH": "Semiconductors", "XBI": "Biotech", "XRT": "Retail", "ITB": "Homebuilders", "JNK": "Junk Bonds",
    "GLD": "Gold", "SLV": "Silver", "USO": "Crude Oil", "TLT": "20y Treasury", 
    "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum"
}

VWAP_WATCHLIST = list(TICKER_MAP.keys())
VWAP_CHECK_INTERVAL = 900
VWAP_BANDS = 2.0           
RSI_PERIOD = 14
LATEST_VWAP_DATA = {}

# ================= HELPER: NAN SAFETY =================

def safe_round(val, digits=2):
    try:
        if val is None: return 0.0
        f = float(val)
        if math.isnan(f) or math.isinf(f): return 0.0
        return round(f, digits)
    except Exception:
        return 0.0

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
            # ADDED: source_package, source_icon
            c.execute('''CREATE TABLE IF NOT EXISTS logs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp TEXT,
                            source_app TEXT,
                            source_package TEXT,
                            source_icon TEXT,
                            title TEXT,
                            body TEXT,
                            ticker TEXT,
                            action TEXT,
                            sentiment TEXT,
                            impact_score INTEGER,
                            thesis TEXT,
                            raw_response TEXT,
                            status TEXT,
                            error_msg TEXT,
                            market_vix REAL,
                            market_sector_json TEXT,
                            text_embedding BLOB,
                            ticker_rsi REAL,
                            ticker_rvol REAL,
                            ticker_vwap_dist REAL,
                            session_phase TEXT,
                            event_category TEXT,
                            novelty_score INTEGER,
                            ai_confidence INTEGER
                        )''')
            conn.commit()
        print(f"✅ Database initialized: {DB_FILE}")
    except Exception as e:
        print(f"❌ Database Error: {e}")

def log_transaction(data_pack, prompt, raw_response, parsed_data, 
                   market_vix=None, market_sector_json=None, embedding=None, 
                   ticker_rsi=None, ticker_rvol=None, ticker_vwap_dist=None, 
                   session_phase=None, error=None):
    
    timestamp = datetime.datetime.now().isoformat()
    status = "ERROR" if error else "SUCCESS"
    error_msg = str(error) if error else None
    p = parsed_data if parsed_data else {}
    
    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO logs 
                         (timestamp, source_app, source_package, source_icon, title, body, ticker, action, sentiment, 
                          impact_score, thesis, raw_response, status, error_msg,
                          market_vix, market_sector_json, text_embedding,
                          ticker_rsi, ticker_rvol, ticker_vwap_dist, session_phase,
                          event_category, novelty_score, ai_confidence)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (timestamp, 
                       data_pack.get("source"), 
                       data_pack.get("package"), 
                       data_pack.get("icon"), 
                       data_pack.get("title"), 
                       data_pack.get("body"), 
                       p.get("ticker"), p.get("action"), p.get("sentiment"), 
                       p.get("impact_score", 0), p.get("thesis"), raw_response, status, error_msg,
                       safe_round(market_vix), market_sector_json, embedding,
                       safe_round(ticker_rsi), safe_round(ticker_rvol), safe_round(ticker_vwap_dist), session_phase,
                       p.get("event_category"), p.get("novelty_score"), p.get("ai_confidence")))
            conn.commit()
    except Exception as e:
        print(f"⚠️ Logging Failed: {e}")

# ================= MODULE 1: AI NEWS ANALYST =================

def clean_json_string(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE | re.DOTALL).strip()
    return text

def get_text_embedding(text):
    try:
        if not text: return None
        result = genai.embed_content(model="models/text-embedding-004", content=text)
        return json.dumps(result['embedding']) 
    except Exception: return None

def get_gemini_analysis(title, body, source_app):
    prompt = f"""
    You are a Financial Data Labeling Engine.
    INPUT: Source: {source_app}, Title: "{title}", Body: "{body}"
    
    OUTPUT JSON format (Strict):
    {{
      "headline": "<Neutral summary>",
      "ticker": "NVDA" | "BTC" | "MACRO" | "EURUSD",
      "action": "BUY" | "SELL" | "WATCH" | "AVOID",
      "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
      "impact_score": 1-10,
      "novelty_score": 1-10,
      "ai_confidence": 1-10,
      "event_category": "EARNINGS" | "MACRO_DATA" | "CENTRAL_BANK" | "GEOPOLITICS" | "M_AND_A" | "REGULATION" | "TECHNICALS" | "SENTIMENT" | "OTHER",
      "timeframe": "SCALP" | "INTRADAY" | "SWING",
      "thesis": "<Reasoning>",
      "counter": "<Risks>"
    }}
    """
    try:
        response = model.generate_content(prompt)
        raw_text = response.text
        cleaned_text = clean_json_string(raw_text)
        data = json.loads(cleaned_text)
        if isinstance(data, list): data = data[0] if data else {}
        return data, raw_text
    except Exception as e:
        print(f"❌ Gemini Error: {e}")
        return None, str(e)

def send_news_alert(analysis, original_title, source_app):
    color_map = {"BULLISH": 0x00FF00, "BEARISH": 0xFF0000, "NEUTRAL": 0x3498DB}
    color = color_map.get(analysis.get("sentiment"), 0x95A5A6)
    
    embed = {
        "title": f"{analysis.get('action')} {analysis.get('ticker')} | {analysis.get('impact_score')}/10",
        "description": f"**{analysis.get('headline', original_title)}**\n> *{analysis.get('thesis')}*",
        "color": color,
        "fields": [
            {"name": "Category", "value": analysis.get("event_category", "N/A"), "inline": True},
            {"name": "Confidence", "value": f"{analysis.get('ai_confidence')}/10", "inline": True}
        ],
        "footer": {"text": "Market Mind AI"}
    }
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed], "username": "Market Mind"})
    except: pass

# ================= MODULE 2: DATA COLLECTORS =================

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

        current_date = df.index[-1].date()
        day_data = df[df.index.date == current_date]
        daily_change = 0.0
        if not day_data.empty:
            open_price = float(day_data['Open'].iloc[0])
            close_price = float(day_data['Close'].iloc[-1])
            if open_price != 0 and not math.isnan(open_price):
                daily_change = ((close_price - open_price) / open_price) * 100

        result = df.iloc[-1].to_dict()
        result['daily_change'] = daily_change
        return result
    except Exception: return None

def vwap_monitor_loop():
    print(f"📈 Monitor Started: Tracking {len(VWAP_WATCHLIST)} Assets")
    while True:
        for ticker in VWAP_WATCHLIST:
            try:
                data = get_technical_confluence(ticker)
                if data is None: continue
                price = data['Close']
                status = "NEUTRAL"
                if price > data['Upper_Band']: status = "OVERBOUGHT"
                elif price < data['Lower_Band']: status = "OVERSOLD"

                with DATA_LOCK:
                    LATEST_VWAP_DATA[ticker] = {
                        "ticker": ticker,
                        "name": TICKER_MAP.get(ticker, ticker),
                        "price": safe_round(price),
                        "vwap": safe_round(data['VWAP']),
                        "rsi": safe_round(data['RSI'], 1),
                        "rvol": safe_round(data['RVOL'], 1),
                        "daily_change": safe_round(data['daily_change'], 2),
                        "status": status,
                    }
            except Exception: continue
        time.sleep(VWAP_CHECK_INTERVAL)

def get_market_regime_from_cache():
    heatmap = {}
    vix_val = 0.0
    with DATA_LOCK:
        for ticker, data in LATEST_VWAP_DATA.items():
            heatmap[ticker] = data.get('daily_change', 0.0)
            if ticker == "^VIX": vix_val = data.get('price', 0.0)
    return vix_val, json.dumps(heatmap)

def get_session_phase():
    now = datetime.datetime.now(datetime.timezone.utc)
    est_hour = (now.hour - 5) % 24 
    if 4 <= est_hour < 9: return "PRE_MARKET"
    if 9 <= est_hour < 10: return "MARKET_OPEN"
    if 10 <= est_hour < 12: return "MORNING_KR"
    if 12 <= est_hour < 14: return "LUNCH_LULL"
    if 14 <= est_hour < 16: return "POWER_HOUR"
    if 16 <= est_hour < 20: return "AFTER_HOURS"
    return "OVN_FUTURES"

def process_news_queue():
    print("👷 News Worker Thread Started")
    while True:
        try:
            # Task is now a DICTIONARY
            task = NEWS_QUEUE.get()
            
            # --- EXTRACT RICH METADATA ---
            title = task.get("title", "")
            body = task.get("body", "")
            source_app = task.get("source", "Unknown")
            
            if not title and body: title = body[:50]

            vix, sector_json = get_market_regime_from_cache()
            session = get_session_phase()
            full_text = f"{title} {body}"
            embedding = get_text_embedding(full_text)
            
            print(f"🔍 Analyzing: {title[:40]}...")
            analysis, raw_resp = get_gemini_analysis(title, body, source_app)
            
            micro_regime = {}
            if analysis and analysis.get("ticker"):
                target_ticker = analysis.get("ticker")
                with DATA_LOCK:
                    if target_ticker in LATEST_VWAP_DATA:
                        td = LATEST_VWAP_DATA[target_ticker]
                        vwap_dist = 0
                        p, v = td.get('price', 0), td.get('vwap', 0)
                        if v != 0: vwap_dist = (p - v) / v
                        micro_regime = {
                            "rsi": td.get('rsi'),
                            "rvol": td.get('rvol'),
                            "vwap_dist": safe_round(vwap_dist * 100, 2)
                        }

            if analysis:
                log_transaction(
                    task, # Pass the whole dict to logging
                    "", raw_resp, analysis,
                    market_vix=vix, market_sector_json=sector_json, embedding=embedding,
                    ticker_rsi=micro_regime.get("rsi"), ticker_rvol=micro_regime.get("rvol"),
                    ticker_vwap_dist=micro_regime.get("vwap_dist"), session_phase=session
                )
                if analysis.get("impact_score", 0) >= MIN_IMPACT_SCORE:
                    send_news_alert(analysis, title, source_app)
            time.sleep(0.5)
            NEWS_QUEUE.task_done()
        except Exception as e:
            print(f"⚠️ Worker Error: {e}")

# ================= MODULE 3: LISTENER =================

def fetch_latest_push():
    time.sleep(2)
    try:
        headers = {"Access-Token": PUSHBULLET_API_KEY}
        resp = requests.get(PUSHBULLET_API_URL, headers=headers)
        if resp.status_code == 200:
            pushes = resp.json().get("pushes", [])
            if pushes: return pushes[0]
    except Exception: pass
    return None

def on_message(ws, message):
    try:
        data = json.loads(message)
        
        # 1. SERVER PUSHES (Notes/Links) - No Icon usually
        if data.get("type") == "tickle" and data.get("subtype") == "push":
            latest = fetch_latest_push()
            if latest:
                if latest.get('type') in ["mirror", "note"]:
                    NEWS_QUEUE.put({
                        "title": latest.get('title', ''),
                        "body": latest.get('body', ''),
                        "source": latest.get("application_name", "Pushbullet"),
                        "package": None,
                        "icon": None 
                    })

        # 2. EPHEMERALS (Mirrored Notifications) - HAS ICON & PACKAGE
        elif data.get("type") == "push":
            push = data.get("push", {})
            
            # Filter: Ignore "dismissal" and "clip" (clipboard)
            if push.get('type') == 'mirror':
                app_name = push.get("application_name", "Unknown App")
                package = push.get("package_name", None) # Normalize source
                icon = push.get("icon", None) # Base64 Image
                
                NEWS_QUEUE.put({
                    "title": push.get('title', ''),
                    "body": push.get('body', ''),
                    "source": app_name,
                    "package": package,
                    "icon": icon
                })
                print(f"📱 Mirror: {app_name} ({package})")

    except Exception: pass

def start_listening():
    ws_url = f"{PUSHBULLET_STREAM_URL}{PUSHBULLET_API_KEY}"
    while True:
        try:
            ws = websocket.WebSocketApp(ws_url, on_message=on_message)
            ws.run_forever()
        except Exception: time.sleep(5)