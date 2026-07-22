import os

import requests

# Signal relay (signal-bot on this box) — replaces the Discord webhook. Same
# embed dicts are built by the senders below; _post renders them to plain text.
SIGNAL_SEND_URL = os.getenv("SIGNAL_SEND_URL", "http://127.0.0.1:8420/send")
SIGNAL_AUTH_TOKEN = os.getenv("SIGNAL_AUTH_TOKEN", "")

_MAX_LEN = 4000  # relay caps messages at 4096


def _post(embed, username="Market Mind"):
    """Render an embed dict to text and send it via the Signal relay.
    Returns True on a 2xx (send-then-mark callers rely on this)."""
    parts = [f"■ {embed.get('title', username)}"]
    if embed.get("description"):
        parts.append(embed["description"])
    for f in embed.get("fields", []):
        parts.append(f"{f.get('name')}: {f.get('value')}")
    footer = (embed.get("footer") or {}).get("text")
    if footer:
        parts.append(f"— {footer}")
    text = "\n".join(parts).replace("**", "")
    if len(text) > _MAX_LEN:
        text = text[:_MAX_LEN - 2] + " …"
    try:
        resp = requests.post(SIGNAL_SEND_URL, json={"message": text},
                             headers={"Authorization": SIGNAL_AUTH_TOKEN}, timeout=10)
        return resp.status_code < 300
    except requests.RequestException:
        return False

def send_news_alert(analysis, original_title, source_app, ml_score=None, forge=None, trader=None, decide=None):
    color_map = {"BULLISH": 0x00FF00, "BEARISH": 0xFF0000, "NEUTRAL": 0x3498DB}
    color = color_map.get(analysis.get("sentiment_label"), 0x95A5A6)

    # Title from the real analysis schema (sentiment_label / tickers / impact_score);
    # skip empties so we never render "None" for a macro event with no ticker.
    tickers = analysis.get("tickers") or []
    head_bits = [b for b in (analysis.get("sentiment_label"), tickers[0] if tickers else None) if b]
    embed = {
        "title": f"{' '.join(head_bits)} | {analysis.get('impact_score')}/10".lstrip(),
        "description": f"**{original_title}**",
        "color": color,
        "fields": [
            {"name": "Category", "value": analysis.get("category", "N/A"), "inline": True},
            {"name": "Confidence", "value": f"{analysis.get('confidence')}/10", "inline": True}
        ],
        "footer": {"text": f"Market Mind AI · {source_app}" if source_app else "Market Mind AI"}
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
    if decide:
        # G5 decide pipe. Annotation only — the forge's blended conviction and
        # the governor's verdict for this name, so an alert reads against the
        # same shortlist the human already has.
        conv = decide.get("conviction")
        bits = [f"conv {conv:.2f}" if isinstance(conv, (int, float)) else "conv ?"]
        if decide.get("position"):
            bits.append(f"#{decide['position']}/{decide.get('n', '?')}")
        if decide.get("actionable"):
            size, stop = decide.get("size_eur"), decide.get("stop_price")
            if size:
                bits.append(f"€{size:,.0f} stop {stop}")
        elif decide.get("block"):
            bits.append(f"⛔ {decide['block']}")
        embed["fields"].append({
            "name": f"Forge decide ({decide.get('as_of', '?')})",
            "value": " | ".join(bits),
            "inline": True
        })
    if trader:
        # Trader-call pipe (V2). Annotation only — the morning's call for this
        # name, so the human connects the alert to what they were told pre-open.
        conf = trader.get("confidence")
        conf_txt = f" {conf:.2f}" if isinstance(conf, (int, float)) else ""
        embed["fields"].append({
            "name": "Trader call",
            "value": f"{trader.get('call')}{conf_txt} ({trader.get('as_of')})",
            "inline": True
        })
    # Return whether the alert actually reached the channel — the V3 alert
    # ledger stamps alerted_at only on a real send (send-then-mark).
    return _post(embed)

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
    _post(embed)


def send_system_alert(title, message, color=0xFF0000):
    embed = {
        "title": title,
        "description": message,
        "color": color,
        "footer": {"text": "Market Mind System"}
    }
    _post(embed, username="Market Mind System")
