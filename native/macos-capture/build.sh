#!/usr/bin/env bash
# Builds build/scrb-capture. Needs libopus at the commit pinned in phase0/MANIFEST.md and the CMake
# in tools/venv, both from scripts/dev-assets.sh under SCRB_DEV_ASSETS (default ~/scrb-dev-assets).
# Run from native/macos-capture/. SWIFT_FLAGS=-DFAULT_HOOKS adds the
# test-only faultStopStream command.
set -euo pipefail
cd "$(dirname "$0")"
assets="${SCRB_DEV_ASSETS:-$HOME/scrb-dev-assets}"
opus="$assets/upstream/opus"
tools="$assets/tools/venv/bin"
if [[ ! -f build/opus/libopus.a ]]; then
  "$tools/cmake" -S "$opus" -B build/opus -G Ninja -DCMAKE_MAKE_PROGRAM="$tools/ninja" \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DOPUS_BUILD_SHARED_LIBRARY=OFF -DOPUS_BUILD_TESTING=OFF -DOPUS_BUILD_PROGRAMS=OFF >/dev/null
  "$tools/cmake" --build build/opus >/dev/null
fi
clang -O2 -c src/rt.c -I"$opus/include" -o build/rt.o
clang -O2 -c src/LiveRing.c -o build/live-ring.o
swiftc -O ${SWIFT_FLAGS:-} -import-objc-header src/rt.h -Xcc "-I$opus/include" src/main.swift src/Capture.swift src/Chunks.swift \
  src/Resample.swift src/LiveFeed.swift src/Permission.swift src/Devices.swift src/MicProbe.swift build/rt.o build/live-ring.o build/opus/libopus.a \
  -framework CoreAudio -framework AudioToolbox -framework AVFoundation -framework IOKit -o "${OUT:-build/scrb-capture}"
