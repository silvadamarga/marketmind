import json
import datetime
import re
import math
import google.generativeai as genai
import yfinance as yf
import pandas as pd
import numpy as np
import warnings
from config import GEMINI_API_KEY, VWAP_BANDS, RSI_PERIOD, MACRO_TICKERS, SECTOR_TICKERS, CALENDAR_EVENTS

warnings.simplefilter(action='ignore', category=FutureWarning)

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        'gemini-2.0-flash',
        generation_config={"response_mime_type": "application/json"}
    )

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
    You are a Financial Data Labeling Engine & Analyst.
    INPUT: Source: {source_app}, Title: "{title}", Body: "{body}"
    
    GOAL: 
    1. Create a clean, objective dataset for training a future ML model.
    2. Provide a quick, actionable overview for an intraday trader.

    OUTPUT JSON format (Strict):
    {{
      "headline": "<Concise, neutral summary of the event (max 15 words)>",
      "category": "EARNINGS" | "MACRO" | "CENTRAL_BANK" | "GEOPOLITICS" | "M_AND_A" | "REGULATION" | "TECHNICALS" | "SENTIMENT" | "CRYPTO" | "OTHER",
      "sentiment_label": "BULLISH" | "BEARISH" | "NEUTRAL",
      "impact_score": 1-10 (1=Noise, 10=Market Moving Event),
      "novelty_score": 1-10 (1=Old news/Repetitive, 10=Breaking/Unprecedented),
      "tickers": ["NVDA", "BTC"], (List of relevant tickers, max 3),
      "key_takeaway": "<One sentence actionable takeaway for a trader>",
      "confidence": 1-10 (Confidence in your analysis),
      "ml_tags": ["earnings_beat", "guidance_raise", "fed_speak", "inflation_data"] (List of specific tags for ML filtering)
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


