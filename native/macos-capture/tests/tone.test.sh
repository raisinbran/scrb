#!/usr/bin/env bash
# Proves the tone helpers use SCRB_TEST_TONE_FILE / SCRB_TEST_TONE_VOLUME and leave the default alone.
# afplay is a stub on PATH that records its arguments; no audio plays. Run: bash native/macos-capture/tests/tone.test.sh
set -euo pipefail
scripts="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
printf '#!/bin/sh\nprintf "%%s|" "$@" >> "$TONE_LOG"\necho >> "$TONE_LOG"\n' >"$tmp/bin/afplay"
chmod +x "$tmp/bin/afplay"
export PATH="$tmp/bin:$PATH" TONE_LOG="$tmp/log"
owner="$tmp/My Song.mp3"

expect() {  # expect <label> <expected afplay args, | terminated> <env assignments...>
  local label="$1" want="$2"; shift 2
  for lang in node python; do
    : >"$TONE_LOG"
    if [ "$lang" = node ]; then
      env -u SCRB_TEST_TONE_FILE -u SCRB_TEST_TONE_VOLUME "$@" node --input-type=module -e \
        "import {playTone} from '$scripts/tone.mjs'; await new Promise(r=>playTone('gen.wav').on('exit',r))"
    else
      env -u SCRB_TEST_TONE_FILE -u SCRB_TEST_TONE_VOLUME "$@" python3 -c \
        "import sys; sys.path.insert(0,'$scripts'); from tone import play_tone; play_tone('gen.wav', override=True).wait()"
    fi
    [ "$(cat "$TONE_LOG")" = "$want" ] || { echo "FAIL $label ($lang): got '$(cat "$TONE_LOG")' want '$want'"; exit 1; }
  done
  echo "ok   $label"
}

expect "unset keeps the default" "gen.wav|"
expect "file override, gentle default volume" "-v|0.3|$owner|" SCRB_TEST_TONE_FILE="$owner"
expect "file override, chosen volume" "-v|0.1|$owner|" SCRB_TEST_TONE_FILE="$owner" SCRB_TEST_TONE_VOLUME=0.1
expect "volume alone keeps the file" "-v|0.2|gen.wav|" SCRB_TEST_TONE_VOLUME=0.2

# A script that asserts a frequency must never take the owner's file (python without override, node generated).
: >"$TONE_LOG"
SCRB_TEST_TONE_FILE="$owner" python3 -c \
  "import sys; sys.path.insert(0,'$scripts'); from tone import play_tone; play_tone('gen.wav').wait()"
SCRB_TEST_TONE_FILE="$owner" node --input-type=module -e \
  "import {playGeneratedTone} from '$scripts/tone.mjs'; await new Promise(r=>playGeneratedTone('gen.wav').on('exit',r))"
[ "$(cat "$TONE_LOG")" = "$(printf 'gen.wav|\ngen.wav|')" ] || { echo "FAIL generated tones took the override"; exit 1; }
echo "ok   generated tones ignore the file override"
