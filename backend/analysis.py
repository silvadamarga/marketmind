import json
import warnings
import time
import re
import google.generativeai as genai
from config import GEMINI_API_KEY
from prompts import GEMINI_ANALYSIS_PROMPT, DAILY_REPORT_PROMPT

warnings.simplefilter(action='ignore', category=FutureWarning)

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        'gemini-2.5-flash',
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
    """
    Single-Step Analysis: Analyzes the news event in one go to determine impact, sentiment, and context.
    """
    prompt = GEMINI_ANALYSIS_PROMPT.format(title=title, body=body)
    try:
        response = model.generate_content(prompt)
        data = json.loads(clean_json_string(response.text))
        return data, response.text
    except Exception as e:
        print(f"❌ Analysis Error: {e}")
        return None, str(e)

def generate_daily_report(logs):
    """
    Generates a daily market analysis report using Gemini based on the provided logs.
    logs: List of dictionaries containing log data (title, body, impact_score, sentiment, etc.)
    """
    if not logs:
        return None, "No logs provided for analysis."

    # Prepare data for prompt
    events_list = []
    for i, log in enumerate(logs):
        event_str = f"Event {i+1}:\n"
        event_str += f"Title: {log.get('title', 'N/A')}\n"
        event_str += f"Summary: {log.get('body', 'N/A')}\n"
        event_str += f"Sentiment: {log.get('sentiment', 'N/A')}\n"
        
        # Add AI Analysis Context
        ai_data = log.get('ai_analysis', {})
        if ai_data:
            event_str += f"Headline Context: {ai_data.get('headline', 'N/A')}\n"
            if ai_data.get('tickers'):
                event_str += f"Tickers: {ai_data.get('tickers')}\n"

        # Add technicals if available
        if log.get('ticker_rsi'):
            event_str += f"RSI: {log.get('ticker_rsi')}\n"
        if log.get('ticker_rvol'):
            event_str += f"RVOL: {log.get('ticker_rvol')}\n"
            
        # Add market context if available
        if log.get('market_vix'):
            event_str += f"Market VIX: {log.get('market_vix')}\n"
        
        # Add sector context if available
        if log.get('market_sector_json'):
             event_str += f"Sector Context: {log.get('market_sector_json')}\n"



        event_str += "---\n"
        events_list.append(event_str)

    events_text = "".join(events_list)

    prompt = DAILY_REPORT_PROMPT.format(events_text=events_text)
    
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
