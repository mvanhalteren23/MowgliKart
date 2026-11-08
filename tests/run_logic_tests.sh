#!/usr/bin/env bash
# Runs the logic test-suite: the project's REAL runtime scripts against in-memory Unity/Mirror/Pico/Addressables fakes.
# Needs the mono C# compiler (macOS: `brew install mono`; Ubuntu: `sudo apt-get install mono-mcs mono-runtime`).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/mowgli_logic_tests"; mkdir -p "$OUT"
SRC=$(find "$ROOT/Assets/Scripts" -name '*.cs')
mcs -debug -nowarn:0169,0414,0649,0219,0067,0618,0108,0114,0162,0168 -r:System.dll -r:System.Core.dll \
  -out:"$OUT/logic_tests.exe" "$ROOT"/tests/LogicTests/*.cs $SRC
mono --debug "$OUT/logic_tests.exe"
