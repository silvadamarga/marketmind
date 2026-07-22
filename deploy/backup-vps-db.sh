#!/usr/bin/env bash
# Nightly on-box backup of the live market_mind.db (ops-plan phase 3).
#
# sqlite .backup (WAL-safe, same trick as the forge pull) -> gzip ->
# ~/backups/market-mind/, prune to KEEP days. Independent of the forge's
# weekday pull, so weekends are covered too. Installed by the cron line in
# deploy/crontab-market-mind.
set -euo pipefail

DB="/var/www/market-mind/backend/market_mind.db"
OUT_DIR="$HOME/backups/market-mind"
KEEP=7
STAMP="$(date +%Y%m%d)"
OUT="$OUT_DIR/market_mind-$STAMP.db"

mkdir -p "$OUT_DIR"
sqlite3 "$DB" ".backup '$OUT.tmp'"
# Integrity-check the snapshot, not the live db.
sqlite3 "$OUT.tmp" "PRAGMA integrity_check;" | grep -qx ok || {
  echo "backup FAILED integrity_check, discarding" >&2
  rm -f "$OUT.tmp"
  exit 1
}
gzip -f "$OUT.tmp"
mv "$OUT.tmp.gz" "$OUT.gz"

# Prune: keep newest $KEEP
ls -1t "$OUT_DIR"/market_mind-*.db.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "ok: $OUT.gz ($(du -h "$OUT.gz" | cut -f1)), $(ls "$OUT_DIR" | wc -l) kept"
