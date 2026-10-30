#!/usr/bin/env python3
"""Stop during a pause must not move the cutoff: nothing recorded after Pause may reach a chunk.

Run from the Claude app's terminal pane, under phase0/scripts/run-muted.sh.
Usage: stop_paused_case.py <helper> <work dir> <rounds>
"""
import json, math, os, struct, subprocess, sys, time, wave

helper, work, rounds = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(work, exist_ok=True)
RATE = 8000
tone_file = os.path.join(work, "tone.wav")
with wave.open(tone_file, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    one = struct.pack("<%dh" % RATE, *(int(9000 * math.sin(2 * math.pi * 880 * i / RATE)) for i in range(RATE)))
    for _ in range(rounds * 5 + 10):
        w.writeframes(one)

player = subprocess.Popen(["afplay", tone_file])
time.sleep(0.5)
leaks = 0
for n in range(rounds):
    worker = subprocess.Popen([helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)

    def send(id_, **fields):
        worker.stdin.write(json.dumps({"id": id_, **fields}) + "\n")
        worker.stdin.flush()
        while True:
            message = json.loads(worker.stdout.readline())
            if message.get("type") == "ack":
                return message

    out = os.path.join(work, "round%d" % n)
    send("o", name="open", sessionId="s", outputDir=out, source=[player.pid], mic="default")
    send("s", name="start")
    time.sleep(1.5)
    cutoff = send("p", name="pause")["atNs"]
    time.sleep(1.0)
    send("x", name="stop")
    worker.wait()
    for track in ("meeting", "microphone"):
        lines = [json.loads(l) for l in open(os.path.join(out, "audio", track, "chunks.log"))]
        past = [(l["file"], round((l["endNs"] - cutoff) / 1e6, 1)) for l in lines if l["endNs"] > cutoff]
        print(n, track, "chunks", len(lines), "past cutoff (file, ms)", past, flush=True)
        leaks += len(past) + max(len(lines) - 1, 0)
player.kill()
print("PASS" if leaks == 0 else "FAIL: %d leaks" % leaks)
sys.exit(1 if leaks else 0)
