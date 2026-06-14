import requests
from config import DISCORD_WEBHOOK_URL

def send_news_alert(analysis, original_title, source_app, ml_score=None, forge=None):
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
    if ml_score:
        embed["fields"].append({
            "name": "ML 1d (shadow)",
            "value": f"P(UP) {ml_score['p_up']:.0%} | score {ml_score['score']:+.2f}",
            "inline": True
        })
    if forge:
        # Forge fundamental rank snapshot (pipe 2). Annotation only — flag the
        # snapshot's age so a stale rank isn't read as fresh.
        stale_tag = {"stale": " ⚠️stale", "very_stale": " ⚠️very stale"}.get(forge["staleness"], "")
        bits = [f"#{forge['rank']}"]
        if forge.get("fv_upside") is not None:
            bits.append(f"FV {forge['fv_upside']:+.0%}")
        if forge.get("sector"):
            bits.append(forge["sector"])
        embed["fields"].append({
            "name": f"Forge rank ({forge.get('as_of', '?')}{stale_tag})",
            "value": " | ".join(bits),
            "inline": True
        })
    try:
        requests.post(DISCORD_WEBHOOK_URL, json={"embeds": [embed], "username": "Market Mind"})
    except: pass

def send_posture_alert(old_label, new_label, posture):
    """News-volatility regime change (shadow / decision-support — not a trade
    signal). Fires only when the posture LEVEL crosses (market_posture). Colored
    by direction of change; lists the component z-scores so the reason is visible."""
    rank = {"CALM": 0, "NORMAL": 1, "ELEVATED": 2, "HIGH": 3}
    rising = rank.get(new_label, 0) >= rank.get(old_label, 0)
    color = {"CALM": 0x3498DB, "NORMAL": 0x95A5A6,
             "ELEVATED": 0xE67E22, "HIGH": 0xFF0000}.get(new_label, 0x95A5A6)
    arrow = "▲" if rising else "▼"
    comp = posture.get("components", {})
    # surface the biggest contributors to the move
    drivers = sorted(comp.items(), key=lambda kv: -abs(kv[1].get("oriented_z") or 0))[:3]
    driver_txt = ", ".join(f"{k} {c.get('oriented_z'):+.1f}σ" for k, c in drivers) or "—"
    vix = posture.get("vix")
    fields = [
        {"name": "Score", "value": f"{posture.get('score')}", "inline": True},
        {"name": "24h events", "value": f"{posture.get('n_events')}", "inline": True},
        {"name": "VIX", "value": (f"{vix}" + (" ⚠️" if posture.get("high_vix") else "")) if vix else "—", "inline": True},
        {"name": "Drivers (oriented z)", "value": driver_txt, "inline": False},
    ]
    embed = {
        "title": f"{arrow} News-vol regime: {old_label} → {new_label}",
        "description": ("Implied next-day move SIZE from current news flow "
                        "(shadow — not a direction call)."
                        + (" Signal most reliable in this elevated-VIX regime."
                           if posture.get("high_vix") else "")),
        "color": color,
        "fields": fields,
        "footer": {"text": "Market Mind · posture (decision-support)"},
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
