#!/usr/bin/env bash
# Builds .bin/scrb-sherpa against an installed sherpa-onnx C API.
# SHERPA_ONNX_DIR is the install prefix (holds include/ and lib/).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
sherpa="${SHERPA_ONNX_DIR:?set SHERPA_ONNX_DIR to the sherpa-onnx install prefix}"
mkdir -p "$here/.bin"
clang++ -O2 -std=c++17 -I"$sherpa/include" "$here/native/scrb-sherpa.cpp" \
  -L"$sherpa/lib" -lsherpa-onnx-c-api -Wl,-rpath,"$sherpa/lib" -o "$here/.bin/scrb-sherpa"
