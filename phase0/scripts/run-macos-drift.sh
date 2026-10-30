#!/usr/bin/env bash
# Gate 0 long drift run on macOS: an afplay 880 Hz tone plus the default mic for
# [seconds] (default 8 h) with no other load, then the alignment analysis.
# Run it under scripts/run-muted.sh from the Claude desktop app's terminal pane
# (System Audio Recording, see the probe README).  The tap captures the process
# tree at start, so one afplay must last the whole run: the tone is written at
# 8 kHz and compressed to AAC to keep the file small.
#
# Usage (from phase0/): scripts/run-muted.sh scripts/run-macos-drift.sh [seconds] [name]

set -euo pipefail
cd "$(dirname "$0")/.."
duration="${1:-28800}"
name="${2:-drift-8h}"
out=artifacts/capture/macos
mkdir -p "$out"
tone="$out/$name-tone"

python3 -I - "$tone.wav" "$((duration + 60))" <<'EOF'
import math, struct, sys, wave
path, seconds = sys.argv[1], int(sys.argv[2])
rate = 8000
# One second holds exactly 880 cycles, so repeating it keeps the phase continuous.
second = struct.pack("<%dh" % rate, *(int(0.2 * 32767 * math.sin(2 * math.pi * 880 * i / rate)) for i in range(rate)))
with wave.open(path, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    for _ in range(seconds):
        w.writeframes(second)
EOF
afconvert -f m4af -d aac "$tone.wav" "$tone.m4a"
rm "$tone.wav"

afplay -v 0.2 "$tone.m4a" & tone_pid=$!
sleep 2
echo "drift run $name: ${duration} s from $(date +%H:%M:%S), tone pid $tone_pid"
code=0
caffeinate -i probes/macos-dual-capture/DualCapture "$tone_pid" "$out/$name" "$duration" \
  >"$out/$name.stdout.txt" 2>"$out/$name.stderr.txt" || code=$?
kill "$tone_pid" 2>/dev/null || true
echo "capture exit $code at $(date +%H:%M:%S)"
cat "$out/$name-summary.json"
python3 -I scripts/analyze_alignment.py "$out/$name-timing.csv" 5 | tee "$out/$name-alignment.json"
