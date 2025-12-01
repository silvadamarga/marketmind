import requests
from config import DISCORD_WEBHOOK_URL

def send_news_alert(analysis, original_title, source_app):
    color_map = {"BULLISH": 0x00FF00, "BEARISH": 0xFF0000, "NEUTRAL": 0x3498DB}
    color = color_map.get(analysis.get("sentiment"), 0x95A5A6)
    
    embed = {
        "title": f"{analysis.get('action')} {analysis.get('ticker')} | {analysis.get('impact_score')}/10",
        "description": f"**{analysis.get('headline', original_title)}**\n> *{analysis.get('thesis')}*",
        "color": color,
        "fields": [
            {"name": "Category", "value": analysis.get("event_category", "N/A"), "inline": True},
            {"name": "Confidence", "value": f"{analysis.get('ai_confidence')}/10", "inline": True}
        ],
        "footer": {"text": "Market Mind AI"}
    }
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed], "username": "Market Mind"})
    except: pass

def send_system_alert(title, message, color=0xFF0000):
    embed = {
        "title": title,
        "description": message,
        "color": color,
        "footer": {"text": "Market Mind System"}
    }
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed], "username": "Market Mind System"})
    except: pass
