import sqlite3
import datetime
import math
import json
from config import DB_FILE

from contextlib import contextmanager

def safe_round(val, digits=2):
    try:
        if val is None: return 0.0
        f = float(val)
        if math.isnan(f) or math.isinf(f): return 0.0
        return round(f, digits)
    except Exception:
        return 0.0

@contextmanager
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row # Return rows as dict-like objects
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    try:
        with get_db_connection() as conn:
            conn.execute('PRAGMA journal_mode=WAL;') 
            c = conn.cursor()
            
            # 1. Legacy Logs (Keep for backward compatibility if needed, or migration)
            c.execute('''CREATE TABLE IF NOT EXISTS logs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp TEXT,
                            source_app TEXT,
                            source_package TEXT,
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
                            ai_confidence INTEGER,
                            price_spy REAL,
                            price_qqq REAL,
                            price_iwm REAL,
                            yield_10y REAL,
                            price_dxy REAL,
                            price_btc REAL,
                            days_until_fomc INTEGER,
                            days_until_cpi INTEGER,
                            days_until_nfp INTEGER,
                            sector_rel_strength TEXT,
                            spy_200d_sma_dist REAL,
                            market_breadth INTEGER
                        )''')

            # 2. Market Data (Time-Series)
            c.execute('''CREATE TABLE IF NOT EXISTS market_data (
                            timestamp TEXT,
                            ticker TEXT,
                            open REAL,
                            high REAL,
                            low REAL,
                            close REAL,
                            volume INTEGER,
                            vwap REAL,
                            rsi REAL,
                            rvol REAL,
                            PRIMARY KEY (timestamp, ticker)
                        )''')

            # 3. News Events
            c.execute('''CREATE TABLE IF NOT EXISTS news_events (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp TEXT,
                            source_app TEXT,
                            title TEXT,
                            body TEXT,
                            sentiment TEXT,
                            impact_score INTEGER,
                            related_ticker TEXT,
                            category TEXT,
                            ai_analysis_json TEXT,
                            embedding BLOB,
                            context_json TEXT
                        )''')
            
            # Migration: Add category column if it doesn't exist
            try:
                c.execute("ALTER TABLE news_events ADD COLUMN category TEXT")
            except sqlite3.OperationalError:
                pass # Column likely already exists

            # Migration: Add context_json column if it doesn't exist
            try:
                c.execute("ALTER TABLE news_events ADD COLUMN context_json TEXT")
            except sqlite3.OperationalError:
                pass # Column likely already exists

            # Index for faster category lookup in logs (Legacy but still used)
            c.execute("CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(event_category)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_news_events_category ON news_events(category)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_news_events_ticker ON news_events(related_ticker)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_news_ticker_time ON news_events(related_ticker, timestamp DESC)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_news_category_time ON news_events(category, timestamp DESC)")

            # 4. Daily Reports
            c.execute('''CREATE TABLE IF NOT EXISTS daily_reports (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            date TEXT UNIQUE,
                            report_json TEXT,
                            created_at TEXT
                        )''')
            





            conn.commit()
        print(f"✅ Database initialized: {DB_FILE}")
    except Exception as e:
        print(f"❌ Database Error: {e}")

def log_market_data(timestamp, ticker_data):
    """
    Logs a batch of market data.
    ticker_data: List of dicts with keys: ticker, open, high, low, close, volume, vwap, rsi, rvol
    """
    try:
        with get_db_connection() as conn:
            c = conn.cursor()
            c.executemany('''INSERT OR REPLACE INTO market_data 
                             (timestamp, ticker, open, high, low, close, volume, vwap, rsi, rvol)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                          [(timestamp, d['ticker'], d.get('open'), d.get('high'), d.get('low'), d.get('close'), 
                            d.get('volume'), d.get('vwap'), d.get('rsi'), d.get('rvol')) for d in ticker_data])
            conn.commit()
    except Exception as e:
        print(f"⚠️ Market Data Logging Failed: {e}")

def log_news_event(data_pack, analysis, embedding=None, macro_context=None, micro_regime=None, session_phase=None, sector_json=None):
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if macro_context is None: macro_context = {}
    if micro_regime is None: micro_regime = {}
    
    try:
        # Extract fields from new analysis structure
        # Ticker
        primary_ticker = None
        if analysis.get("tickers") and isinstance(analysis["tickers"], list) and len(analysis["tickers"]) > 0:
            primary_ticker = analysis["tickers"][0]
        elif analysis.get("ticker"):
            primary_ticker = analysis.get("ticker")
            
        # Sentiment
        sentiment = analysis.get("sentiment_label") or analysis.get("sentiment")
        
        # Thesis / Summary
        thesis = analysis.get("key_takeaway") or analysis.get("thesis")
            
        # Category
        category = analysis.get("category") or analysis.get("event_category")
        
        # Confidence
        confidence = analysis.get("confidence") or analysis.get("ai_confidence")

        # Construct Context JSON
        context_data = {
            "macro": macro_context,
            "micro": micro_regime,
            "session": session_phase,
            "sectors": sector_json,
            "novelty": analysis.get("novelty_score", 0),
            "confidence": confidence,
            "thesis": thesis,
            "source_pkg": data_pack.get("package")
        }

        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO news_events 
                         (timestamp, source_app, title, body, sentiment, impact_score, related_ticker, category, ai_analysis_json, embedding, context_json)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (timestamp, 
                       data_pack.get("source"), 
                       data_pack.get("title"), 
                       data_pack.get("body"), 
                       sentiment, 
                       analysis.get("impact_score", 0),
                       primary_ticker,
                       category,
                       json.dumps(analysis),
                       embedding,
                       json.dumps(context_data)))
            conn.commit()
            return c.lastrowid # Return ID for deep dive linking
            
    except Exception as e:
        print(f"⚠️ News Logging Failed: {e}")
        return None







