#!/usr/bin/env bash
# Proves scripts/m1.sh refuses to start when files are missing. Run: bash scripts/m1.test.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fake="$(mktemp -d)"
trap 'rm -rf "$fake"' EXIT
mkdir -p "$fake/repo/scripts" "$fake/repo/native/macos-capture/build" "$fake/home/scrb-dev-assets/config"
cp "$here/m1.sh" "$fake/repo/scripts/m1.sh"
home="$fake/home"
# The script looks for node and npm under HOME: give the fake HOME the real node and a stub npm
# that records how it was launched instead of starting Electron.
bin="$home/.local/share/scrb-node/current/bin"
mkdir -p "$bin"
ln -s "$(command -v node)" "$bin/node"
cat >"$bin/npm" <<STUB
#!/bin/sh
{
  echo "args=\$*"
  echo "helper=\$SCRB_CAPTURE_HELPER"
  echo "live=\$SCRB_LIVE_CONFIG"
  echo "final=\$SCRB_FINAL_PASS_CONFIG"
  echo "cwd=\$(pwd -P)"
} >"$fake/npm.log"
STUB
chmod +x "$bin/npm"

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

# 2. Helper exists; configs are complete except as each case below says.
printf '#!/bin/sh\n' >"$fake/repo/native/macos-capture/build/scrb-capture"
chmod +x "$fake/repo/native/macos-capture/build/scrb-capture"
touch "$fake/present.bin"
p="$fake/present.bin"
cfg="$home/scrb-dev-assets/config"
good_live="{\"tools\":{\"whisperServer\":\"$p\",\"whisperVad\":\"$p\"},\"models\":{\"speechLive\":\"$p\",\"vad\":\"$p\"}}"
good_final="{\"tools\":{\"ffmpeg\":\"$p\",\"ffprobe\":\"$p\",\"whisperCli\":\"$p\",\"sherpaSidecar\":\"$p\"},\"models\":{\"speechFinal\":\"$p\",\"vad\":\"$p\",\"segmentation\":\"$p\",\"embedding\":\"$p\"}}"
echo "$good_live" >"$cfg/live.json"
echo "$good_final" >"$cfg/final-pass.json"

# Complete configs: the script must launch npm with the right arguments and variables.
run
[[ $code -eq 0 ]] || { echo "FAIL: complete setup exited $code"; echo "$out"; exit 1; }
for want in "args=start -w @scrb/desktop" \
  "helper=$fake/repo/native/macos-capture/build/scrb-capture" \
  "live=$cfg/live.json" "final=$cfg/final-pass.json" "cwd=$(cd "$fake/repo" && pwd -P)"; do
  grep -qxF -- "$want" "$fake/npm.log" || { echo "FAIL: npm launch lacks '$want'"; cat "$fake/npm.log"; exit 1; }
done

# Each case below breaks one thing.
echo '{"tools":{},"models":{}}' >"$cfg/live.json"
run
expect_fail 'live config lacks a non-empty "tools.whisperServer"' '"models.vad"'

echo "${good_final/\"embedding\":\"$p\"/\"embedding\":\"\"}" >"$cfg/final-pass.json"
echo "$good_live" >"$cfg/live.json"
run
expect_fail 'final-pass config lacks a non-empty "models.embedding"'

echo "${good_final/\"ffmpeg\":\"$p\"/\"ffmpeg\":\"$fake/no-such-ffmpeg\"}" >"$cfg/final-pass.json"
run
expect_fail '"tools.ffmpeg" points to a missing file' "no-such-ffmpeg"

echo 'not json' >"$cfg/live.json"
run
expect_fail "live config is not valid JSON"
echo ok
