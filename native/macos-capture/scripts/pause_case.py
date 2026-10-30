#!/usr/bin/env python3
"""Real-audio pause test: run from the Claude app's terminal pane, under phase0/scripts/run-muted.sh.

Plays 880 Hz for 6 s, a marker of 2000 Hz for 6 s, then 880 Hz again, and pauses across the marker.
Passes if no marker reached any chunk, the tone either side did, and the paused span is recorded.
Usage: pause_case.py <helper> <ffmpeg> <work dir>
"""
import json, math, os, struct, subprocess, sys, time, wave

helper, ffmpeg, work = sys.argv[1:4]
os.makedirs(work, exist_ok=True)
RATE = 8000
tone_file = os.path.join(work, "tones.wav")
with wave.open(tone_file, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    for second in range(20):
        f = 2000 if 6 <= second < 12 else 880
        w.writeframes(struct.pack("<%dh" % RATE, *(int(9000 * math.sin(2 * math.pi * f * i / RATE)) for i in range(RATE))))

player = subprocess.Popen(["afplay", tone_file])
worker = subprocess.Popen([helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)

def send(id_, **fields):
    worker.stdin.write(json.dumps({"id": id_, **fields}) + "\n")
    worker.stdin.flush()
    while True:
        message = json.loads(worker.stdout.readline())
        if message.get("type") == "ack":
            print(id_, message); return message

time.sleep(0.5)
out = os.path.join(work, "meeting")
send("o", name="open", sessionId="s1", outputDir=out, source=[player.pid], mic="default")
send("s", name="start")
started = time.time()
time.sleep(4.8)
t0 = time.time(); pause = send("p", name="pause"); print("pause ms", (time.time() - t0) * 1000)
assert send("p", name="pause") == pause, "retry must return the first reply"
time.sleep(7.5)
send("r", name="resume")
time.sleep(5.0)
send("x", name="stop")
worker.wait(); player.kill()

def goertzel(samples, f, rate):
    w = 2 * math.pi * f / rate; c = 2 * math.cos(w); a = b = 0.0
    for s in samples:
        a, b = s + c * a - b, a
    return math.sqrt(max(a * a + b * b - c * a * b, 0)) / max(len(samples), 1)

failed = False
for track in ("meeting", "microphone"):
    folder = os.path.join(out, "audio", track)
    lines = [json.loads(l) for l in open(os.path.join(folder, "chunks.log"))]
    print(track, [(l["file"], round(l["startNs"] / 1e9, 2), round(l["endNs"] / 1e9, 2), l["openReason"], l["closeReason"]) for l in lines])
    assert not [f for f in os.listdir(folder) if f.endswith(".part")], "left a .part"
    if track != "meeting":
        continue
    tones = marker = 0
    for l in lines:
        wav = os.path.join(work, l["file"] + ".wav")
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", os.path.join(folder, l["file"]), "-ac", "1", "-ar", "16000", wav], check=True)
        with wave.open(wav) as w:
            n = w.getnframes()
            pcm = struct.unpack("<%dh" % n, w.readframes(n))
        duration = n / 16000
        expected = (l["endNs"] - l["startNs"]) / 1e9
        if abs(duration - expected) > 0.03:
            print("DURATION MISMATCH", l["file"], duration, expected); failed = True
        for i in range(0, n, 8000):
            part = pcm[i:i + 8000]
            tones = max(tones, goertzel(part, 880, 16000))
            marker = max(marker, goertzel(part, 2000, 16000))
    print("880 level", round(tones, 1), "2000 level", round(marker, 1))
    if tones < 500 or marker > tones * 0.03:
        print("TONE CHECK FAILED"); failed = True

print(open(os.path.join(out, "audio", "session.log")).read())
print("PASS" if not failed else "FAIL")
