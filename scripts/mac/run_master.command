#!/usr/bin/env bash
# Launches the built macOS operator app. Double-clickable as run_master.command too.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
APP="$REPO_ROOT/Builds/macOS/MowgliKartMaster.app"
[[ -d "$APP" ]] || { echo "Not built yet. Run scripts/mac/build_master.sh first." >&2; exit 1; }
# Locally built apps are not quarantined, but an app copied from another Mac or downloaded is.
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
echo "Mac LAN IP(s):"; ifconfig | awk '/^[a-z0-9]+:/ {i=$1} /inet 192\.168\.|inet 10\.|inet 172\.(1[6-9]|2[0-9]|3[01])\./ {print "  " i " " $2}'
echo "Allow incoming connections / Local Network access if macOS asks (needed for UDP 7777, 47777 and TCP 8080)."
open "$APP"
