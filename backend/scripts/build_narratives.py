"""Weekly narrative rebuild — the card layer on a schedule instead of a button.

Until now `build_narratives` only ever fired from the frontend's
POST /api/narratives/build, so the cards were as fresh as the last time someone
pressed it: on 2026-07-31 the newest card read `updated_at 2026-07-28`, covering
nothing in that day's news window. A story-so-far layer that trails the story by
three days is decoration.

Cadence is weekly, which the window sizes: cards gather WINDOW_DAYS (14) of
events, so a 7-day rebuild leaves a card at most half its own window stale.
SYNTH_DEBOUNCE_HOURS (48) never binds at this cadence.

Cost: the deterministic pass is free — pure aggregation of facts Gemini already
extracted at ingest. Only the gated synthesis pass calls the API, capped at
MAX_SYNTH_PER_BUILD (5) per run, so this job's ceiling is 5 calls/week (measured
~$0.011 each = ~$0.06/month; the whole Gemini bill ran $2.57 over the 30 days to
2026-07-31, 68% of it per-headline `analysis`). Run with --no-synth for a
zero-token rebuild.

Run from backend/ via cron on the production server, Mondays at 04:20 UTC —
04:15 is taken by the notifier system's own backup, and the two share a disk:
    20 4 * * 1 cd /path/to/backend && venv/bin/python scripts/build_narratives.py
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
