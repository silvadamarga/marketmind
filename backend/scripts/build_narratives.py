"""Narrative rebuild — the card layer on a schedule instead of a button.

Until 2026-07-31 `build_narratives` only fired from the frontend's
POST /api/narratives/build, so the cards were as fresh as the last press. It
then ran weekly (Mondays); since 2026-11-21 the Narratives tab is a bull/bear
board whose tallies count the last 72h, so it runs daily at 04:20 UTC with
synthesis, and again 13:20 UTC on weekdays (08:20 ET, before the US open)
with --no-synth.

Cost: the deterministic pass is free — pure aggregation of facts Gemini already
extracted at ingest. Only the gated synthesis pass calls the API, capped at
MAX_SYNTH_PER_BUILD (5) per run and SYNTH_DEBOUNCE_HOURS (48) per story, and only
the 04:20 run synthesizes: ceiling 5 calls/day (~$0.011 each, so <= ~$1.7/month).

04:15 is taken by the notifier system's own backup, and the two share a disk:
    20 4 * * *   cd /path/to/backend && venv/bin/python scripts/build_narratives.py
    20 13 * * 1-5 cd /path/to/backend && venv/bin/python scripts/build_narratives.py --no-synth
Local test: venv/bin/python scripts/build_narratives.py --no-synth
"""

import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import narrative

UTC = datetime.timezone.utc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-synth", action="store_true",
                    help="deterministic cards only — no Gemini calls at all")
    args = ap.parse_args()

    stamp = datetime.datetime.now(UTC).isoformat(timespec="seconds")
    try:
        out = narrative.build_narratives(synthesize=not args.no_synth)
    except Exception as e:
        # Loud and non-zero for cron mail; the cards keep their previous version,
        # since every write in build_narratives is an upsert inside its own commit.
        print(f"{stamp} ❌ narrative build failed: {e}")
        return 1

    print(f"{stamp} 📚 cards {out['built']} · synthesized {out['synthesized']}"
          f"/{out['gated_candidates']} gated"
          + (" (synthesis off)" if args.no_synth else ""))
    for etype, ent, reason in out.get("synth_entities", []):
        print(f"    🧠 {etype}/{ent} ({reason})")
    # A build that produces no cards at all means the gate found no entity with
    # MIN_EVENTS in WINDOW_DAYS — on a live feed that is an ingestion failure,
    # not a quiet week.
    return 0 if out["built"] else 1


if __name__ == "__main__":
    sys.exit(main())
