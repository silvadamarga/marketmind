# Gemini Prompts

GEMINI_ANALYSIS_PROMPT = """
    INPUT: Title: "{title}", Body: "{body}"
    
    GOAL: 
    1. Create a clean, objective dataset for training a financial ML model.
    2. Provide a context for the news event.

    TASK:
    1. Analyze the event body for market impact, sentiment, and relevance.
    2. Identify the event category and tickers.
    3. Synthesize your **internal knowledge** of the company (news, history, long-term drivers) or topic with the **recent real-time event** provided above.

    OUTPUT JSON (Strict):
    {{
      "headline": "<Concise, neutral context based on the event and your knowledge about the company/topic>",
      "category": "RATING" | "MACRO" | "CENTRAL_BANK" | "GEOPOLITICS" | "REGULATION" | "SENTIMENT" | "CRYPTO" | "REAL_ESTATE" | "OTHER",
      "sentiment_label": "BULLISH" | "BEARISH" | "NEUTRAL",
      "impact_score": 0-10 (0=No impact, 1+ Impacts the sector or region, 10=Markets Crashing Event),
      "novelty_score": 1-10 (1=Old news/Repetitive, 10=Breaking/Unprecedented),
      "tickers": ["SYMBOL"] (max 3, empty if none), 
      "key_takeaway": "<Key takeaway why this event is impactful or not>",
      "ml_tags": ["earnings_beat", "guidance_raise", "fed_speak", "inflation_data"]
      "confidence": 1-10,
    }}
    """

DAILY_REPORT_PROMPT = """
    You are a Senior Market Analyst for a top-tier hedge fund.
    Your task is to analyze the following list of market events from the last 24 hours and generate a comprehensive, professional daily market report.
    
    The events provided include sentiment, impact scores, technical indicators, and **detailed AI analysis** (key takeaways, context). 
    Use this rich data to form a cohesive, deep, and actionable narrative.

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
          "context": "<Why it matters, background info, and market context. USE THE PROVIDED 'Headline Context' AND 'Key Takeaway' FROM INPUT.>",
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
    - **CRITICAL**: Leverage the 'Key Takeaway' and 'Headline Context' provided in the input for each event to add depth to your analysis.
    """
