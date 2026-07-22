"""Deliver the forge PREP digest card to Discord (pre-open beat).

Division of labour: the forge COMPUTES the card at pipeline time (post-close,
~23:30 Riga — it owns the lake / book / eval ledgers) and rsyncs
forge_prep_card.json into this backend dir. This script — run by cron ~1h before
US open — just POSTs it. The VPS is the always-on delivery host for the one beat
the forge laptop may sleep through; VERDICT stays forge-direct.

The card is ~16h old by delivery (computed 23:30, sent 15:30 next day) — that is
correct, not stale: a pre-open card acts on the prior close. Beyond STALE_HOURS
the forge missed a night, so we tag the card rather than suppress it (an absent
card is itself the dead-job signal; a tagged one still carries yesterday's read).

Cron (production, UTC — Riga 15:30 ~= 12:30 UTC summer / 13:30 winter):
    30 12 * * 1-5 cd /var/www/market-mind/backend && venv/bin/python scripts/send_digest.py

Local test (no POST): venv/bin/python scripts/send_digest.py --dry-run
"""
import argparse
import datetime
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DISCORD_WEBHOOK_URL

CARD_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "forge_prep_card.json")
STALE_HOURS = 30          # normal lag ~16h; beyond this the forge skipped a night
ORANGE = 0xE67E22


def build_embed(payload):
    lines = payload.get("lines", [])
    color = payload.get("color", 0x607D8B)
    stale_note = ""
    gen = payload.get("generated_at")
    if gen:
        try:
            age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(gen)
            hrs = age.total_seconds() / 3600
            if hrs > STALE_HOURS:
                stale_note = f"\n\n⚠️ forge card ~{hrs / 24:.0f}d old — pipeline may be dark"
                color = ORANGE
        except ValueError:
            pass
    embed = {
        "title": payload.get("title", "Forge PREP"),
        "description": ("\n".join(lines) + stale_note)[:4096],
        "color": color,
        "footer": {"text": "Compute Forge · pre-open"},
    }
    if payload.get("fields"):
        embed["fields"] = payload["fields"][:25]
    return embed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the embed, don't POST")
    args = ap.parse_args()

    if not os.path.exists(CARD_PATH):
        print("no forge_prep_card.json — forge has not pushed one", file=sys.stderr)
        return 1
    with open(CARD_PATH) as f:
        payload = json.load(f)
    embed = build_embed(payload)

    if args.dry_run:
        print(json.dumps(embed, indent=2, ensure_ascii=False))
        return 0
    if not DISCORD_WEBHOOK_URL:
        print("DISCORD_WEBHOOK_URL unset", file=sys.stderr)
        return 1
    try:
        r = requests.post(DISCORD_WEBHOOK_URL,
                          json={"embeds": [embed], "username": "Compute Forge"}, timeout=10)
    except requests.RequestException as e:
        print(f"post failed: {e}", file=sys.stderr)
        return 1
    print(f"sent: {r.status_code}")
    return 0 if r.status_code < 300 else 1


if __name__ == "__main__":
    sys.exit(main())
