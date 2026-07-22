#!/usr/bin/env bash
# Install / refresh the market-mind system configs on the VPS.
#
# Run ON THE BOX, from the repo root, with sudo password at hand:
#   cd /var/www/market-mind && bash deploy/install-system.sh
#
# Idempotent: diffs each target first, installs only what changed, and
# validates (visudo -c, nginx -t) before anything takes effect. The git
# deploy (forge deploy/deploy-vps.sh) ships these files; this script is the
# manual, sudo-requiring step that activates them — deliberate, since the
# deploy key's NOPASSWD sudo is scoped to service restart only.
#
# External deps NOT captured here (box-level, survive rebuilds via their own
# tooling): certbot certs, the `signal_bot` limit_req zone in
# /etc/nginx/nginx.conf (belongs to the notifier system), the crontab
# backup-notifier.sh line (signal-bot's).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHANGED=0

install_file() { # src dest mode
  if sudo diff -q "$2" "$HERE/$1" >/dev/null 2>&1; then
    echo "unchanged: $2"
    return 0
  fi
  echo "installing: $2"
  sudo install -m "$3" -o root -g root "$HERE/$1" "$2"
  CHANGED=1
}

# --- systemd unit ---------------------------------------------------------
install_file market_mind.service /etc/systemd/system/market_mind.service 0644
if [ "$CHANGED" -eq 1 ]; then
  sudo systemctl daemon-reload
  echo "daemon-reload done. Restart when ready: sudo systemctl restart market_mind.service"
fi

# --- sudoers (validate BEFORE it can lock you out) ------------------------
if ! sudo diff -q /etc/sudoers.d/marketmind-restart "$HERE/sudoers-marketmind-restart" >/dev/null 2>&1; then
  sudo visudo -cf "$HERE/sudoers-marketmind-restart"
  sudo install -m 0440 -o root -g root "$HERE/sudoers-marketmind-restart" /etc/sudoers.d/marketmind-restart
  echo "installed: /etc/sudoers.d/marketmind-restart"
else
  echo "unchanged: /etc/sudoers.d/marketmind-restart"
fi

# --- nginx site (test config before reload) -------------------------------
NGINX_CHANGED=0
if ! sudo diff -q /etc/nginx/sites-available/market-mind "$HERE/nginx-market-mind.conf" >/dev/null 2>&1; then
  sudo install -m 0644 -o root -g root "$HERE/nginx-market-mind.conf" /etc/nginx/sites-available/market-mind
  NGINX_CHANGED=1
fi
sudo ln -sf /etc/nginx/sites-available/market-mind /etc/nginx/sites-enabled/market-mind
if [ "$NGINX_CHANGED" -eq 1 ]; then
  sudo nginx -t && sudo systemctl reload nginx
  echo "nginx reloaded"
else
  echo "unchanged: nginx site"
fi

# --- crontab (market-mind lines only; never touch other systems' lines) ---
CRON_NOW="$(crontab -l 2>/dev/null || true)"
CRON_KEEP="$(printf '%s\n' "$CRON_NOW" | grep -v 'market-mind' || true)"
CRON_NEW="$(printf '%s\n%s\n' "$CRON_KEEP" "$(cat "$HERE/crontab-market-mind")" | sed '/^$/d')"
if [ "$CRON_NEW" != "$(printf '%s\n' "$CRON_NOW" | sed '/^$/d')" ]; then
  printf '%s\n' "$CRON_NEW" | crontab -
  echo "crontab updated"
else
  echo "unchanged: crontab"
fi

echo "done."
