import os

import requests

# Signal relay (signal-bot on this box) — replaces the Discord webhook. Same
# embed dicts are built by the senders below; _post renders them to plain text.
SIGNAL_SEND_URL = os.getenv("SIGNAL_SEND_URL", "http://127.0.0.1:8420/send")
SIGNAL_AUTH_TOKEN = os.getenv("SIGNAL_AUTH_TOKEN", "")

_MAX_LEN = 4000  # relay caps messages at 4096


def _post(embed, username="Market Mind", channel="default"):
    """Render an embed dict to text and send it via the Signal relay.
    channel="low" routes to the low-priority group (relay falls back to the
    main group when unconfigured). Returns True on a 2xx (send-then-mark
    callers rely on this)."""
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
        resp = requests.post(SIGNAL_SEND_URL, json={"message": text, "channel": channel},
                             headers={"Authorization": SIGNAL_AUTH_TOKEN}, timeout=10)
        return resp.status_code < 300
    except requests.RequestException:
        return False

# send_news_alert (one card per story, low group) lived here until 2026-09-04.
# It fired 2-7 times a day and the human read none of them: a card per story is
# the wrong shape for news that is consulted, not reacted to. The windowed
# summary in scripts/news_rollup.py replaced it and carries the same forge
# rank / trader-call annotations at summary granularity.


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
    _post(embed, channel="low")


def send_system_alert(title, message, color=0xFF0000):
    embed = {
        "title": title,
        "description": message,
        "color": color,
        "footer": {"text": "Market Mind System"}
    }
    _post(embed, username="Market Mind System")
