#!/bin/bash
# Syncs .caddy-hosts entries into macOS /etc/hosts.
# Entries managed by this script are tagged with "# caddy-local".
#
# Usage: sudo ./sync-hosts.sh
# Or install as a cron job: see install-sync.sh

CADDY_HOSTS="$(dirname "$0")/.caddy-hosts"
MARKER="# caddy-local"

if [ ! -f "$CADDY_HOSTS" ]; then
  exit 0
fi

# Remove all existing caddy-local entries from /etc/hosts
grep -v "$MARKER" /etc/hosts > /tmp/hosts-clean

# Append current caddy-local entries
cat /tmp/hosts-clean > /etc/hosts
cat "$CADDY_HOSTS" >> /etc/hosts

rm -f /tmp/hosts-clean
