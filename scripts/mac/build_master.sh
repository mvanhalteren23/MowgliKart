#!/usr/bin/env bash
# Builds the macOS operator app:  Builds/macOS/MowgliKartMaster.app
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
UNITY="$(find_unity)"
echo "Using Unity: $UNITY"
"$UNITY" -batchmode -quit -nographics -projectPath "$REPO_ROOT" \
  -buildTarget StandaloneOSX \
  -logFile - \
  -executeMethod LegacyVR.KartRacing.EditorTools.MowgliKartBuild.BuildMacMasterCli
echo "Built: $REPO_ROOT/Builds/macOS/MowgliKartMaster.app"
