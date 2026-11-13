#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
opus="${SCRB_DEV_ASSETS:-$HOME/scrb-dev-assets}/upstream/opus"
mkdir -p build
clang -O2 -c src/LiveRing.c -o build/live-ring-test.o
swiftc -O -parse-as-library -import-objc-header src/LiveRing.h src/LiveFeed.swift tests/LiveFeedTests.swift build/live-ring-test.o -o build/live-feed-tests
build/live-feed-tests
# Compile the production Track/Session definitions without the command-loop entry point.
{ head -n 5 src/main.swift; sed -n '/^\/\/ Detection adds/,/^if CommandLine.arguments.contains/p' src/main.swift | sed '$d'; echo "let session = Session()"; } > build/TrackSessionTestsSource.swift
swiftc -O -parse-as-library -import-objc-header src/rt.h -Xcc "-I$opus/include" build/TrackSessionTestsSource.swift src/Capture.swift src/Chunks.swift src/Resample.swift src/LiveFeed.swift src/Permission.swift src/Devices.swift src/MicProbe.swift src/VoiceMic.swift tests/TrackFeedTests.swift build/rt.o build/live-ring-test.o build/opus/libopus.a -framework CoreAudio -framework AudioToolbox -framework AVFoundation -framework IOKit -o build/track-feed-tests
build/track-feed-tests
