#!/bin/bash
# Installs a cron job that syncs .caddy-hosts to /etc/hosts every 30 seconds.
# Run once: sudo ./install-sync.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/sync-hosts.sh"

chmod +x "$SYNC_SCRIPT"

# Create a launchd plist for frequent sync
PLIST="/Library/LaunchDaemons/com.caddy-local.sync-hosts.plist"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.caddy-local.sync-hosts</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SYNC_SCRIPT</string>
    </array>
    <key>WatchPaths</key>
    <array>
        <string>$SCRIPT_DIR/.caddy-hosts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl load "$PLIST"

echo "Installed! Hosts will sync automatically when .caddy-hosts changes."
echo "To uninstall: sudo launchctl unload $PLIST && sudo rm $PLIST"
