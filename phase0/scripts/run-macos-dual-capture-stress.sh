#!/usr/bin/env bash
# macOS port of run-dual-capture-stress.ps1.  Captures an afplay tone process
# and the mic with probes/macos-dual-capture/DualCapture while repeatedly
# starting a whisper.cpp large-v3-turbo transcription and force-killing it
# mid-run.  The capture summary then shows whether heavy AI load or worker
# crashes caused discontinuities.
#
# Usage (from phase0/): scripts/run-macos-dual-capture-stress.sh [seconds] [kill-every] [name]
# Runs under caffeinate so idle sleep cannot interrupt it; a manual sleep
# (lid close, Apple menu > Sleep) still will, and invalidates the run.

set -euo pipefail
cd "$(dirname "$0")/.."
duration="${1:-3600}"
kill_every="${2:-30}"
name="${3:-stress-60min}"

out=artifacts/capture/macos
mkdir -p "$out"
probe=probes/macos-dual-capture/DualCapture
whisper=upstream/whisper.cpp/build/bin/whisper-cli
model=models/whisper/ggml-large-v3-turbo-q5_0.bin
sample=upstream/whisper.cpp/samples/jfk.wav
# WORKER_THREADS overrides the default of every physical core.
threads="${WORKER_THREADS:-$(sysctl -n hw.physicalcpu)}"
tone="$out/$name-tone.wav"

# 880 Hz mono tone long enough to outlast the capture.
python3 -I - "$tone" "$((duration + 20))" <<'EOF'
import math, struct, sys, wave
path, seconds = sys.argv[1], int(sys.argv[2])
rate = 48000
# One second holds exactly 880 cycles, so repeating it keeps the phase continuous.
second = struct.pack("<%dh" % rate, *(int(0.2 * 32767 * math.sin(2 * math.pi * 880 * i / rate)) for i in range(rate)))
with wave.open(path, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    for _ in range(seconds):
        w.writeframes(second)
EOF

# TONE_VOLUME=0 keeps the speakers silent; afplay still renders into the tap.
afplay -v "${TONE_VOLUME:-0.2}" "$tone" & tone_pid=$!
sleep 2
caffeinate -i "$probe" "$tone_pid" "$out/$name" "$duration" \
  >"$out/$name.stdout.txt" 2>"$out/$name.stderr.txt" & capture_pid=$!

log="$out/$name-workers.jsonl"
: >"$log"
start=$(date +%s)
while kill -0 "$capture_pid" 2>/dev/null; do
  # -ng keeps the load on the CPU, matching the Windows stress run.
  "$whisper" -m "$model" -f "$sample" -t "$threads" -nt -ng \
    >"$out/$name-worker.stdout.txt" 2>"$out/$name-worker.stderr.txt" & worker=$!
  hi=$(( kill_every - 2 > 3 ? kill_every - 2 : 3 ))
  lifetime=$(( 2 + RANDOM % (hi - 2) ))
  sleep "$lifetime"
  state=completed
  if kill -0 "$worker" 2>/dev/null; then kill -9 "$worker"; state=killed; fi
  code=0; wait "$worker" || code=$?
  printf '{"at_s": %d, "lifetime_s": %d, "state": "%s", "exit_code": %d}\n' \
    "$(( $(date +%s) - start ))" "$lifetime" "$state" "$code" >>"$log"
  sleep $(( kill_every - lifetime > 0 ? kill_every - lifetime : 0 ))
done
capture_code=0; wait "$capture_pid" || capture_code=$?
kill "$tone_pid" 2>/dev/null || true

echo "capture_exit_code=$capture_code worker_runs=$(wc -l <"$log" | tr -d ' ') worker_killed=$(grep -c killed "$log" || true)"
cat "$out/$name-summary.json"
