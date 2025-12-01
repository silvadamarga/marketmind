import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
PUSHBULLET_API_KEY = os.getenv("PUSHBULLET_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

# Pushbullet Config
PUSHBULLET_STREAM_URL = os.getenv("PUSHBULLET_STREAM_URL", "wss://stream.pushbullet.com/websocket/")
PUSHBULLET_API_URL = os.getenv("PUSHBULLET_API_URL", "https://api.pushbullet.com/v2/pushes?limit=1")

# Database Config
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "market_mind.db")

# Analysis Config
MIN_IMPACT_SCORE = 6
IMPACT_THRESHOLD_HIGH = 8
NOVELTY_THRESHOLD_HIGH = 8
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

# Calendar Risk (Placeholder Dates - User to Update)
CALENDAR_EVENTS = {
    "FOMC": ["2025-12-10", "2026-01-28", "2026-03-18"],
    "CPI": ["2025-12-12", "2026-01-14", "2026-02-13"],
    "NFP": ["2025-12-05", "2026-01-09", "2026-02-06"]
}
