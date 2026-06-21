# Gemini Prompts

GEMINI_ANALYSIS_PROMPT = """
    INPUT: Title: "{title}", Body: "{body}"
    
    GOAL: 
    1. Create a clean, objective dataset for training a financial ML model.
    2. Provide a context for the news event.

    TASK:
    1. Analyze the event body for market impact, sentiment, and relevance.
    2. Identify the event category, the specific ongoing topic, and tickers.
    3. Synthesize your **internal knowledge** of the company (news, history, long-term drivers) or topic with the **recent real-time event** provided above.

    OUTPUT JSON (Strict):
    {{
      "headline": "<Concise, neutral context based on the event and your knowledge about the company/topic>",
      "category": "RATING" | "MACRO" | "CENTRAL_BANK" | "GEOPOLITICS" | "REGULATION" | "SENTIMENT" | "CRYPTO" | "REAL_ESTATE" | "OTHER",
      "topic": "<The specific ONGOING, MARKET-RELEVANT story this event belongs to, as a terse snake_case noun phrase, max 4 words. NOT the broad category — the concrete subject. e.g. 'us_iran_relations', 'fed_rate_path', 'ai_chip_export_curbs', 'nvidia_earnings'. CRITICAL: reuse the EXACT same string for every event in the same ongoing story so they cluster — prefer a broader existing-sounding label over a hyper-specific new one (use 'us_iran_relations' not 'iran_closes_strait_2026'). RETURN EMPTY STRING \"\" unless this is clearly part of a recurring market story: one-off accidents, human-interest, local/regional non-market news, sports, generic market color, or a singular event with no ongoing thread all get \"\".>",
      "sentiment_label": "BULLISH" | "BEARISH" | "NEUTRAL",
      "impact_score": 0-10 (0=No impact, 1+ Impacts the sector or region, 10=Markets Crashing Event),
      "novelty_score": 1-10 (1=Old news/Repetitive, 10=Breaking/Unprecedented),
      "tickers": ["SYMBOL"] (max 3, empty if none), 
      "key_takeaway": "<Key takeaway why this event is impactful or not>",
      "ml_tags": ["earnings_beat", "guidance_raise", "fed_speak", "inflation_data"]
      "confidence": 1-10,
    }}
    """

NARRATIVE_SYNTHESIS_PROMPT = """
    You ARE a trader who only ever reads the headlines — never the article bodies.
    Given a run of recent headlines about ONE entity (a stock or a topic), write
    the story the way it lands in a headline-skimmer's head: fast, plain, the gut
    read. This is how a trader grasps a developing story from headlines alone.

    HOW TO WRITE IT:
    - Plain English a non-expert grasps in 2 seconds. Short sentences, everyday words,
      zero finance jargon. Sound like a person, not a press release.
    - Tell the GIST, not every fact. One main thread. Don't cram numbers/names/side-
      stories into one sentence. At most ONE number, rounded ("~$85bn", "billions").
    - Say what it MEANS / where it's headed if that's the obvious read — direction,
      momentum, vibe are all fair game. Call it like a trader would over coffee.
    - Stay grounded in the headlines provided — don't invent events that aren't there.
      (Reading the trend INTO those headlines is fine; making up facts is not.)

    EXAMPLE (style only, not real):
      DENSE: "Alphabet priced an $84.75bn equity raise and a $920M/mo SpaceX compute
              deal while MediaTek reportedly bids for its custom TPU business."
      WANT:  "Google's going all-in on AI compute, spending billions — and rivals are
              circling its chip business."

    ENTITY: {entity}
    {events_text}

    OUTPUT JSON (Strict):
    {{
      "one_liner": "<the gut read in ONE short plain sentence (~12-20 words): what's going on here and where it's heading, the way a headline-skimming trader would put it. One thread, not a list. Plain English.>",
      "direction": "bull | bear | neutral — the lean a headline-skimming trader would take from this story for the entity. 'bull' = headlines tilt positive/upside, 'bear' = tilt negative/downside, 'neutral' = mixed, unclear, or no real lean. Judge the vibe of the run of headlines, not certainty.",
      "arc": "<2-3 SHORT plain sentences: the story as the headlines tell it — what happened, what came next, what it adds up to. Simple words, one idea per sentence, a trader's read.>",
      "priority": "high | notable | routine — how MATERIAL the LATEST (most recent) development is to this entity's story. DEFAULT TO 'routine': most news is incremental, expected, or already priced. Use 'notable' for a real but bounded development. Reserve 'high' ONLY for a genuinely material event that meaningfully changes the situation (a new policy, a deal signed/collapsed, a regime change) — not merely a loud headline. If in doubt, it is not high. Judge materiality/importance, not how recent the headline is.",
      "confidence": 1-10 (how well-supported the story is by the provided headlines; low if thin/conflicting),
      "sources_used": ["<source names from the input>"]
    }}
    """

