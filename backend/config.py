import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
PUSHBULLET_API_KEY = os.getenv("PUSHBULLET_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Pushbullet Config
PUSHBULLET_STREAM_URL = os.getenv("PUSHBULLET_STREAM_URL", "wss://stream.pushbullet.com/websocket/")
PUSHBULLET_API_URL = os.getenv("PUSHBULLET_API_URL", "https://api.pushbullet.com/v2/pushes?limit=1")

# Database Config
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "market_mind.db")

# Analysis Config
MIN_IMPACT_SCORE = 6
IMPACT_THRESHOLD_HIGH = 7   # fallback when trailing alert window is too thin
NOVELTY_THRESHOLD_HIGH = 7  # fallback when trailing alert window is too thin

# Alert design rates: the share of events the fixed >=7 thresholds fired on
# in the Gemini-2 era (audited 2026-06-10). Trailing thresholds in
# bot_logic.get_alert_thresholds adapt to keep firing at these rates across
# LLM version drift (Gemini 3.5 inflated impact>=7 to ~3x the design rate).
ALERT_IMPACT_RATE = 0.041
ALERT_NOVELTY_RATE = 0.110
ALERT_WINDOW_DAYS = 30
ALERT_MIN_ROWS = 300
PUSHBULLET_HEARTBEAT_TIMEOUT = 60 # Seconds

VWAP_CHECK_INTERVAL = 900
VWAP_BANDS = 2.0
RSI_PERIOD = 14

# Asset Universe
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

# Macro Data Collection Config
MACRO_TICKERS = ['SPY', 'QQQ', 'IWM', '^TNX', 'DX-Y.NYB', 'BTC-USD', '^VIX']
SECTOR_TICKERS = ['XLE', 'XLF', 'XLK', 'XLV', 'XLP', 'XLU', 'XLY', 'XLI', 'XLB', 'XLRE', 'XLC']

# Calendar Risk (Confirmed Dates)
# Full 2026 schedules per OMB/OIRA Principal Federal Economic Indicators
# calendar + federalreserve.gov (updated 2026-06-10; refresh before 2027).
CALENDAR_EVENTS = {
    # Federal Reserve Interest Rate Decisions (2nd day of meeting/Announcement)
    "FOMC": ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
             "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"],

    # Consumer Price Index Releases (BLS Schedule)
    "CPI":  ["2026-01-13", "2026-02-11", "2026-03-11", "2026-04-10",
             "2026-05-12", "2026-06-10", "2026-07-14", "2026-08-12",
             "2026-09-11", "2026-10-14", "2026-11-10", "2026-12-10"],

    # Non-Farm Payrolls / Employment Situation (BLS Schedule)
    "NFP":  ["2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03",
             "2026-05-08", "2026-06-05", "2026-07-02", "2026-08-07",
             "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04"]
}
