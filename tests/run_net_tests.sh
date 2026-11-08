#!/usr/bin/env bash
# REAL socket tests (no Unity): Mirror's KCP transport with the project's settings, 1 server + 8 clients over UDP.
# Needs the .NET SDK (macOS: `brew install --cask dotnet-sdk`; Ubuntu: `sudo apt-get install dotnet-sdk-8.0`).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
dotnet run --project "$ROOT/tests/NetTests/NetTests.csproj" -c Release
