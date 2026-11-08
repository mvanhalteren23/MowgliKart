#!/usr/bin/env bash
# Shared helpers for the MowgliKart Mac scripts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACKAGE="com.legacyvr.kartclient"
ACTIVITY="com.unity3d.player.UnityPlayerNativeActivityPico"
MAX_HEADSETS=8

# Finds the Unity editor binary: $UNITY_PATH, else the newest 2020.3 under Unity Hub, else any Hub editor.
find_unity() {
  if [[ -n "${UNITY_PATH:-}" && -x "$UNITY_PATH" ]]; then echo "$UNITY_PATH"; return; fi
  local hub="/Applications/Unity/Hub/Editor"
  if [[ -d "$hub" ]]; then
    local pick
    pick="$(ls -1 "$hub" 2>/dev/null | grep -E '^2020\.3' | sort -V | tail -1 || true)"
    [[ -z "$pick" ]] && pick="$(ls -1 "$hub" 2>/dev/null | sort -V | tail -1 || true)"
    if [[ -n "$pick" && -x "$hub/$pick/Unity.app/Contents/MacOS/Unity" ]]; then
      echo "$hub/$pick/Unity.app/Contents/MacOS/Unity"; return
    fi
  fi
  echo "ERROR: Unity not found. Install Unity 2020.3 LTS via Unity Hub (with Mac + Android modules) or set UNITY_PATH." >&2
  exit 1
}

# Echoes serials of attached adb devices that are in the 'device' state (USB or Wi-Fi).
adb_serials() {
  adb devices | awk 'NR>1 && $2=="device" {print $1}'
}

require_adb() {
  command -v adb >/dev/null 2>&1 || {
    echo "ERROR: adb not found. Install it with:  brew install --cask android-platform-tools" >&2
    exit 1
  }
}
