#!/bin/sh
# Restarts tipitaka_app when /api/health does not answer three times in a row (a hung or overloaded server: nginx
# returns 502 but systemd sees a running process). Run as root by tipitaka_app_watchdog.timer every 2 minutes.
# Install: /usr/local/bin/tipitaka_app_watchdog (scripts/deploy.sh). Log: journalctl -t tipitaka_app_watchdog
URL=http://127.0.0.1:8402/api/health
systemctl is-active -q tipitaka_app || exit 0 # stopped on purpose, or restarting
for i in 1 2 3; do
  curl -fsS -m 10 -o /dev/null "$URL" && exit 0
  sleep 5
done
logger -t tipitaka_app_watchdog "no answer from $URL three times: restarting tipitaka_app"
systemctl restart tipitaka_app
