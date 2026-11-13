#!/usr/bin/env bash
# Proves scripts/m1.sh refuses to start when files are missing. Run: bash scripts/m1.test.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fake="$(mktemp -d)"
trap 'rm -rf "$fake"' EXIT
mkdir -p "$fake/repo/scripts" "$fake/repo/native/macos-capture/build" "$fake/home/scrb-dev-assets/config"
cp "$here/m1.sh" "$fake/repo/scripts/m1.sh"
home="$fake/home"
# The script looks for node under HOME, so give the fake HOME the node that runs this test.
mkdir -p "$home/.local/share/scrb-node/current"
ln -s "$(dirname "$(command -v node)")" "$home/.local/share/scrb-node/current/bin"

run() {  # sets out and code
  set +e
  out="$(HOME="$home" bash "$fake/repo/scripts/m1.sh" 2>&1)"
  code=$?
  set -e
}
expect_fail() {  # expect_fail <text the message must name>...
  [[ $code -ne 0 ]] || { echo "FAIL: exited 0"; exit 1; }
  for want in "$@"; do
    grep -qF -- "$want" <<<"$out" || { echo "FAIL: message lacks '$want'"; echo "$out"; exit 1; }
  done
}

# 1. Nothing exists.
run
expect_fail "capture helper" "live.json" "final-pass.json"

# 2. Helper and configs exist, but a config names a missing tool or model.
printf '#!/bin/sh\n' >"$fake/repo/native/macos-capture/build/scrb-capture"
chmod +x "$fake/repo/native/macos-capture/build/scrb-capture"
touch "$fake/present.bin"
cat >"$home/scrb-dev-assets/config/live.json" <<JSON
{"tools":{"whisperServer":"$fake/present.bin"},"models":{"speechLive":"$fake/no-such-live-model.bin"}}
JSON
cat >"$home/scrb-dev-assets/config/final-pass.json" <<JSON
{"tools":{"ffmpeg":"$fake/no-such-ffmpeg"},"models":{"speechFinal":"$fake/present.bin"}}
JSON
run
expect_fail "no-such-live-model.bin" "no-such-ffmpeg"

# 3. A config that is not JSON.
echo 'not json' >"$home/scrb-dev-assets/config/live.json"
run
expect_fail "not valid JSON"
echo ok
