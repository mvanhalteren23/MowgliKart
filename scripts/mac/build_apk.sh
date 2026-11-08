#!/usr/bin/env bash
# Builds the Pico headset client:  Builds/Android/MowgliKartClient.apk  (needs the Android Build Support module)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
UNITY="$(find_unity)"
echo "Using Unity: $UNITY"
"$UNITY" -batchmode -quit -nographics -projectPath "$REPO_ROOT" \
  -buildTarget Android \
  -logFile - \
  -executeMethod LegacyVR.KartRacing.EditorTools.MowgliKartBuild.BuildPicoClientCli
echo "Built: $REPO_ROOT/Builds/Android/MowgliKartClient.apk"
