#!/usr/bin/env bash
# macOS build against sherpa-onnx built from upstream/sherpa-onnx (see HANDOFF.md).
set -euo pipefail
cd "$(dirname "$0")"
sherpa=../../upstream/sherpa-onnx/build/install
clang++ -O2 -std=c++17 -I"$sherpa/include" LiveDiarize.cpp -L"$sherpa/lib" -lsherpa-onnx-c-api \
  -Wl,-rpath,"$(cd "$sherpa/lib" && pwd)" -o LiveDiarize
