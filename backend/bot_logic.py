import datetime
import queue
import time
import threading
from config import (IMPACT_THRESHOLD_HIGH, NOVELTY_THRESHOLD_HIGH,
                    ALERT_IMPACT_RATE, ALERT_NOVELTY_RATE, ALERT_WINDOW_DAYS, ALERT_MIN_ROWS)
from database import log_news_event, safe_round, get_db_connection
from analysis import get_gemini_analysis, get_text_embedding
from ml_scorer import score_event
import monitor

NEWS_QUEUE = queue.Queue()

# Junk source apps to drop before analysis. "Baha News" pushes general/football
# wire copy (…/topics/bbn-news-google-en), not market news — noise + Gemini spend.
BLOCKED_SOURCES = ("baha",)

_ALERT_THRESH_CACHE = {"ts": 0.0, "impact": IMPACT_THRESHOLD_HIGH, "novelty": NOVELTY_THRESHOLD_HIGH}

def _rate_threshold(vals, rate, fallback):
    """Integer threshold whose trailing firing share is closest to the design
    rate. Closest (not largest-under) because integer scores are coarse —
    a strict bound can overshoot to the next step and under-fire 2-3x."""
    if len(vals) < ALERT_MIN_ROWS:
        return fallback
    n = len(vals)
    return min(range(1, 11), key=lambda t: abs(sum(1 for v in vals if v >= t) / n - rate))


def get_alert_thresholds():
    """Trailing-window thresholds that hold the Gemini-2-era design rates
    regardless of LLM score inflation (see config). Cached 1h; falls back to the
    fixed thresholds when the window is too thin. These no longer fire anything:
    since the per-item cards were retired (2026-09-04) they only mark an event
    PRIORITY inside scripts/news_rollup.py's summary."""
    now = time.time()
    if now - _ALERT_THRESH_CACHE["ts"] < 3600:
        return _ALERT_THRESH_CACHE["impact"], _ALERT_THRESH_CACHE["novelty"]
    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc)
                  - datetime.timedelta(days=ALERT_WINDOW_DAYS)).isoformat()
        with get_db_connection() as conn:
            rows = conn.execute(
                """SELECT impact_score, json_extract(ai_analysis_json,'$.novelty_score')
                   FROM news_events
                   WHERE timestamp >= ?
                     AND COALESCE(json_extract(ai_analysis_json,'$.status'),'OK') != 'FAILED'""",
                (cutoff,)).fetchall()
        impacts = [float(r[0]) for r in rows if r[0] is not None]
        novelties = [float(r[1]) for r in rows if r[1] is not None]
        _ALERT_THRESH_CACHE["impact"] = _rate_threshold(impacts, ALERT_IMPACT_RATE,
                                                        IMPACT_THRESHOLD_HIGH)
        _ALERT_THRESH_CACHE["novelty"] = _rate_threshold(novelties, ALERT_NOVELTY_RATE,
                                                         NOVELTY_THRESHOLD_HIGH)
        _ALERT_THRESH_CACHE["ts"] = now
    except Exception as e:
        print(f"⚠️ Alert threshold query failed, using fixed thresholds: {e}")
    return _ALERT_THRESH_CACHE["impact"], _ALERT_THRESH_CACHE["novelty"]


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

def handle_logging(task, analysis, full_text, macro_data, micro_regime, session, sector_json, source_app, title, ml_score=None):
    """Stores the analysed event. Sends nothing: the per-item alert card was
    retired 2026-09-04 in favour of the windowed summary
    (scripts/news_rollup.py), which reads these rows."""
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
        sector_json=sector_json,
        ml_score=ml_score
    )
    
def process_news_queue():
    print("👷 News Worker Thread Started")
    while True:
        try:
            task = NEWS_QUEUE.get()
            
            # 1. Extract Metadata
            title, body, source_app = extract_metadata(task)

            # 1b. Drop blocked junk sources before spending analysis on them.
            if any(b in source_app.lower() for b in BLOCKED_SOURCES):
                print(f"🚫 Skipped blocked source '{source_app}': {title[:40]}")
                NEWS_QUEUE.task_done()
                continue

            full_text = f"{title} {body}"
            
            # 2. Fetch Context
            macro_data, session, sector_json = fetch_market_context()
            
            print(f"🔍 Analyzing: {title[:40]}...")
            
            # 3. Analyze
            analysis, raw_resp = get_gemini_analysis(title, body, source_app)
            
            # FALLBACK: If analysis failed (e.g. API Error), construct a basic object so it gets logged
            if not analysis:
                print(f"⚠️ Analysis Failed for '{title[:20]}...', using fallback.")
                analysis = {
                    "title": title,
                    "sentiment": "NEUTRAL",
                    "impact_score": 0,
                    "novelty_score": 0,
                    "confidence": 0,
                    "tickers": [],
                    "category": "UNCATEGORIZED",
                    "status": "FAILED"
                }

            # 4. Get Micro Regime
            micro_regime = get_micro_regime(analysis)

            # 4b. ML score (shadow mode: logged + displayed, never gates alerts)
            ml_score = None
            if analysis.get("status") != "FAILED":
                ml_score = score_event(analysis, macro_data, session, sector_json)
                if ml_score:
                    print(f"🤖 ML score: P(UP)={ml_score['p_up']:.2f} score={ml_score['score']:+.2f}")

            # 5. Log and Alert
            handle_logging(
                task, analysis, full_text, macro_data, micro_regime,
                session, sector_json, source_app, title, ml_score=ml_score
            )

            time.sleep(0.5)
            NEWS_QUEUE.task_done()
        except Exception as e:
            print(f"⚠️ Worker Error: {e}")