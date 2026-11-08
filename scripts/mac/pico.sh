#!/usr/bin/env bash
# Control up to 8 Pico headsets over adb (USB or Wi-Fi) from the Mac.
#   pico.sh devices                list attached headsets
#   pico.sh wifi                   switch every USB headset to adb-over-Wi-Fi (then unplug the cables)
#   pico.sh connect <ip> [ip...]   adb connect to headsets already in Wi-Fi mode
#   pico.sh install [apk]          install/update the client on every headset (parallel)
#   pico.sh launch | stop          start / force-stop the kart client on every headset
#   pico.sh reboot                 reboot every headset
#   pico.sh logs [serial]          stream filtered logcat (Unity/Mirror/Pico kiosk)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_adb

each_headset() { # usage: each_headset <function> ; runs in parallel and waits
  local fn="$1" serials=() count s
  # bash 3.2 (macOS default) has no mapfile: read line by line instead.
  while IFS= read -r s; do [[ -n "$s" ]] && serials+=("$s"); done < <(adb_serials)
  count="${#serials[@]}"
  [[ "$count" -gt 0 ]] || { echo "No headsets attached (adb devices is empty)." >&2; return 1; }
  if [[ "$count" -gt "$MAX_HEADSETS" ]]; then
    echo "WARNING: $count devices attached; the master supports $MAX_HEADSETS. Acting on the first $MAX_HEADSETS." >&2
    serials=("${serials[@]:0:$MAX_HEADSETS}")
  fi
  local pids=() rc=0
  for s in "${serials[@]}"; do "$fn" "$s" & pids+=($!); done
  for p in "${pids[@]}"; do wait "$p" || rc=1; done
  return $rc
}

do_install() { local out; out="$(adb -s "$1" install -r -g "$APK" 2>&1 | tail -1)"; echo "[$1] $out"; [[ "$out" == *Success* ]]; }
do_launch()  { adb -s "$1" shell am start -n "$PACKAGE/$ACTIVITY" >/dev/null && echo "[$1] launched"; }
do_stop()    { adb -s "$1" shell am force-stop "$PACKAGE" && echo "[$1] stopped"; }
do_reboot()  { adb -s "$1" reboot && echo "[$1] rebooting"; }

cmd="${1:-help}"; shift || true
case "$cmd" in
  devices) adb devices -l ;;
  wifi)
    for s in $(adb_serials | grep -v ':'); do
      ip="$(adb -s "$s" shell ip -f inet addr show wlan0 | awk '/inet /{sub("/.*","",$2); print $2}' | head -1)"
      [[ -n "$ip" ]] || { echo "[$s] no Wi-Fi address; is the headset on the Wi-Fi?"; continue; }
      adb -s "$s" tcpip 5555 >/dev/null; sleep 1; adb connect "$ip:5555"
    done ;;
  connect) [[ $# -gt 0 ]] || { echo "usage: pico.sh connect <ip> [ip...]"; exit 1; }
           for ip in "$@"; do adb connect "${ip}:5555"; done ;;
  install) APK="${1:-$REPO_ROOT/Builds/Android/MowgliKartClient.apk}"
           [[ -f "$APK" ]] || { echo "APK not found: $APK (run scripts/mac/build_apk.sh)" >&2; exit 1; }
           export APK; export -f do_install; each_headset do_install ;;
  launch) each_headset do_launch ;;
  stop)   each_headset do_stop ;;
  reboot) each_headset do_reboot ;;
  logs)   s="${1:-$(adb_serials | head -1)}"; adb -s "$s" logcat -v time Unity:I Mirror:I PicoKioskController:I '*:S' ;;
  *) sed -n '2,10p' "$0" ;;
esac
