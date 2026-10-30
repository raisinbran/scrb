#!/usr/bin/env bash
# Builds build/scrb-capture. Needs libopus at the commit pinned in phase0/MANIFEST.md, built with
# the CMake in phase0/tools/venv. Run from native/macos-capture/.
set -euo pipefail
cd "$(dirname "$0")"
opus=../../phase0/upstream/opus
tools=../../phase0/tools/venv/bin
if [[ ! -f build/opus/libopus.a ]]; then
  "$tools/cmake" -S "$opus" -B build/opus -G Ninja -DCMAKE_MAKE_PROGRAM="$PWD/$tools/ninja" \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DOPUS_BUILD_SHARED_LIBRARY=OFF -DOPUS_BUILD_TESTING=OFF -DOPUS_BUILD_PROGRAMS=OFF >/dev/null
  "$tools/cmake" --build build/opus >/dev/null
fi
clang -O2 -c src/rt.c -I"$opus/include" -o build/rt.o
swiftc -O -import-objc-header src/rt.h -Xcc "-I$opus/include" src/main.swift src/Capture.swift src/Chunks.swift \
  build/rt.o build/opus/libopus.a -framework CoreAudio -framework AudioToolbox -framework IOKit -o "${OUT:-build/scrb-capture}"
