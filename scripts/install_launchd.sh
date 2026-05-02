#!/usr/bin/env bash
# Install (or reinstall) the launchd agent that runs the daily ingestion
# pipeline every weekday at 6 AM.
#
# Run once, after the first successful manual `python -m ingest.daily_run`.
#
# Idempotent: re-running unloads + reloads the agent.
set -euo pipefail

LABEL="com.trakautomations.daily-run"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKERS_DIR="$REPO_ROOT/workers"
VENV_PY="$WORKERS_DIR/.venv/bin/python"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/trak-automations"

if [[ ! -x "$VENV_PY" ]]; then
  echo "Error: $VENV_PY not found." >&2
  echo "Create the venv first:" >&2
  echo "  cd workers && python3.11 -m venv .venv && source .venv/bin/activate && pip install -e ." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_DEST")"

cat > "$PLIST_DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$VENV_PY</string>
    <string>-m</string>
    <string>ingest.daily_run</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$WORKERS_DIR</string>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd-stdout.log</string>

  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd-stderr.log</string>

  <!-- Mon-Fri at 06:00 -->
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
  </array>

  <!-- If the Mac was asleep at 6 AM, fire as soon as it wakes -->
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

# Unload first if already loaded — makes the script idempotent
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Installed: $PLIST_DEST"
echo "Schedule:  Mon-Fri 06:00"
echo "Logs:      $LOG_DIR/"
echo
echo "Verify with:"
echo "  launchctl list | grep $LABEL"
echo
echo "Trigger manually (without waiting for 6 AM):"
echo "  launchctl start $LABEL"
echo
echo "Uninstall:"
echo "  bash scripts/uninstall_launchd.sh"
