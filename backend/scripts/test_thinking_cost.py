"""Measure what Gemini thinking tokens cost us on the analysis prompt.

Runs N FAILED rows through gemini-flash-latest twice — default thinking vs
thinking_budget=0 — via the new google.genai SDK, then compares token usage
(thoughts are billed as output) and annotation agreement (sentiment, impact,
category). Read-only: nothing is written to the DB.

Context: Gemini 2.x used ~220 output tokens/request; 3.5 uses ~900, and the
delta is billed reasoning. If capped annotations agree with uncapped ones,
capping cuts ~75% of output spend with no ML cost.

Usage (local machine, reads root DB copy + .env):
    venv/bin/python scripts/test_thinking_cost.py [--n 20] [--db ../market_mind.db]
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google import genai
from google.genai import types

from config import GEMINI_API_KEY
from prompts import GEMINI_ANALYSIS_PROMPT

SLEEP = 6  # seconds between calls (observed ~10 RPM limit on this key)


def clean_json(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?|```$", "", text, flags=re.M | re.S).strip()
    return text


def analyze(client, prompt, cap_thinking):
    cfg = types.GenerateContentConfig(
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(thinking_budget=0) if cap_thinking else None,
    )
    resp = client.models.generate_content(
        model="gemini-flash-latest", contents=prompt, config=cfg)
    u = resp.usage_metadata
    return {
        "data": json.loads(clean_json(resp.text)),
        "out": u.candidates_token_count or 0,
        "thoughts": u.thoughts_token_count or 0,
        "prompt": u.prompt_token_count or 0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--db", default="../market_mind.db")
    args = ap.parse_args()

    con = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    rows = [r for r in con.execute(
        "SELECT id, title, body FROM news_events WHERE ai_analysis_json LIKE '%FAILED%'"
        " ORDER BY id").fetchall()][:args.n]
    con.close()
    print(f"{len(rows)} test rows, 2 calls each, ~{len(rows) * 2 * SLEEP / 60:.0f} min")

    client = genai.Client(api_key=GEMINI_API_KEY)
    results = []
    for i, r in enumerate(rows):
        prompt = GEMINI_ANALYSIS_PROMPT.format(title=r["title"] or "", body=r["body"] or "")
        try:
            full = analyze(client, prompt, cap_thinking=False)
            time.sleep(SLEEP)
            capped = analyze(client, prompt, cap_thinking=True)
            time.sleep(SLEEP)
        except Exception as e:
            print(f"  id {r['id']}: {e}")
            time.sleep(SLEEP)
            continue
        results.append((full, capped))
        f, c = full["data"], capped["data"]
        print(f"  id {r['id']}: out+thoughts {full['out']}+{full['thoughts']} -> "
              f"{capped['out']}+{capped['thoughts']} | "
              f"sent {f.get('sentiment_label')}/{c.get('sentiment_label')} "
              f"imp {f.get('impact_score')}/{c.get('impact_score')}")

    if not results:
        print("no successful pairs")
        return
    n = len(results)
    tot = lambda key, idx: sum(r[idx][key] for r in results)
    print(f"\n=== {n} pairs ===")
    print(f"default: {tot('out',0)/n:.0f} out + {tot('thoughts',0)/n:.0f} thoughts "
          f"= {(tot('out',0)+tot('thoughts',0))/n:.0f} billed output tokens/req")
    print(f"capped : {tot('out',1)/n:.0f} out + {tot('thoughts',1)/n:.0f} thoughts "
          f"= {(tot('out',1)+tot('thoughts',1))/n:.0f} billed output tokens/req")
    saved = 1 - (tot('out',1)+tot('thoughts',1)) / max(tot('out',0)+tot('thoughts',0), 1)
    print(f"output token reduction: {saved:.0%}")

    sent_match = sum(r[0]['data'].get('sentiment_label') == r[1]['data'].get('sentiment_label')
                     for r in results)
    cat_match = sum(r[0]['data'].get('category') == r[1]['data'].get('category')
                    for r in results)
    imp_diff = [abs((r[0]['data'].get('impact_score') or 0) - (r[1]['data'].get('impact_score') or 0))
                for r in results]
    print(f"agreement: sentiment {sent_match}/{n}, category {cat_match}/{n}, "
          f"impact mean abs diff {sum(imp_diff)/n:.2f} "
          f"(max {max(imp_diff)})")


if __name__ == "__main__":
    main()
