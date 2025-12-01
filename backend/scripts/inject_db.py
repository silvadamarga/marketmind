import bot_logic
import json
import random
import time

print("--- 💉 MANUAL DATA INJECTION TOOL ---")

# 1. Initialize DB (Ensures we are talking to the right file)
bot_logic.init_db()

# ---------------------------------------------------------
# CONFIGURATION: Edit this section to test different scenarios
# ---------------------------------------------------------

# The "News" Payload (simulating Pushbullet)
news_payload = {
    "title": "Fed Chair Powell Hints at Rate Pause in December",
    "body": "In a surprise statement, Jerome Powell suggested that inflation data allows for a 'wait and see' approach, sparking a rally in risk assets.",
    "source": "Bloomberg",
    "package": "com.bloomberg.android.plus",
    "icon": None  # Optional: You can paste a base64 string here if you want to test icons
}

# The "AI" Analysis (simulating Gemini)
ai_result = {
    "headline": "Powell signals rate pause, markets rally",
    "ticker": "MACRO",
    "action": "BUY",
    "sentiment": "BULLISH",
    
    # New ML Scores (1-10)
    "impact_score": 9,
    "novelty_score": 8,
    "ai_confidence": 9,
    "event_category": "CENTRAL_BANK",
    
    "timeframe": "SWING",
    "thesis": "Pause in hikes lowers cost of capital expectations, bullish for equities.",
    "counter": "Inflation could re-accelerate."
}

# The "Context" (simulating the Background Monitor)
mock_vix = 14.5
mock_sector_map = {
    "SPY": 1.25,
    "QQQ": 1.80,
    "XLK": 2.10,  # Tech leading
    "XLE": -0.50, # Energy lagging
    "^TNX": -2.5  # Yields dropping
}

# The "Micro-Technicals" (simulating VWAP Monitor)
mock_rsi = 45.0
mock_rvol = 1.5
mock_vwap_dist = 0.8 # 0.8% above VWAP

# ---------------------------------------------------------
# EXECUTION
# ---------------------------------------------------------

print(f"📝 Preparing Injection: {news_payload['title']}...")

# Try to generate a real embedding if API key is present
print("🧠 Generating Vector Embedding...")
real_embedding = bot_logic.get_text_embedding(f"{news_payload['title']} {news_payload['body']}")
if real_embedding:
    print("   ✅ Embedding Generated")
else:
    print("   ⚠️  Skipping Embedding (Check API Key)")

# Commit to Database
bot_logic.log_transaction(
    data_pack=news_payload,
    prompt="MANUAL_INJECTION",
    raw_response=json.dumps(ai_result),
    parsed_data=ai_result,
    
    # ML Context Layers
    market_vix=mock_vix,
    market_sector_json=json.dumps(mock_sector_map),
    embedding=real_embedding,
    
    # Technical Layers
    ticker_rsi=mock_rsi,
    ticker_rvol=mock_rvol,
    ticker_vwap_dist=mock_vwap_dist,
    session_phase="MARKET_OPEN"
)

print("\n✅ INJECTION SUCCESSFUL!")
print("👉 Check your Dashboard to see the new entry.")