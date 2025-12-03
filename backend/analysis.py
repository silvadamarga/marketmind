import json
import time
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
    1. Provide a meaningful, actionable takeaway for an investor that places the headline into broader context.
    2. Create a clean, objective dataset for training a future ML model.

    OUTPUT JSON format (Strict):
    {{
      "headline": "<Concise, neutral summary of the event (max 15 words)>",
      "category": "EARNINGS" | "MACRO" | "CENTRAL_BANK" | "GEOPOLITICS" | "M_AND_A" | "REGULATION" | "TECHNICALS" | "SENTIMENT" | "CRYPTO" | "OTHER",
      "sentiment_label": "BULLISH" | "BEARISH" | "NEUTRAL",
      "impact_score": 1-10 (1=Noise, 10=Market Moving Event),
      "novelty_score": 1-10 (1=Old news/Repetitive, 10=Breaking/Unprecedented),
      "tickers": ["NVDA", "BTC"], (List of relevant tickers, max 3),
      "key_takeaway": "<Actionable takeaway or context>",
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



def generate_daily_report(logs):
    """
    Generates a daily market analysis report using Gemini based on the provided logs.
    logs: List of dictionaries containing log data (title, body, impact_score, sentiment, etc.)
    """
    if not logs:
        return None, "No logs provided for analysis."

    # Prepare data for prompt
    events_text = ""
    for i, log in enumerate(logs):
        events_text += f"Event {i+1}:\n"
        events_text += f"Title: {log.get('title', 'N/A')}\n"
        events_text += f"Summary: {log.get('body', 'N/A')}\n"
        events_text += f"Source: {log.get('source_app', 'N/A')}\n"
        events_text += f"Sentiment: {log.get('sentiment', 'N/A')}\n"
        events_text += f"Impact Score: {log.get('impact_score', 'N/A')}\n"
        events_text += f"Novelty Score: {log.get('novelty_score', 'N/A')}\n"
        
        # Add technicals if available
        if log.get('ticker_rsi'):
            events_text += f"RSI: {log.get('ticker_rsi')}\n"
        if log.get('ticker_rvol'):
            events_text += f"RVOL: {log.get('ticker_rvol')}\n"
            
        # Add market context if available
        if log.get('market_vix'):
            events_text += f"Market VIX: {log.get('market_vix')}\n"
        
        # Add sector context if available
        if log.get('market_sector_json'):
             events_text += f"Sector Context: {log.get('market_sector_json')}\n"

        events_text += "---\n"

    prompt = f"""
    You are a Senior Market Analyst for a top-tier hedge fund.
    Your task is to analyze the following list of market events from the last 24 hours and generate a comprehensive, professional daily market report.
    
    The events provided include sentiment, impact scores, and technical indicators where available. Use this data to form a cohesive narrative.

    INPUT DATA:
    {events_text}

    OUTPUT JSON format (Strict):
    {{
      "summary": "<Executive summary of the day's market action. Focus on the biggest drivers. Max 3 sentences.>",
      "market_sentiment": "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED",
      "sentiment_score": 1-10 (1=Extreme Fear, 10=Extreme Greed),
      "critical_events": [
        {{
          "headline": "<The specific news event headline>",
          "context": "<Why it matters, background info, and market context>",
          "impact": "<Specific market reaction (e.g., 'NVDA -2%', 'Sector rotation into staples')>"
        }}
      ],
      "bullish_thesis": "<Strong arguments for a bullish market direction based on the data>",
      "bearish_thesis": "<Strong arguments for a bearish market direction based on the data>",
      "outlook": "<Professional outlook for the next trading session. Be specific about what to watch.>"
    }}
    
    IMPORTANT GUIDELINES:
    - Focus on SPECIFIC NEWS EVENTS. Do not use abstract themes like 'Tech Weakness' unless tied to a specific story.
    - Select the top 3-5 most critical events.
    - Be objective and data-driven.
    - You MUST include 'bullish_thesis' and 'bearish_thesis' in the output.
    """
    
    retries = 3
    for attempt in range(retries):
        try:
            response = model.generate_content(prompt)
            raw_text = response.text
            # print(f"DEBUG: Gemini Raw Response: {raw_text}") 
            cleaned_text = clean_json_string(raw_text)
            data = json.loads(cleaned_text)
            return data, raw_text
        except Exception as e:
            print(f"❌ Gemini Daily Analysis Error (Attempt {attempt+1}/{retries}): {e}")
            if attempt == retries - 1:
                return None, str(e)
            time.sleep(1) # Wait a bit before retrying
