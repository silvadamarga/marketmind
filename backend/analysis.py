import datetime
import json
import time
import re
from google import genai
from google.genai import types
from config import GEMINI_API_KEY
from prompts import (GEMINI_ANALYSIS_PROMPT, DAILY_REPORT_PROMPT,
                     NARRATIVE_SYNTHESIS_PROMPT, FORGE_INSPIRATION_PROMPT)
from usage import log_usage

# Stamped into every analysis for provenance. History:
#   gemini 2.x (unstamped)            ... 2026-04-19
#   FAILED outage                     2026-04-20 .. 2026-05-03
#   gemini 3.5, default thinking      2026-05-04 .. (unstamped)
#   thinking_budget=0                 2026-06-10 — verified on 20 events:
#   sentiment 20/20, category 18/20, impact +/-2 agreement, -83% output tokens
#   (prose fields headline/key_takeaway dropped 2026-07-02, tag unbumped)
#   flash-lite                        from this stamp — pinned model id, not the
#   -latest alias, so a Google hot-swap can't silently change price or quality;
#   if Google retires it, calls FAIL loudly and daily_health FAILED% catches it.
#   tagger v2                         2026-11-21 — new era, never pool with the
#   above: temperature 0, enforced schema, dated prompt with the active topic
#   list, no model novelty/confidence (novelty from story.novelty), duplicates
#   dropped before tagging, Investing price notices tagged by rule (RULE_CONFIG
#   stamps the same era so a per-row era read keeps them together).
ANALYSIS_MODEL = "gemini-3.1-flash-lite"
ANALYSIS_LLM_CONFIG = "gemini-3.1-flash-lite/think0/t0-schema/v2/2026-11-21"

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

CATEGORIES = ["RATING", "MACRO", "CENTRAL_BANK", "GEOPOLITICS", "REGULATION",
              "SENTIMENT", "CRYPTO", "REAL_ESTATE", "OTHER"]

TAG_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "category": types.Schema(type=types.Type.STRING, enum=CATEGORIES),
        "topic": types.Schema(type=types.Type.STRING),
        "sentiment_label": types.Schema(type=types.Type.STRING,
                                        enum=["BULLISH", "BEARISH", "NEUTRAL"]),
        "impact_score": types.Schema(type=types.Type.INTEGER, minimum=0, maximum=10),
        "tickers": types.Schema(type=types.Type.ARRAY, max_items=3,
                                items=types.Schema(type=types.Type.STRING)),
        "ml_tags": types.Schema(type=types.Type.ARRAY, max_items=4,
                                items=types.Schema(type=types.Type.STRING)),
    },
    required=["category", "topic", "sentiment_label", "impact_score", "tickers", "ml_tags"],
    property_ordering=["category", "topic", "sentiment_label", "impact_score",
                       "tickers", "ml_tags"],
)

ANALYSIS_CONFIG = types.GenerateContentConfig(
    response_mime_type="application/json",
    response_schema=TAG_SCHEMA,
    temperature=0,
    thinking_config=types.ThinkingConfig(thinking_budget=0),
)

# Investing's templated price notices: "Zoetis Inc (ZTS) is down -5.05% to 81.25",
# "Oracle (ORCL) sinks to a 52 Week low at 108.48", optionally followed by
# "Check out ...'s live quote now". They restate a price, so the model's
# BULLISH/BEARISH on them was the move itself. Anchored at the start so a real
# headline that merely mentions a move never matches. "Earnings EPS: $x vs. $y
# forecast" is news and stays with the model.
_PRICE_ECHO = re.compile(
    r"^.{1,80}?\((?P<ticker>[A-Z][A-Z0-9.]{0,9})\) "
    r"(?:is (?:up|down|rising|falling|tanking|rallying|jumping|plunging|surging|"
    r"sliding|soaring|sinking|climbing|dropping|gaining|losing|slumping|spiking) "
    r"[-+]?[\d.,]+% to [\d.,]+"
    r"|(?:sinks|jumps|falls|rises|climbs|drops) to an? \d+ Week (?:low|high) at [\d.,]+"
    r"|(?:reached|hits) an? (?:\d+ Week (?:low|high)|all time (?:high|low)|"
    r"Record-(?:High|Low) level) at [\d.,]+)")
# Up to 20: a symbol, or a capitalised company name the forge resolver
# (scraper/ticker_resolve.py) maps by name when the model does not know the symbol.
_TICKER_OK = re.compile(r"^[A-Z][A-Z0-9.\-&]{0,19}$")
# Index, exchange-as-index and currency symbols the v1 tagger emitted for
# market-wide news; none is a company the row is about.
_NOT_TICKERS = {"SPX", "NDX", "FTSE", "DAX", "DJI", "DJIA", "COMP", "IXIC", "VIX",
                "GBP", "USD", "EUR", "JPY", "CNY", "USDJPY", "EURUSD", "GBPUSD",
                "XAU", "XAG", "BTC", "ETH"}


def rule_tag(body):
    """Tag a templated price notice without a model call, or None if `body` is
    not one. Same shape as a model tag, so every reader treats it alike."""
    m = _PRICE_ECHO.match((body or "").strip())
    if not m:
        return None
    return {"category": "SENTIMENT", "topic": "", "sentiment_label": "NEUTRAL",
            "impact_score": 1, "tickers": [m.group("ticker")],
            "ml_tags": ["price_action"], "method": "rule_price_echo",
            "llm_config": ANALYSIS_LLM_CONFIG}


