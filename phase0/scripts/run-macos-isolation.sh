#!/usr/bin/env bash
# Gate 0 isolation run on macOS (run from Terminal.app, which must have System
# Audio Recording permission).  The target afplay plays 880 Hz, an unrelated
# afplay plays 440 Hz; the app track must contain only 880 Hz.  Output is
# muted for the run (the tap records before the device volume) and restored
# afterwards.
#
# Usage (from phase0/): scripts/run-macos-isolation.sh [seconds]

set -u
cd "$(dirname "$0")/.."
seconds="${1:-60}"
out=artifacts/capture/macos
mkdir -p "$out"

was_muted=$(osascript -e 'output muted of (get volume settings)')
restore() {
  pkill -f "$out/isolation-tone-" 2>/dev/null
  [[ "$was_muted" == true ]] || osascript -e 'set volume without output muted'
  echo "speakers restored (muted=$(osascript -e 'output muted of (get volume settings)'))"
}
trap restore EXIT
osascript -e 'set volume with output muted'
[[ "$(osascript -e 'output muted of (get volume settings)')" == true ]] || { echo "could not mute; stopping"; exit 1; }

for f in 880 440; do
  python3 -I - "$out/isolation-tone-$f.wav" "$f" "$((seconds + 10))" <<'EOF'
import math, struct, sys, wave
path, freq, seconds = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
rate = 48000
second = struct.pack("<%dh" % rate, *(int(0.3 * 32767 * math.sin(2 * math.pi * freq * i / rate)) for i in range(rate)))
with wave.open(path, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    for _ in range(seconds):
        w.writeframes(second)
EOF
done

afplay "$out/isolation-tone-880.wav" & target=$!
afplay "$out/isolation-tone-440.wav" &
sleep 1
echo "capturing $seconds s from pid $target ..."
probes/macos-dual-capture/DualCapture "$target" "$out/isolation" "$seconds" nomic | tee "$out/isolation.stdout.txt"

python3 -I - "$out/isolation-app.wav" <<'EOF' | tee "$out/isolation-analysis.txt"
import array, math, sys, wave
w = wave.open(sys.argv[1]); rate = w.getframerate()
a = array.array("h", w.readframes(w.getnframes()))
def power(freq, x):  # Goertzel
    k = 2 * math.cos(2 * math.pi * freq / rate); s1 = s2 = 0.0
    for v in x: s1, s2 = v + k * s1 - s2, s1
    return s1 * s1 + s2 * s2 - k * s1 * s2
x = a[rate:rate * 11]  # 10 s window after the first second
peak = max(map(abs, a)) if a else 0
p880, p440 = power(880, x), power(440, x)
ratio_db = 10 * math.log10((p880 + 1e-9) / (p440 + 1e-9))
print(f"app track peak={peak}  880Hz/440Hz = {ratio_db:.1f} dB")
if peak == 0:
    print("RESULT: silent app track - permission not granted to this app")
elif ratio_db > 30:
    print("RESULT: PASS - only the target app's tone is on the app track")
else:
    print("RESULT: FAIL - unrelated app audio leaked into the app track")
EOF
