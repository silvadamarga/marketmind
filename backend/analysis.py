import json
import time
import re
from google import genai
from google.genai import types
from config import GEMINI_API_KEY
from prompts import GEMINI_ANALYSIS_PROMPT, DAILY_REPORT_PROMPT

# Stamped into every analysis for provenance. History:
#   gemini 2.x (unstamped)            ... 2026-04-19
#   FAILED outage                     2026-04-20 .. 2026-05-03
#   gemini 3.5, default thinking      2026-05-04 .. (unstamped)
#   thinking_budget=0                 from this stamp — verified on 20 events:
#   sentiment 20/20, category 18/20, impact +/-2 agreement, -83% output tokens
ANALYSIS_LLM_CONFIG = "gemini-flash-latest/think0/2026-06-10"

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

ANALYSIS_CONFIG = types.GenerateContentConfig(
    response_mime_type="application/json",
    thinking_config=types.ThinkingConfig(thinking_budget=0),
)

# Daily report is long-form generation, not schema extraction — thinking stays on.
REPORT_CONFIG = types.GenerateContentConfig(
    response_mime_type="application/json",
)

def clean_json_string(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE | re.DOTALL).strip()
    return text

# text-embedding-004 was retired by Google (~Feb 2026) and the silent except
# hid it — no embeddings were stored from 2026-03 onward. gemini-embedding-001
# at output_dimensionality=768 matches the old stored format.
EMBED_CONFIG = types.EmbedContentConfig(output_dimensionality=768)

def get_text_embedding(text):
    try:
        if not text: return None
        result = client.models.embed_content(model="gemini-embedding-001",
                                             contents=text, config=EMBED_CONFIG)
        return json.dumps(result.embeddings[0].values)
    except Exception as e:
        print(f"⚠️ Embedding failed: {e}")
        return None

def get_gemini_analysis(title, body, source_app):
    """
    Single-Step Analysis: Analyzes the news event in one go to determine impact, sentiment, and context.
    """
    prompt = GEMINI_ANALYSIS_PROMPT.format(title=title, body=body)
    try:
        response = client.models.generate_content(
            model="gemini-flash-latest", contents=prompt, config=ANALYSIS_CONFIG)
        data = json.loads(clean_json_string(response.text))
        data["llm_config"] = ANALYSIS_LLM_CONFIG
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
            response = client.models.generate_content(
                model="gemini-flash-latest", contents=prompt, config=REPORT_CONFIG)
            raw_text = response.text
            cleaned_text = clean_json_string(raw_text)
            data = json.loads(cleaned_text)
            return data, raw_text
        except Exception as e:
            print(f"❌ Gemini Daily Analysis Error (Attempt {attempt+1}/{retries}): {e}")
            if attempt == retries - 1:
                return None, str(e)
            time.sleep(1) # Wait a bit before retrying
