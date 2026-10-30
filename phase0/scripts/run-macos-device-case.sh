#!/usr/bin/env bash
# Gate 0 device-state case on macOS.  Captures a quiet afplay tone plus the
# default input with probes/macos-dual-capture/DualCapture and prompts the
# person at the Mac to change a device (or sleep the Mac) at ACT_AT seconds.
# The probe has no device-change recovery: the point is to record what
# happens.  Run from the Claude desktop app's terminal pane (see the probe
# README for the System Audio Recording permission).
#
# Usage (from phase0/): [ACTION=cmd] [RESTORE=cmd] scripts/run-macos-device-case.sh <case> [seconds] [act-at]
# ACTION runs at act-at instead of prompting (e.g. probes/macos-dual-capture/SetDefaultDevice
# output "Steam Streaming Speakers"); RESTORE runs after the capture ends.
# Output: artifacts/capture/macos/devices/<case>-{app,mic}.wav, -timing.csv,
#         -summary.json, -devices.txt, -analysis.txt

set -u
cd "$(dirname "$0")/.."
case_name="$1"
seconds="${2:-180}"
act_at="${3:-60}"
out=artifacts/capture/macos/devices
mkdir -p "$out"
prefix="$out/$case_name"
rm -f "$prefix"-*

devices() {  # default input and output device names
  system_profiler SPAudioDataType -json 2>/dev/null | python3 -I -c '
import json, sys
for d in json.load(sys.stdin)["SPAudioDataType"][0]["_items"]:
    roles = [r for k, r in (("coreaudio_default_audio_input_device", "input"),
                            ("coreaudio_default_audio_output_device", "output")) if d.get(k) == "spaudio_yes"]
    if roles: print("  default " + "+".join(roles) + ": " + d["_name"])'
}
{ echo "before ($(date +%H:%M:%S)):"; devices; } | tee "$prefix-devices.txt"

python3 -I - "$prefix-tone.wav" "$((seconds + 30))" <<'EOF'
import math, struct, sys, wave
path, seconds = sys.argv[1], int(sys.argv[2])
rate = 48000
second = struct.pack("<%dh" % rate, *(int(0.2 * 32767 * math.sin(2 * math.pi * 880 * i / rate)) for i in range(rate)))
with wave.open(path, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    for _ in range(seconds):
        w.writeframes(second)
EOF

# Quiet tone: the tap records afplay's own level, so 0.1 still leaves a clear signal.
afplay -v "${TONE_VOLUME:-0.1}" "$prefix-tone.wav" & tone=$!
sleep 1
start=$(date +%s)
probes/macos-dual-capture/DualCapture "$tone" "$prefix" "$seconds" >"$prefix.stdout.txt" 2>"$prefix.stderr.txt" & probe=$!

state=running; warned=0; acted=0
while kill -0 "$probe" 2>/dev/null; do
  t=$(( $(date +%s) - start ))
  # Live timer on one line (the person at the Mac may have no seconds clock).
  if (( !acted )); then printf '\r  %3d s elapsed -- ACTION IN %3d s   ' "$t" $(( act_at - t ))
  else printf '\r  %3d s elapsed -- capture ends in %3d s   ' "$t" $(( seconds - t )); fi
  if (( t >= act_at - 10 && !warned )); then warned=1; printf '\a'; fi
  if (( t >= act_at && !acted )); then
    acted=1; echo
    if [[ -n "${ACTION:-}" ]]; then echo ">>> action at $(date +%H:%M:%S): $(eval "$ACTION" 2>&1)" | tee "$prefix-action.txt"
    else printf '\a'; echo ">>> DO THE ACTION NOW ($(date +%H:%M:%S))"; fi
  fi
  if (( t > seconds + 90 )); then state=hung; kill -9 "$probe"; break; fi
  sleep 1
done
code=0; wait "$probe" || code=$?
[[ $state == running ]] && state=exited
kill "$tone" 2>/dev/null
[[ -n "${RESTORE:-}" ]] && echo "restore: $(eval "$RESTORE" 2>&1)"
{ echo "after ($(date +%H:%M:%S)):"; devices; } | tee -a "$prefix-devices.txt"
echo "probe $state, exit code $code, $(( $(date +%s) - start )) s wall" | tee "$prefix-analysis.txt"
tail -3 "$prefix.stderr.txt" | sed 's/^/stderr: /' | tee -a "$prefix-analysis.txt"

python3 -I - "$prefix" <<'EOF' | tee -a "$prefix-analysis.txt"
import array, json, math, os, sys, wave
prefix = sys.argv[1]
if os.path.exists(prefix + "-summary.json"):
    s = json.load(open(prefix + "-summary.json"))
    for k in ("app", "mic"):
        if k in s:
            t = s[k]
            print(f"{k}: {t['seconds_by_frames']:.1f} s, discontinuities {t['discontinuities']}, "
                  f"padded {t['gap_fill_frames'] / t['rate'] * 1000:.0f} ms, longest wait {t['max_inter_arrival_ms']:.0f} ms")
else:
    print("no summary.json (probe did not finish normally)")
# Per 10 s window: app-track tone peak and mic RMS.  WAV headers may be
# unfinished if the probe died, so read the raw samples after the header.
for k in ("app", "mic"):
    path = f"{prefix}-{k}.wav"
    if not os.path.exists(path):
        print(f"{k}: no file"); continue
    raw = open(path, "rb").read()[44:]
    a = array.array("h", raw[: len(raw) // 2 * 2])
    rate = 48000
    try:
        rate = wave.open(path).getframerate()
    except Exception:
        pass
    win = rate * 10
    cells = []
    for i in range(0, len(a), win):
        x = a[i:i + win]
        cells.append(str(max(map(abs, x))) if k == "app" else str(round(math.sqrt(sum(v * v for v in x) / len(x)))))
    print(f"{k} per 10 s ({'peak' if k == 'app' else 'rms'}): " + " ".join(cells))
EOF