def _clean_tags(data):
    """Normalise a model tag: uppercase, de-duplicated, real-looking tickers only;
    snake_case topic; impact clamped. The schema bounds the shape, this bounds
    the content."""
    tickers = []
    for t in data.get("tickers") or []:
        t = str(t).strip().upper().lstrip("$")
        if t == "GOOG":
            t = "GOOGL"
        if _TICKER_OK.match(t) and t not in _NOT_TICKERS and t not in tickers:
            tickers.append(t)
    data["tickers"] = tickers[:3]
    data["topic"] = re.sub(r"[^a-z0-9]+", "_", (data.get("topic") or "").strip().lower()).strip("_")
    data["impact_score"] = max(0, min(10, int(data.get("impact_score") or 0)))
    data["ml_tags"] = [str(x).strip().lower() for x in (data.get("ml_tags") or [])][:4]
    return data

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

def get_gemini_analysis(title, body, source_app, topics=None, today=None):
    """One model tag for one notification. `topics` is the active-topic list the
    model should reuse (database.active_topics); `today` an ISO date, default
    the current UTC date. Returns (tag, raw_text) or (None, error_text)."""
    today = today or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    prompt = GEMINI_ANALYSIS_PROMPT.format(
        today=today, source=source_app or "unknown", title=title or "", body=body or "",
        topics=", ".join(topics) if topics else "(none yet)")
    try:
        response = client.models.generate_content(
            model=ANALYSIS_MODEL, contents=prompt, config=ANALYSIS_CONFIG)
        log_usage("analysis", response.usage_metadata, model=ANALYSIS_MODEL)  # highest-volume call
        data = _clean_tags(json.loads(clean_json_string(response.text)))
        data["method"] = "llm"
        data["llm_config"] = ANALYSIS_LLM_CONFIG
        return data, response.text
    except Exception as e:
        print(f"❌ Analysis Error: {e}")
        return None, str(e)[:300]

def generate_narrative_synthesis(entity, events_text):
    """Grounded, direction-free 'story so far' for one entity. Returns the parsed
    dict, or None if no API key / the call fails (caller falls back to the
    deterministic card — degrade-not-vanish)."""
    if client is None:
        return None
    prompt = NARRATIVE_SYNTHESIS_PROMPT.format(entity=entity, events_text=events_text)
    try:
        response = client.models.generate_content(
            model="gemini-flash-latest", contents=prompt, config=REPORT_CONFIG)
        um = response.usage_metadata
        # thinking is on (REPORT_CONFIG) — thoughts tokens are billed; log to monitor cost
        log_usage("synthesis", um)
        print(f"🧠 synth {entity}: in {um.prompt_token_count} out {um.candidates_token_count} "
              f"think {getattr(um, 'thoughts_token_count', None)}")
        return json.loads(clean_json_string(response.text))
    except Exception as e:
        print(f"⚠️ Narrative synthesis failed for {entity}: {e}")
        return None


def generate_forge_inspiration(brief_text):
    """Opinionated, trader-only narration of the forge's fundamental ranking.
    Long-form generation (thinking on, REPORT_CONFIG). Returns the parsed dict,
    or None if no API key / the call fails (caller degrades gracefully)."""
    if client is None:
        return None
    prompt = FORGE_INSPIRATION_PROMPT.format(brief_text=brief_text)
    retries = 3
    for attempt in range(retries):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest", contents=prompt, config=REPORT_CONFIG)
            um = response.usage_metadata
            log_usage("inspiration", um)
            print(f"💡 inspiration: in {um.prompt_token_count} out {um.candidates_token_count} "
                  f"think {getattr(um, 'thoughts_token_count', None)}")
            return json.loads(clean_json_string(response.text))
        except Exception as e:
            print(f"⚠️ Forge inspiration failed (attempt {attempt+1}/{retries}): {e}")
            if attempt == retries - 1:
                return None
            time.sleep(1)


def generate_daily_report(logs, window_hours=24):
    """
    Generates a market news recap using Gemini based on the provided logs.
    logs: List of dictionaries containing log data (title, body, impact_score, sentiment, etc.)
    window_hours: the span the logs cover, so the prose names the real window
    (the frontend daily report is 24h; scripts/news_rollup.py is shorter).
    A log with flagged=True is marked PRIORITY in the prompt.
    """
    if not logs:
        return None, "No logs provided for analysis."

    # Prepare data for prompt
    events_list = []
    for i, log in enumerate(logs):
        event_str = f"Event {i+1}{' [PRIORITY]' if log.get('flagged') else ''}:\n"
        event_str += f"Title: {log.get('title', 'N/A')}\n"
        event_str += f"Summary: {log.get('body', 'N/A')}\n"
        # Sentiment deliberately NOT fed to the recap — it must not anchor on a
        # direction (the public recap is factual, no buy/sell, no forecast).

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

    prompt = DAILY_REPORT_PROMPT.format(events_text=events_text, window_hours=window_hours)

    retries = 3
    for attempt in range(retries):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest", contents=prompt, config=REPORT_CONFIG)
            log_usage("daily_report", response.usage_metadata)
            raw_text = response.text
            cleaned_text = clean_json_string(raw_text)
            data = json.loads(cleaned_text)
            return data, raw_text
        except Exception as e:
            print(f"❌ Gemini Daily Analysis Error (Attempt {attempt+1}/{retries}): {e}")
            if attempt == retries - 1:
                return None, str(e)
            time.sleep(1) # Wait a bit before retrying
