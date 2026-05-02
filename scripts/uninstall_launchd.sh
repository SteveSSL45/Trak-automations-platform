#!/usr/bin/env bash
# Unload + remove the daily-run launchd agent.
set -euo pipefail

LABEL="com.trakautomations.daily-run"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ -f "$PLIST_DEST" ]]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm "$PLIST_DEST"
  echo "Removed: $PLIST_DEST"
else
  echo "Not installed (no plist at $PLIST_DEST)"
fi