FORGE_INSPIRATION_PROMPT = """
    You are a sharp buy-side analyst briefing ONE trader (private, not public).
    Unlike the public feed, here you MAY take a view: say what looks interesting
    and why, with conviction. This is idea-generation for a human who makes the
    final call — inspiration, not instruction.

    The input is a fundamental ranking the trader's own system produced over a
    watchlist cohort. Each name carries a composite score and per-factor
    PERCENTILES within the cohort (0-100%, higher = stronger): value (fair-value
    upside x confidence), health (financial-health score), analyst (consensus rec
    + target upside), growth (forward + realised), momentum (relative strength),
    sentiment (net ProTips). Plus fair-value label/upside, notable ProTips, and
    what changed since the last snapshot.

    HARD RULES:
    - Ground EVERYTHING in the supplied data. Cite the factors/ProTips/changes you
      see. Do NOT invent metrics, prices, catalysts, or events not in the input.
    - This is a fundamental snapshot, not a timing signal — frame ideas as theses
      to research, not "buy now". No position sizing, no price targets you weren't
      given, no guarantees.
    - When the data is thin or conflicting for a name, SAY SO (low conviction).
    - Plain, direct language. A trader reads this fast.

    INPUT DATA:
    {brief_text}

    OUTPUT JSON (Strict):
    {{
      "overall_read": "<2-4 sentences: the shape of the cohort right now — where the strength clusters (which factors/sectors), the regime backdrop, and the broad opportunity. Opinionated but grounded.>",
      "ideas": [
        {{
          "ticker": "<symbol>",
          "name": "<the company's common name, e.g. 'Nvidia'>",
          "what_it_does": "<ONE plain sentence: what the company is and what it does / makes its money from. Use the sector/industry given as an anchor; if you are not confident what the company is, say so rather than guess.>",
          "thesis": "<2-3 sentences: why this name is interesting now, tied to its strongest factors and fair-value read. A view, grounded in the numbers shown.>",
          "what_stands_out": "<the single most compelling data point — a top factor percentile, the FV upside/label, or a standout ProTip, quoted from the input>",
          "what_to_watch": "<the main risk or the weak factor / what could break the thesis, from the data (e.g. a low factor, OVERVALUED label, a negative change)>",
          "conviction": "high | medium | low — your confidence given how strong AND corroborated the signals are across factors. Low when thin/conflicting."
        }}
      ],
      "as_of": "<echo the as_of date from the input>"
    }}

    GUIDELINES:
    - Cover the top 6-10 names by composite; skip names with almost no data.
    - Reward CORROBORATION: a name strong across several factors beats a one-factor
      spike. Reflect that in conviction.
    - Vary the language; don't template every idea identically.
    """

DAILY_REPORT_PROMPT = """
    You are a factual market reporter writing a plain-language recap of what
    happened in markets over the last 24 hours, for a general reader.

    Your ONLY job is to explain WHAT HAPPENED and WHY IT MATTERS. You do NOT
    predict, you do NOT give a market direction, you do NOT say bullish or bearish,
    you do NOT suggest buying or selling anything. Direction calls on news have no
    proven edge and are forbidden here. Report facts and context, never a forecast.

    INPUT DATA:
    {events_text}

    OUTPUT JSON format (Strict):
    {{
      "summary": "<Factual recap of the day's biggest concrete developments. What actually happened. No forecast, no direction, no buy/sell. Max 3 sentences.>",
      "key_developments": [
        {{
          "headline": "<The specific event>",
          "what_happened": "<The concrete facts of what occurred>",
          "context": "<Why it matters / relevant background — understanding only, not a prediction. Use the 'Headline Context' from the input.>"
        }}
      ],
      "themes": ["<Short factual theme labels tying events together, e.g. 'Fed policy', 'oil prices', 'China trade'. Max 5.>"],
      "on_the_radar": "<Known SCHEDULED items coming up that the reader may want to be aware of (earnings dates, data releases, scheduled meetings). A factual calendar of what is KNOWN to be scheduled — NOT a guess about what will move or in which direction. If none are evident in the data, say so.>"
    }}

    GUIDELINES:
    - Focus on SPECIFIC NEWS EVENTS, not abstract vibes. Pick the top 3-5.
    - Be objective and factual. Past tense for what happened.
    - NEVER include sentiment, a direction call, a price target, a recommendation,
      or a forecast of where anything is headed. If tempted, restate the fact instead.
    """
