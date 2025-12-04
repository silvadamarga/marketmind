import queue
import time
import threading
from config import MIN_IMPACT_SCORE
from database import log_news_event, safe_round
from analysis import get_gemini_analysis, get_text_embedding
from notifications import send_news_alert
import monitor

NEWS_QUEUE = queue.Queue()


def extract_metadata(task):
    """Extracts basic metadata from the task."""
    title = task.get("title", "")
    body = task.get("body", "")
    source_app = task.get("source", "Unknown")
    if not title and body: title = body[:50]
    return title, body, source_app

def fetch_market_context():
    """Fetches current market context (macro, session, sector)."""
    vix, sector_json = monitor.get_market_regime_from_cache()
    macro_data = {}
    with monitor.DATA_LOCK:
        macro_data = monitor.LATEST_MACRO_CONTEXT.copy()
    session = monitor.get_session_phase()
    return macro_data, session, sector_json

def get_micro_regime(analysis):
    """Calculates micro regime (RSI, RVOL, VWAP) for the primary ticker."""
    micro_regime = {}
    target_ticker = None
    
    if analysis:
        if analysis.get("tickers") and isinstance(analysis["tickers"], list) and len(analysis["tickers"]) > 0:
            target_ticker = analysis["tickers"][0]
        elif analysis.get("ticker"): # Fallback
            target_ticker = analysis.get("ticker")
    
    if target_ticker:
        with monitor.DATA_LOCK:
            if target_ticker in monitor.LATEST_VWAP_DATA:
                td = monitor.LATEST_VWAP_DATA[target_ticker]
                vwap_dist = 0
                p, v = td.get('price', 0), td.get('vwap', 0)
                if v != 0: vwap_dist = (p - v) / v
                micro_regime = {
                    "rsi": td.get('rsi'),
                    "rvol": td.get('rvol'),
                    "vwap_dist": safe_round(vwap_dist * 100, 2)
                }
    return micro_regime

def handle_logging_and_alerts(task, analysis, full_text, macro_data, micro_regime, session, sector_json, source_app, title):
    """Handles logging to DB and sending alerts."""
    if not analysis:
        return

    # --- CONDITIONAL EMBEDDING ---
    embedding = None
    impact = analysis.get("impact_score", 0)
    if impact >= 5: # Threshold for "worth remembering"
        embedding = get_text_embedding(full_text)

    log_news_event(
        task, 
        analysis,
        embedding=embedding,
        macro_context=macro_data,
        micro_regime=micro_regime,
        session_phase=session,
        sector_json=sector_json
    )
    
    if impact >= MIN_IMPACT_SCORE:
        # Filter: High Impact OR High Novelty
        novelty = analysis.get("novelty_score", 0)
        
        from config import IMPACT_THRESHOLD_HIGH, NOVELTY_THRESHOLD_HIGH
        
        if impact >= IMPACT_THRESHOLD_HIGH or novelty >= NOVELTY_THRESHOLD_HIGH:
            send_news_alert(analysis, title, source_app)
        else:
            print(f"📉 Skipped Low Impact/Novelty: Impact={impact}, Novelty={novelty}")

def process_news_queue():
    print("👷 News Worker Thread Started")
    while True:
        try:
            task = NEWS_QUEUE.get()
            
            # 1. Extract Metadata
            title, body, source_app = extract_metadata(task)
            full_text = f"{title} {body}"
            
            # 2. Fetch Context
            macro_data, session, sector_json = fetch_market_context()
            
            print(f"🔍 Analyzing: {title[:40]}...")
            
            # 3. Analyze
            analysis, raw_resp = get_gemini_analysis(title, body, source_app)
            
            # 4. Get Micro Regime
            micro_regime = get_micro_regime(analysis)

            # 5. Log and Alert
            handle_logging_and_alerts(
                task, analysis, full_text, macro_data, micro_regime, 
                session, sector_json, source_app, title
            )

            time.sleep(0.5)
            NEWS_QUEUE.task_done()
        except Exception as e:
            print(f"⚠️ Worker Error: {e}")